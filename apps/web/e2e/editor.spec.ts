import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

/** The text of the lines CodeMirror has drawn (it draws the lines near the screen). */
const drawn = (page: Page) =>
  page.locator('.cm-line').evaluateAll((lines) => lines.map((line) => line.textContent ?? ''));

/** Replaces the text with `text`, typed in one go (a paste's clipboard can't be built in Firefox). */
async function setText(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

test.describe('on a desktop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two panes need a wide screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.cm-content')).toBeVisible();
  });

  test('edits the sample in the Source pane', async ({ page }) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('Margaret hangs up.');
    await expect(page.locator('.cm-content')).toContainText('Margaret hangs up.');
    await expect(page.getByRole('textbox', { name: 'Source' })).toBeVisible();
  });

  test('colors the source by element', async ({ page }) => {
    const heading = page.locator('.cm-line.cm-f-scene_heading').first();
    await expect(heading).toContainText('INT. KITCHEN - NIGHT');
    const [color, weight] = await heading.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.color, style.fontWeight];
    });
    const goldenrod = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--heading)';
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
    expect(color).toBe(goldenrod);
    expect(Number(weight)).toBeGreaterThanOrEqual(700);
  });

  test('colors lines that scroll into view', async ({ page }) => {
    const scenes = Array.from(
      { length: 150 },
      (_, i) => `INT. ROOM ${i + 1} - DAY\n\nSomething happens in room ${i + 1}.\n`,
    );
    await setText(page, `${scenes.join('\n')}\nINT. THE LAST ROOM - NIGHT\n`);
    await page.keyboard.press('ControlOrMeta+End');
    const last = page.locator('.cm-line', { hasText: 'INT. THE LAST ROOM - NIGHT' });
    await expect(last).toHaveClass(/\bcm-f-scene_heading\b/);
  });

  test('starts a character cue with Tab on a blank line', async ({ page }) => {
    await setText(page, 'INT. HALL - DAY\n\n');
    await page.keyboard.press('Tab');
    await expect(page.locator('.cm-line').last()).toHaveText('@');
  });

  test('keeps the text and the undo history when the panes swap', async ({ page }) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('ZZZ');
    await expect(page.locator('.cm-content')).toContainText('ZZZ');
    await page
      .getByRole('tablist', { name: 'Right pane' })
      .getByRole('tab', { name: 'Source' })
      .click();
    await expect(
      page.getByRole('tablist', { name: 'Right pane' }).getByRole('tab', { name: 'Source' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toContainText('ZZZ');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+z');
    const lines = await drawn(page);
    expect(lines.join('\n')).not.toContain('ZZZ');
    // The editor is still at the end of the sample.
    expect(lines.findLast((line) => line !== '')).toBe(SAMPLE.trimEnd().split('\n').at(-1));
  });

  test('keeps the scroll position when the panes swap', async ({ page }) => {
    const lines = Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of the action.`);
    await setText(page, lines.join('\n\n'));
    const scroller = page.locator('.cm-scroller');
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await page.waitForTimeout(200);
    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(1000);
    await page
      .getByRole('tablist', { name: 'Right pane' })
      .getByRole('tab', { name: 'Source' })
      .click();
    await expect(
      page.getByRole('tablist', { name: 'Right pane' }).getByRole('tab', { name: 'Source' }),
    ).toHaveAttribute('aria-selected', 'true');
    // Within a line of where it was.
    await expect
      .poll(async () => Math.abs((await scroller.evaluate((el) => el.scrollTop)) - before))
      .toBeLessThan(25);
  });

  test('announces the element under the cursor', async ({ page }) => {
    await setText(page, 'INT. HALL - DAY\n\nMARGARET\nAre you there?');
    const announcer = page.locator('.announcer');
    await expect(announcer).toHaveText('Dialogue');
    await page.keyboard.press('ArrowUp');
    await expect(announcer).toHaveText('Character');
  });

  test('reads nothing on a blank line', async ({ page }) => {
    await setText(page, 'INT. HALL - DAY\n\n');
    await expect(page.locator('.announcer')).toHaveText('');
  });

  test('shows a ring around the editor when it has focus', async ({ page }) => {
    await page.locator('.cm-content').click();
    const ring = await page.locator('.cm-editor').evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('leaves the editor with Escape then Tab', async ({ page }) => {
    // CodeMirror's tab focus mode: Escape, then Tab, moves on instead of
    // indenting, so the keyboard is never trapped (WCAG 2.1.2).
    await page.locator('.cm-content').click();
    await expect(page.locator('.cm-content')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('.cm-content')).not.toBeFocused();
    await expect(page.locator('.cm-content')).toBeVisible();
    // Focus went on to another element, not nowhere.
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      return { body: el === document.body, inEditor: !!el?.closest('.cm-editor') };
    });
    expect(landed).toEqual({ body: false, inEditor: false });
  });

  test('has no accessibility violations while editing', async ({ page }) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n\nINT. HALL - DAY');
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await violations(page)).toEqual([]);
  });

  test.describe('with the list of names open', () => {
    async function openList(page: Page) {
      await setText(page, 'MARGARET\nHi.\n\n');
      await page.keyboard.type('MA');
      await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
    }

    test('has no accessibility violations in the dark theme', async ({ page }) => {
      await openList(page);
      expect(await violations(page)).toEqual([]);
    });

    test('has no accessibility violations in the light theme', async ({ page }) => {
      await page.getByRole('button', { name: 'Switch to light theme' }).click();
      await expect(page.locator('html')).toHaveClass(/\blight\b/);
      await openList(page);
      expect(await violations(page)).toEqual([]);
    });
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'one pane on a narrow screen');

  test('edits on a phone', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tablist', { name: 'Panes' }).getByRole('tab', { name: 'Source' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.type('On a phone.');
    await expect(page.locator('.cm-content')).toContainText('On a phone.');
  });

  test('has no accessibility violations in the Source tab on a phone', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tablist', { name: 'Panes' }).getByRole('tab', { name: 'Source' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await violations(page)).toEqual([]);
  });
});
