import { expect, type Page, test } from '@playwright/test';
import { editor, setText, showSource, start, wholeText } from './modules';

// A whole script replaced in one go (select all, then text typed as one composition, as Firefox
// does with an input method): the editor first takes the old text away, which changes the
// template the text names; the lint started again for the new template must wait until the
// composition ends, or its redraw would take the composed text with it (Task 4's open item).
const STAGE_PLAY =
  '# ACT ONE\n\n## Scene 1\n\nMargaret waits.\n\nMARGARET\n(quietly)\nHello?\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/';

test.beforeEach(async ({ page }) => {
  await start(page);
});

test('a stage play set over a stage play keeps its text', async ({ page }) => {
  await setText(page, STAGE_PLAY);
  await expect(editor(page)).toContainText('Margaret waits.');
  await setText(page, STAGE_PLAY.replace('waits.', 'waits, again.'));
  await expect(editor(page)).toContainText('Margaret waits, again.');
  await setText(page, STAGE_PLAY);
  await expect(editor(page)).toContainText('Margaret waits.');
});

test('after a change of window size too', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'a phone keeps its size');
  await setText(page, STAGE_PLAY);
  for (const width of [1280, 1440, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await setText(page, STAGE_PLAY);
    await expect(editor(page), `at ${width}px`).toContainText('Margaret waits.');
  }
});

// Classic Mode with an input method (Classic Mode design §10): nothing is rewritten while a
// composition runs, and once it ends the name or heading gets its capitals, and a key straight after
// loses nothing. Chromium's DevTools protocol composes as an input method does; the other engines
// have no way for a test to compose.
test.describe('Classic Mode and an input method', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'composed through Chromium’s protocol',
  );
  // An emulated Android reads Enter from the page's change, which a test's key doesn't make
  // (classic-phone.spec.ts); a real phone and input method are tried by hand (§15.5).
  test.skip(({ isMobile }) => !!isMobile, 'a desktop’s Enter');

  const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.';

  async function classic(page: Page) {
    await setText(page, SCRIPT);
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (wide) {
      await page
        .getByRole('group', { name: 'Writing mode' })
        .getByRole('button', { name: 'Classic' })
        .click();
    } else {
      await page.getByRole('button', { name: /^Writing mode: Fountain\./ }).click();
    }
    await expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
    const hint = page.locator('[data-classic-hint]');
    if (await hint.isVisible()) await hint.getByRole('button', { name: 'Got it' }).click();
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+End');
  }

  /** Composes `text` a letter at a time, as an input method shows it, then commits it. */
  async function compose(page: Page, text: string) {
    const cdp = await page.context().newCDPSession(page);
    for (let i = 1; i <= text.length; i++) {
      await cdp.send('Input.imeSetComposition', {
        text: text.slice(0, i),
        selectionStart: i,
        selectionEnd: i,
      });
    }
    await cdp.send('Input.insertText', { text });
    await cdp.detach();
  }

  test('names and heading capitals after a composition', async ({ page }) => {
    await classic(page);
    await page.keyboard.press('Tab');
    await compose(page, 'june');
    await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\nJUNE`);
    await page.keyboard.press('Tab');
    await page.keyboard.type('Hi.');
    await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\nJUNE\nHi.`);
    // Back to Action, and a heading composed there.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Choose an element' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Along the row from Character: Transition, then Scene heading.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await compose(page, 'ext. road');
    await expect.poll(() => wholeText(page)).toMatch(/\n\nEXT\. ROAD$/);
  });

  test('text isn’t lost at Enter', async ({ page }) => {
    await classic(page);
    await page.keyboard.press('Tab');
    await compose(page, 'dale');
    // Enter at once, as the composition ends.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Here.');
    await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\nDALE\nHere.`);
  });
});
