import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { closeSettings, openSettings, runCommand, setText, settingsDialog, start } from './modules';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

test.describe('on a desktop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two panes need a wide screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tablist', { name: 'Inspector' })).toBeVisible();
  });

  test('shows the editor on the left and the Inspector, on Script, on the right', async ({
    page,
  }) => {
    // The left pane is the editor, with no tabs of its own (fresh-look design §3.2).
    await expect(page.getByRole('tablist')).toHaveCount(1);
    const editor = page.getByRole('region', { name: 'Source' });
    await expect(editor).toContainText('Title: The Call');
    await expect(editor.getByRole('textbox', { name: 'Source' })).toBeVisible();
    await expect(page.locator('[data-pane="left"] [data-tour="source"]')).toBeVisible();
    const inspector = page.getByRole('tablist', { name: 'Inspector' });
    await expect(inspector.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // A script's row (Call 14), then More.
    await expect(inspector.getByRole('tab')).toHaveText([
      'Script',
      'Outline',
      'Cards',
      'Stats',
      'Scaffold',
    ]);
    await expect(
      page.locator('[data-pane="right"]').getByRole('button', { name: 'More tabs' }),
    ).toBeVisible();
    await expect(page.locator('[data-pane="right"] [data-tour="script"]')).toBeVisible();
  });

  test('gives the editor a 36px header with its toggles as icon buttons', async ({ page }) => {
    const header = page.locator('[data-pane="left"] .head');
    const box = await header.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(36);
    expect(Math.round(box?.height ?? 99)).toBeLessThanOrEqual(38);
    const group = page.getByRole('group', { name: 'Source view' });
    for (const name of ['Line numbers', 'Typewriter', 'Sync scrolling']) {
      const button = group.getByRole('button', { name, exact: true });
      await expect(button).toHaveAttribute('aria-pressed', /^(true|false)$/);
      const b = await button.boundingBox();
      expect(`${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)}`, name).toBe('30x30');
      // An icon, not words.
      await expect(button).toHaveText('');
    }
    const numbers = group.getByRole('button', { name: 'Line numbers' });
    const before = await numbers.getAttribute('aria-pressed');
    await numbers.click();
    await expect(numbers).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  });

  test('Show Script keeps the editor on the left', async ({ page }) => {
    // The bug (fresh-look review 1): from the Inspector, Show Script took the editor's pane.
    await page.locator('#tab-right-outline').click();
    await page.locator('#panel-outline').focus();
    await runCommand(page, 'Show Script');
    await expect(page.locator('#tab-right-script')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-pane="left"] .cm-content')).toBeVisible();
    await expect(page.locator('[data-pane="left"] #panel-script')).toHaveCount(0);
    // And Show Source, from anywhere, only puts the cursor in the editor.
    await runCommand(page, 'Show Source');
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect(page.locator('#tab-right-script')).toHaveAttribute('aria-selected', 'true');
  });

  test('a view opened from the palette appears once, in the Inspector', async ({ page }) => {
    // The bug (fresh-look review 2): a palette view was added to both panes' strips.
    for (const [command, name] of [
      ['Show Cards', 'Cards'],
      ['Show Notes', 'Notes'],
      ['Show stats', 'Stats'],
      ['Show Problems', 'Problems'],
      ['Show Outline', 'Outline'],
    ] as const) {
      await runCommand(page, command);
      const tab = page.getByRole('tab', { name: new RegExp(`^${name}\\b`) });
      await expect(tab).toHaveCount(1);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(
        page
          .getByRole('tablist', { name: 'Inspector' })
          .getByRole('tab', { name: new RegExp(`^${name}\\b`) }),
      ).toHaveCount(1);
      await expect(page.locator('[data-pane="left"] .cm-content')).toBeVisible();
      await expect(page.locator('[data-pane="left"] [role="tabpanel"]')).toHaveCount(0);
    }
  });

  test("the Script's tools sit in the Inspector header", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const header = page.locator('[data-pane="right"] .head');
    const tools = header.locator('#inspector-tools');
    await expect(tools.getByRole('group', { name: 'Zoom' })).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Fit width' })).toBeVisible();
    await expect(tools.getByRole('button', { name: '100%' })).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Changes', exact: true })).toBeVisible();
    await expect(tools).toContainText('Page 1 of 2');
    // One row: the tools are level with the tabs, and nothing sits between the header and the page.
    const tab = await page.locator('#tab-right-script').boundingBox();
    const zoom = await tools.getByRole('group', { name: 'Zoom' }).boundingBox();
    expect(
      Math.abs((tab?.y ?? 0) + (tab?.height ?? 0) / 2 - ((zoom?.y ?? 0) + (zoom?.height ?? 0) / 2)),
    ).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-pane="right"] > .slim')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More tools' })).toHaveCount(0);
  });

  test("the Inspector's tabs fold into More when narrow, at 200% zoom too", async ({ page }) => {
    // At 200% zoom a 2048px window is 1024 CSS px wide; then the Inspector is made as narrow as
    // the divider lets it be.
    await page.setViewportSize({ width: 1024, height: 700 });
    const header = page.locator('[data-pane="right"] .head');
    const fits = () =>
      header.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const shown = [...el.querySelectorAll<HTMLElement>('[role="tab"], button')].filter(
          (b) => getComputedStyle(b).visibility !== 'hidden' && b.getClientRects().length > 0,
        );
        return {
          overflow: el.scrollWidth > el.clientWidth,
          clipped: shown
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.right > box.right + 0.5 || r.left < box.left - 0.5;
            })
            .map((b) => b.textContent?.trim()),
        };
      });
    // The tools fold into "⋯" first.
    const fold = page.getByRole('button', { name: 'More tools' });
    await expect(fold).toBeVisible();
    expect(await fits()).toEqual({ overflow: false, clipped: [] });
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('group', { name: 'View tools' });
    await expect(panel.getByRole('button', { name: 'Fit width' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(fold).toBeFocused();
    // Then tabs move into More from the right; the one showing stays.
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    await divider.focus();
    await page.keyboard.press('End');
    await expect(divider).toHaveAttribute('aria-valuenow', '75');
    const row = page.getByRole('tablist', { name: 'Inspector' }).getByRole('tab');
    await expect.poll(() => row.count()).toBeLessThan(5);
    await expect(row.first()).toHaveText('Script');
    expect(await fits()).toEqual({ overflow: false, clipped: [] });
    const visible = await row.allTextContents();
    await page.locator('[data-pane="right"]').getByRole('button', { name: 'More tabs' }).click();
    const menu = page.getByRole('menu', { name: 'More tabs' });
    const items = (await menu.getByRole('menuitem').allTextContents()).map((t) => t.trim());
    for (const name of ['Outline', 'Cards', 'Stats', 'Scaffold']) {
      expect(visible.map((t) => t.trim()).includes(name) || items.includes(name), name).toBe(true);
    }
    // A tab from More shows, and stays in the row while it shows.
    const hidden = ['Scaffold', 'Stats', 'Cards', 'Outline'].find((name) => items.includes(name));
    if (!hidden) throw new Error('no tab moved into More');
    await menu.getByRole('menuitem', { name: hidden, exact: true }).click();
    const chosen = page
      .getByRole('tablist', { name: 'Inspector' })
      .getByRole('tab', { name: hidden });
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await expect(chosen).toBeFocused();
    expect(await fits()).toEqual({ overflow: false, clipped: [] });
  });

  test('leaves room between the logo and the toolbar buttons', async ({ page }) => {
    const logo = await page.getByRole('img', { name: 'Drafter' }).boundingBox();
    const open = await page.getByRole('button', { name: 'Open', exact: true }).boundingBox();
    if (!logo || !open) throw new Error('the logo or the Open button is missing');
    expect(open.x - (logo.x + logo.width)).toBeGreaterThanOrEqual(24);
  });

  test('draws the actions as 16px icons in borderless 30px buttons, no coloured circles', async ({
    page,
  }) => {
    const banner = page.getByRole('banner');
    await expect(banner.locator('.round')).toHaveCount(0);
    const open = banner.getByRole('button', { name: 'Open', exact: true });
    const icon = await open.locator('.icon').boundingBox();
    const box = await open.boundingBox();
    if (!icon || !box) throw new Error('the Open button or its icon is missing');
    expect(Math.round(icon.width)).toBe(16);
    expect(Math.round(box.height)).toBe(30);
    await expect(open).toHaveCSS('border-top-width', '0px');
    await expect(open).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const name of ['Structure', 'Focus', 'Switch to light theme']) {
      const b = await banner.getByRole('button', { name, exact: true }).boundingBox();
      expect(`${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)}`, name).toBe('30x30');
    }
  });

  test('keeps the toolbar to one 44px bar', async ({ page }) => {
    const bar = await page.getByRole('banner').boundingBox();
    expect(bar?.height ?? 0).toBeGreaterThanOrEqual(40);
    expect(bar?.height ?? 99).toBeLessThanOrEqual(48);
  });

  test('puts the mark, the title, the chip, Open, Save, Export, the search, Structure, Focus, and Theme in that order', async ({
    page,
  }) => {
    const banner = page.getByRole('banner');
    const xs = [];
    for (const target of [
      banner.getByRole('button', { name: 'Drafter menu' }),
      banner.locator('.title'),
      banner.getByRole('button', { name: 'Sample: start your own' }),
      banner.getByRole('button', { name: 'Open', exact: true }),
      banner.getByRole('button', { name: 'Save', exact: true }),
      banner.getByRole('button', { name: 'Export', exact: true }),
      banner.getByRole('button', { name: /^Go to scene or command/ }),
      banner.getByRole('button', { name: 'Structure', exact: true }),
      banner.getByRole('button', { name: 'Focus', exact: true }),
      banner.getByRole('button', { name: 'Switch to light theme' }),
    ]) {
      xs.push((await target.boundingBox())?.x ?? -1);
    }
    expect(xs.every((x) => x >= 0)).toBe(true);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    await expect(banner.locator('.title')).toHaveText('The Call');
    // The template chip has left the toolbar: the Drafter menu and the status bar have it.
    await expect(banner.locator('.chip.template')).toHaveCount(0);
  });

  test('the title and chip truncate without pushing the search off-screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const long = `A ${'Very '.repeat(23)}Long Title`.slice(0, 120);
    expect(long).toHaveLength(120);
    await setText(page, `Title: ${long}\n\nINT. HALL - DAY\n\nShe waits.\n`);
    const title = page.getByRole('banner').locator('.title');
    await expect(title).toHaveText(long);
    await expect(title).toHaveAttribute('title', long);
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(title).toHaveCSS('text-overflow', 'ellipsis');
    const search = await page
      .getByRole('banner')
      .getByRole('button', { name: /^Go to scene or command/ })
      .boundingBox();
    expect(search).not.toBeNull();
    expect((search?.x ?? 0) + (search?.width ?? 0)).toBeLessThanOrEqual(1280);
    expect(search?.width ?? 0).toBeGreaterThanOrEqual(200);
    // Everything stays on one row.
    const bar = await page.getByRole('banner').boundingBox();
    expect(bar?.height ?? 99).toBeLessThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );
  });

  test('the sample chip offers New screenplay, New stage play, New Markdown document, and Open a file…', async ({
    page,
  }) => {
    const chip = page.getByRole('banner').getByRole('button', { name: 'Sample: start your own' });
    await expect(chip).toContainText('Sample');
    await expect(chip).toContainText('Start your own');
    await chip.click();
    const items = page.getByRole('menu').getByRole('menuitem');
    await expect(items).toHaveText([
      'New screenplay',
      'New stage play',
      'New Markdown document',
      'Open a file…',
    ]);
    await items.nth(1).click();
    await expect(page.locator('.cm-content')).toContainText('Title: Untitled Play');
    // A script of the writer's own: no sample chip, and the title says which script it is.
    await expect(chip).toHaveCount(0);
    await expect(page.getByRole('banner').locator('.title')).toHaveText('Untitled Play');
  });

  test('no element above the panes is taller than the toolbar', async ({ page }) => {
    const measure = () =>
      page.evaluate(() => {
        const bar = document.querySelector('header.toolbar') as HTMLElement;
        const top = document.querySelector('.top') as HTMLElement;
        return {
          bar: bar.getBoundingClientRect().height,
          others: Array.from(top.children)
            .filter((el) => el !== bar && !el.matches('[aria-label="Structure strip"], .strip'))
            .map((el) => ({
              what: el.className || el.tagName,
              height: el.getBoundingClientRect().height,
            }))
            .filter((o) => o.height > 0),
        };
      });
    // The sample: the sample bar has become the chip, so there is no banner above the panes.
    await expect(page.getByRole('region', { name: 'Sample' })).toHaveCount(0);
    const heights = await measure();
    expect(heights.others).toEqual([]);
    // The start-blank state is checked in first-samples.spec.ts, whose writer has met no sample.
  });

  test('chooses a tab with the keyboard, not by arrowing past it', async ({ page }) => {
    const right = page.getByRole('tablist', { name: 'Inspector' });
    await right.getByRole('tab', { name: 'Script' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(right.getByRole('tab', { name: 'Outline' })).toBeFocused();
    await expect(right.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(right.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The arrows wrap, and the editor stays where it is.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(right.getByRole('tab').last()).toBeFocused();
    await expect(page.locator('[data-pane="left"] .cm-content')).toBeVisible();
  });

  test('marks the selected tab in forced-colors mode', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced colors are emulated in Chromium');
    // Windows High Contrast drops backgrounds and box-shadows, which is how
    // the selected tab normally stands out; a border survives.
    await page.emulateMedia({ forcedColors: 'active' });
    const right = page.getByRole('tablist', { name: 'Inspector' });
    const bottomBorder = (name: string) =>
      right.getByRole('tab', { name }).evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.borderBottomStyle} ${style.borderBottomWidth}`;
      });
    expect(await bottomBorder('Script')).toMatch(/^solid [1-9]/);
    expect(await bottomBorder('Outline')).not.toMatch(/^solid/);
  });

  test('F6 moves between the editor and the Inspector', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Source' });
    await editor.click();
    await page.keyboard.press('F6');
    await expect(page.getByRole('tabpanel', { name: 'Script' })).toBeFocused();
    await page.keyboard.press('F6');
    await expect(editor).toBeFocused();
    // From another view in the Inspector, and from its tabs, too.
    await page.locator('#tab-right-outline').click();
    await expect(page.locator('#tab-right-outline')).toBeFocused();
    await page.keyboard.press('F6');
    await expect(editor).toBeFocused();
    await page.keyboard.press('F6');
    await expect(page.getByRole('tabpanel', { name: 'Outline' })).toBeFocused();
  });

  test('resizes the panes with the keyboard', async ({ page }) => {
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    const leftWidth = async () =>
      (await page.getByRole('region', { name: 'Source' }).boundingBox())?.width ?? 0;
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    const before = await leftWidth();
    await divider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(divider).toHaveAttribute('aria-valuenow', '45');
    await page.keyboard.press('Home');
    await expect(divider).toHaveAttribute('aria-valuenow', '25');
    await page.keyboard.press('End');
    await expect(divider).toHaveAttribute('aria-valuenow', '75');
    expect(await leftWidth()).toBeGreaterThan(before * 1.4);
  });

  test('switches to the light theme and remembers it', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });

  test('has no accessibility violations in either theme', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await violations(page)).toEqual([]);
  });

  test('shows a focus ring on every control', async ({ page, browserName }) => {
    // WebKit on macOS skips buttons on Tab, as Safari does; Option-Tab reaches them.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const unringed: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(tab);
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // The focus ring is a 2 px outline. (A box-shadow doesn't count: the
        // selected tab's underline is one, focused or not.) The editor's text
        // has no ring (design §8): the caret shows where focus is. Other
        // controls inside the editor, such as the search panel's, ring themselves.
        if (el.closest('.cm-content')) return null;
        const style = getComputedStyle(el);
        const ringed = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
        return {
          name: `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}`,
          ringed,
        };
      });
      if (!focused || seen.has(focused.name)) continue;
      seen.add(focused.name);
      if (!focused.ringed) unringed.push(focused.name);
    }
    expect(seen.size).toBeGreaterThan(8);
    expect(unringed).toEqual([]);
  });

  test('rings no element the app focuses for a screen reader, and not the editor', async ({
    page,
  }) => {
    // Design §8 (Call 11): a heading focused by script, so a screen reader reads it, needs no ring,
    // and the editor shows its focus with the caret, not a box around the whole pane.
    const outline = (el: Element) => getComputedStyle(el).outlineStyle;
    await page.evaluate(() => {
      const heading = document.createElement('h2');
      heading.id = 'focus-probe';
      heading.tabIndex = -1;
      heading.textContent = 'Characters';
      document.querySelector('main')?.append(heading);
      heading.focus({ focusVisible: true } as FocusOptions);
    });
    const heading = page.locator('#focus-probe');
    await expect(heading).toBeFocused();
    expect(await heading.evaluate(outline)).toBe('none');

    await page.locator('.cm-content').first().click();
    await expect(page.locator('.cm-editor.cm-focused').first()).toBeVisible();
    expect(await page.locator('.cm-editor').first().evaluate(outline)).toBe('none');
    expect(await page.locator('.cm-content').first().evaluate(outline)).toBe('none');
    // The caret (CodeMirror draws its own) is in the focus color, so where focus is shows.
    const caret = await page
      .locator('.cm-cursor-primary')
      .first()
      .evaluate((el) => getComputedStyle(el).borderLeftColor);
    const focus = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--focus)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(caret).toBe(focus);
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'one pane on a narrow screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tablist')).toBeVisible();
  });

  test('shows one pane with all four tabs, and More, on a phone', async ({ page }) => {
    await expect(page.getByRole('tablist')).toHaveCount(1);
    const tabs = page.getByRole('tablist', { name: 'Panes' }).getByRole('tab');
    await expect(tabs).toHaveText(['Source', 'Script', /^Problems(\s+\d+)?\s*$/, 'Outline']);
    await expect(page.getByRole('button', { name: 'More tabs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'Script' })).toBeVisible();
  });

  // How far the page is wider than the screen at `width`. It loads at that
  // width, as a phone would, and waits for images and fonts, so the logo has
  // settled. In mobile emulation the layout viewport (innerWidth) grows to fit
  // whatever overflows, so measure against the root's client width instead.
  async function overflowAt(page: Page, width: number) {
    await page.setViewportSize({ width, height: 740 });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Panes' })).toBeVisible();
    return page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
  }

  test('keeps More on a 375px screen, with the Problems count showing and a tab in the slot', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.reload();
    // Twelve headings with no time of day: a count of two digits on the Problems tab.
    const scenes = Array.from({ length: 12 }, (_, i) => `INT. ROOM ${i + 1}\n\nWaiting.\n`);
    await setText(page, scenes.join('\n'));
    const problems = page.getByRole('tab', { name: /^Problems/ });
    await expect(problems).toHaveText(/^Problems\s+\d\d$/);
    const more = page.getByRole('button', { name: 'More tabs' });
    await expect(more).toBeVisible();
    const box = await more.boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    // And with a tab in the slot: More is its chevron alone there, still named "More tabs".
    await runCommand(page, 'Show Cards');
    await expect(page.getByRole('tab', { name: 'Cards' })).toHaveAttribute('aria-selected', 'true');
    await expect(problems).toHaveText(/^Problems\s+\d\d$/);
    const filled = await more.boundingBox();
    expect((filled?.x ?? 0) + (filled?.width ?? 0)).toBeLessThanOrEqual(width);
  });

  test('fits a 360px screen without horizontal scrolling', async ({ page }) => {
    expect(await overflowAt(page, 360)).toBeLessThanOrEqual(0);
  });

  test('fits a 320px screen without horizontal scrolling, as WCAG reflow requires', async ({
    page,
  }) => {
    expect(await overflowAt(page, 320)).toBeLessThanOrEqual(0);
  });

  test('gives every toolbar button at least a 24px target on a phone', async ({ page }) => {
    const small: string[] = [];
    for (const button of await page.getByRole('banner').getByRole('button').all()) {
      const box = await button.boundingBox();
      if (!box || box.width < 24 || box.height < 24) {
        small.push(
          `${(await button.getAttribute('aria-label')) ?? (await button.textContent())}: ${box?.width}x${box?.height}`,
        );
      }
    }
    expect(small).toEqual([]);
  });

  test('sizes the search and theme buttons like the action icons', async ({ page }) => {
    const banner = page.getByRole('banner');
    const size = async (target: Locator) => {
      const box = await target.boundingBox();
      if (!box) throw new Error('a toolbar button is missing');
      return `${Math.round(box.width)}x${Math.round(box.height)}`;
    };
    const open = await size(banner.getByRole('button', { name: 'Open', exact: true }));
    expect(await size(banner.getByRole('button', { name: /^Go to scene or command/ }))).toBe(open);
    expect(await size(banner.getByRole('button', { name: /^Switch to (light|dark) theme$/ }))).toBe(
      open,
    );
  });

  test('has no accessibility violations on a phone', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });
});

// The tab row. On a phone (Phase 2 design §5.8): Source, Script, Problems, and Outline, then one
// slot for another tab (a module's), then More with the rest. On a wide screen the Inspector's
// (fresh-look design §3.3, Call 14): Script, Outline, Cards, Stats, Scaffold, then More with Notes,
// Problems, and the modules' tabs; a tab from More shows after the row while it is the one showing.
test.describe('the tab row', () => {
  /** Turns sample modules on in Settings. */
  async function turnOn(page: Page, names: string[]) {
    await openSettings(page);
    for (const name of names) {
      const toggle = settingsDialog(page).getByRole('switch', { name, exact: true });
      await toggle.click();
      await expect(toggle).toBeChecked();
    }
    await closeSettings(page);
  }
  /** The pane with the tabs: the Inspector, or a phone's one pane. */
  const tabsPane = (page: Page) => page.locator('[data-pane]').last();
  const row = (page: Page) => tabsPane(page).getByRole('tablist');
  const more = (page: Page) => tabsPane(page).getByRole('button', { name: 'More tabs' });
  const menu = (page: Page) => page.getByRole('menu', { name: 'More tabs' });

  test("shows the row's tabs, then More", async ({ page, isMobile }) => {
    await start(page);
    await expect(page.getByRole('tablist')).toHaveCount(1);
    await expect(row(page).getByRole('tab')).toHaveText(
      isMobile
        ? ['Source', 'Script', /^Problems(\s+\d+)?\s*$/, 'Outline']
        : ['Script', 'Outline', 'Cards', 'Stats', 'Scaffold'],
    );
    // The rest wait under More until one is chosen (controller ruling 4).
    await expect(page.getByRole('button', { name: 'More tabs' })).toHaveCount(1);
  });

  test('chooses a module tab from More, which then takes the slot', async ({ page, isMobile }) => {
    await start(page);
    await turnOn(page, ['Scene list', 'Cast']);
    const tabs = row(page).getByRole('tab');
    const own = isMobile
      ? [/^Source/, /^Script/, /^Problems/, /^Outline/]
      : [/^Script/, /^Outline/, /^Cards/, /^Stats/, /^Scaffold/];
    // No tab holds the slot until one is chosen; the others, then the modules' tabs, are in More.
    await expect(tabs).toHaveText(own);
    await more(page).click();
    await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(menu(page).getByRole('menuitem')).toHaveText(
      isMobile
        ? [
            'Cards',
            // The sample's open notes are counted in Notes' name.
            /^Notes, \d+ open$/,
            'Stats',
            'Scaffold',
            /^(Scenes|Cast)$/,
            /^(Scenes|Cast)$/,
          ]
        : [/^Notes, \d+ open$/, /^Problems(, \d+)?$/, /^(Scenes|Cast)$/, /^(Scenes|Cast)$/],
    );
    await menu(page).getByRole('menuitem', { name: 'Cast' }).click();
    await expect(menu(page)).toBeHidden();
    const chosen = row(page).getByRole('tab', { name: 'Cast' });
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await expect(chosen).toBeFocused();
    await expect(tabs).toHaveCount(own.length + 1);
    await row(page).getByRole('tab', { name: 'Outline' }).click();
    if (isMobile) {
      // Back to a core tab: the one chosen keeps the slot.
      await expect(tabs.last()).toHaveText('Cast');
    } else {
      // In the Inspector it goes back under More.
      await expect(tabs).toHaveText(own);
    }
  });

  test('More works from the keyboard, and Escape returns focus', async ({ page, isMobile }) => {
    await start(page);
    await turnOn(page, ['Scene list', 'Cast']);
    const items = menu(page).getByRole('menuitem');
    await more(page).focus();
    await page.keyboard.press('Enter');
    await expect(items.first()).toBeFocused();
    await expect(items.first()).toHaveText(isMobile ? 'Cards' : /^Notes/);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(more(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    const name = ((await items.nth(1).textContent()) ?? '').trim().replace(/, \d+$/, '');
    await page.keyboard.press('Enter');
    await expect(row(page).getByRole('tab', { name: new RegExp(`^${name}`) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test("a Markdown document's Inspector row is Preview and Stats", async ({ page, isMobile }) => {
    test.skip(isMobile, 'the Inspector is on a wide screen');
    await start(page);
    await runCommand(page, 'Open sample: Markdown');
    await expect(row(page).getByRole('tab')).toHaveText(['Preview', 'Stats']);
    await more(page).click();
    await expect(menu(page).getByRole('menuitem')).toHaveText([/^Problems/]);
    await page.keyboard.press('Escape');
  });
});
