import { expect, type Page, test } from '@playwright/test';
import { stored } from './modules';

const editor = (page: Page) => page.locator('.cm-content');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const toolbarField = (page: Page) => page.getByRole('button', { name: 'Go to scene or command' });

const SWITCHES = {
  matchSystem: 'Match system appearance',
  spellcheck: 'Spellcheck',
  strict: 'Strict Fountain',
  lineNumbers: 'Line numbers',
  typewriter: 'Typewriter scrolling',
  sprintSound: 'Sprint sound',
} as const;
const toggle = (page: Page, name: keyof typeof SWITCHES) =>
  dialog(page).getByRole('switch', { name: SWITCHES[name] });
const textSize = (page: Page) => dialog(page).getByLabel('Text size');

/** Loads the app and waits until the script is open and the settings have been read. */
async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('drafter');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              const ok = db.objectStoreNames.contains('projects');
              db.close();
              resolve(ok);
            };
          }),
      ),
    )
    .toBe(true);
}

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

async function openSettings(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(dialog(page)).toBeVisible();
}

async function closeSettings(page: Page) {
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(dialog(page)).toBeHidden();
}

/** Replaces the text with `text`, typed in one go. */
async function setText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/** The numbers in the leftmost gutter, if it is the line numbers. */
const numbers = (page: Page) =>
  page.locator('.cm-gutters .cm-gutter').first().locator('.cm-gutterElement');
const lineNumbersGutter = (page: Page) => page.locator('.cm-gutters > .cm-lineNumbers');
const barButton = (page: Page) => page.getByRole('button', { name: 'Line numbers', exact: true });

test.beforeEach(async ({ page }) => {
  await start(page);
  await showSource(page);
});

test.describe('the dialog', () => {
  test('opens with Mod+, and shows the defaults', async ({ page }) => {
    await openSettings(page);
    await expect(toggle(page, 'matchSystem')).not.toBeChecked();
    await expect(toggle(page, 'spellcheck')).toBeChecked();
    await expect(toggle(page, 'strict')).not.toBeChecked();
    await expect(toggle(page, 'lineNumbers')).not.toBeChecked();
    await expect(textSize(page)).toHaveValue('1');
    await expect(textSize(page).locator('option')).toHaveText([
      '90%',
      '100%',
      '115%',
      '130%',
      '150%',
    ]);
  });

  test('opens from the palette', async ({ page }) => {
    await toolbarField(page).click();
    await expect(palette(page)).toBeVisible();
    await palette(page).locator('input').fill('Settings');
    await palette(page)
      .getByRole('option', { name: /^Settings…/ })
      .click();
    await expect(dialog(page)).toBeVisible();
  });

  test('works from the keyboard, and gives focus back when it closes', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!!isMobile, 'a phone has no keyboard to start from');
    await editor(page).click();
    await openSettings(page);
    // Focus is inside the dialog, and Tab stays there.
    const inside = () => dialog(page).evaluate((d) => d.contains(document.activeElement));
    expect(await inside()).toBe(true);
    await expect(textSize(page)).toBeFocused();
    // Tab goes through the dialog's controls (the text size, the switches, a switch for each module,
    // Done) without leaving it. (WebKit's Tab skips buttons and checkboxes unless the system asks
    // otherwise.)
    if (browserName !== 'webkit') {
      const controls = await dialog(page).locator('select, input[type="checkbox"], button').count();
      for (let i = 1; i < controls; i++) {
        await page.keyboard.press('Tab');
        expect(await inside()).toBe(true);
      }
      await expect(dialog(page).getByRole('button', { name: 'Done' })).toBeFocused();
    }
    // A switch toggles with Space.
    await toggle(page, 'strict').focus();
    await page.keyboard.press('Space');
    await expect(toggle(page, 'strict')).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
  });

  test('opens in the middle of the window', async ({ page }) => {
    await openSettings(page);
    const box = await dialog(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (!box || !viewport) return;
    // Within a pixel of the middle, across and down (a dialog taller than the window is as tall as it may be, centered).
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  test('fits a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone only');
    await openSettings(page);
    const box = await dialog(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});

test('remembers settings after a reload', async ({ page }) => {
  await openSettings(page);
  await toggle(page, 'spellcheck').uncheck();
  await toggle(page, 'strict').check();
  await toggle(page, 'lineNumbers').check();
  await toggle(page, 'matchSystem').check();
  await textSize(page).selectOption('1.3');
  await closeSettings(page);
  await expect
    .poll(() => stored(page))
    .toEqual({
      spellcheck: false,
      strict: true,
      lineNumbers: true,
      matchSystem: true,
      textSize: 1.3,
    });

  await page.reload();
  await expect(editor(page)).toBeAttached();
  await openSettings(page);
  await expect(toggle(page, 'spellcheck')).not.toBeChecked();
  await expect(toggle(page, 'strict')).toBeChecked();
  await expect(toggle(page, 'lineNumbers')).toBeChecked();
  await expect(toggle(page, 'matchSystem')).toBeChecked();
  await expect(textSize(page)).toHaveValue('1.3');
});

test("the browser's spellcheck stays off in the Source pane, and the switch turns Drafter's on and off", async ({
  page,
}) => {
  // Drafter's own spellcheck replaces the browser's there (Plan D, Call 18).
  await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
  await setText(page, 'INT. HALL - DAY\n\nThe phnoe rings.\n');
  await expect(page.locator('.cm-misspelled')).toHaveText('phnoe');
  await openSettings(page);
  await expect(
    dialog(page).getByText(
      'Underline misspelled words in the Source pane, with Drafter’s own dictionary, which works offline.',
    ),
  ).toBeVisible();
  await toggle(page, 'spellcheck').uncheck();
  await expect(page.locator('.cm-misspelled')).toHaveCount(0);
  await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
  await toggle(page, 'spellcheck').check();
  await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
  await expect(page.locator('.cm-misspelled')).toHaveText('phnoe');
  await toggle(page, 'spellcheck').uncheck();
  await closeSettings(page);
  await page.reload();
  await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
});

test.describe('the text size', () => {
  test('scales the Source pane', async ({ page }) => {
    const fontSize = () => editor(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // A short line that never wraps: the first line drawn is whichever the first visit's scroll leaves
    // at the top, which can be a long paragraph whose height depends on the pane.
    const lineHeight = () =>
      page
        .locator('.cm-line', { hasText: 'INT. KITCHEN - NIGHT' })
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
    const base = await fontSize();
    const baseLine = await lineHeight();
    await openSettings(page);
    await textSize(page).selectOption('1.5');
    await expect.poll(fontSize).toBeCloseTo(base * 1.5, 1);
    await expect.poll(lineHeight).toBeCloseTo(baseLine * 1.5, 0);
    await textSize(page).selectOption('0.9');
    await expect.poll(fontSize).toBeCloseTo(base * 0.9, 1);
  });

  test('scales the Script pane at 100%, and the pages stay the same', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'the two panes share a wide screen');
    const sheet = page.locator('.drafter-page').first();
    await expect(sheet).toBeVisible();
    await page.getByRole('button', { name: '100%', exact: true }).click();
    const width = () => sheet.evaluate((el) => el.getBoundingClientRect().width);
    const pages = () => page.locator('.drafter-page').count();
    const before = await width();
    const count = await pages();
    await openSettings(page);
    await textSize(page).selectOption('1.5');
    await expect.poll(width).toBeCloseTo(before * 1.5, -1);
    expect(await pages()).toBe(count);
    // Fit width fills the pane whatever the size.
    await closeSettings(page);
    await page.getByRole('button', { name: 'Fit width', exact: true }).click();
    const fitted = await width();
    await openSettings(page);
    await textSize(page).selectOption('0.9');
    await closeSettings(page);
    await expect.poll(width).toBeCloseTo(fitted, -1);
  });

  test('is still set after a reload', async ({ page }) => {
    await openSettings(page);
    await textSize(page).selectOption('1.15');
    await closeSettings(page);
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale')),
      )
      .toBe('1.15');
  });
});

test.describe('the appearance', () => {
  test.use({ colorScheme: 'light' });

  test('follows the system appearance when asked', async ({ page }) => {
    const html = page.locator('html');
    // Drafter starts dark, whatever the system says.
    await expect(html).toHaveClass(/\bdark\b/);
    await openSettings(page);
    await toggle(page, 'matchSystem').check();
    await expect(html).toHaveClass(/\blight\b/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveClass(/\blight\b/);
    // Turning it off returns to the theme that was chosen before.
    await toggle(page, 'matchSystem').uncheck();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test('keeps following after a reload', async ({ page }) => {
    await openSettings(page);
    await toggle(page, 'matchSystem').check();
    await closeSettings(page);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(editor(page)).toBeAttached();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
      .toBe(true);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('choosing a theme by hand stops following the system', async ({ page }) => {
    await openSettings(page);
    await toggle(page, 'matchSystem').check();
    await closeSettings(page);
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect.poll(async () => (await stored(page)).matchSystem).toBe(false);
    await openSettings(page);
    await expect(toggle(page, 'matchSystem')).not.toBeChecked();
  });
});

test.describe('Strict Fountain', () => {
  const TEXT = 'INT. HALL - DAY\nShe waits.\n';

  test('raises the Strict Fountain rules to warnings', async ({ page }) => {
    await setText(page, TEXT);
    await expect(page.locator('.cm-lint-marker-info').first()).toBeVisible();
    await expect(page.locator('.cm-lint-marker-warning')).toHaveCount(0);
    await openSettings(page);
    await toggle(page, 'strict').check();
    await expect(page.locator('.cm-lint-marker-warning').first()).toBeVisible();
    await toggle(page, 'strict').uncheck();
    await expect(page.locator('.cm-lint-marker-info').first()).toBeVisible();
    await expect(page.locator('.cm-lint-marker-warning')).toHaveCount(0);
  });

  test('is on again for the next text typed after a reload', async ({ page }) => {
    await openSettings(page);
    await toggle(page, 'strict').check();
    await closeSettings(page);
    await page.reload();
    await showSource(page);
    await setText(page, TEXT);
    await expect(page.locator('.cm-lint-marker-warning').first()).toBeVisible();
  });
});

test.describe('line numbers', () => {
  test("toggles line numbers from the Source pane's bar and remembers them", async ({ page }) => {
    await expect(lineNumbersGutter(page)).toHaveCount(0);
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
    await barButton(page).click();
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
    // The leftmost gutter numbers the lines from 1, and line 17 reads 17.
    await expect(page.locator('.cm-gutters .cm-gutter').first()).toHaveClass(/\bcm-lineNumbers\b/);
    await expect(numbers(page).getByText('17', { exact: true })).toBeVisible();
    // Line 1 is above the first visit's scroll: go to the top to see it.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(numbers(page).getByText('1', { exact: true })).toBeVisible();
    await expect.poll(async () => (await stored(page)).lineNumbers).toBe(true);

    await page.reload();
    await showSource(page);
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(numbers(page).getByText('17', { exact: true })).toBeVisible();

    await barButton(page).click();
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(lineNumbersGutter(page)).toHaveCount(0);
  });

  test('the number is the line Go to line goes to', async ({ page }) => {
    await barButton(page).click();
    await toolbarField(page).click();
    await palette(page).locator('input').fill('17');
    await palette(page)
      .getByRole('option', { name: /Go to line 17/ })
      .click();
    const cursor = page.locator('.cm-cursor-primary');
    await expect(cursor).toBeVisible();
    const at = await cursor.evaluate((el) => el.getBoundingClientRect().top);
    const number = numbers(page).getByText('17', { exact: true });
    const numberAt = await number.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(at - numberAt)).toBeLessThan(12);
  });

  test('the dialog, the bar, and the palette agree', async ({ page }) => {
    await openSettings(page);
    await toggle(page, 'lineNumbers').check();
    await closeSettings(page);
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');

    await toolbarField(page).click();
    await expect(palette(page).getByRole('option', { name: 'Show line numbers' })).toHaveCount(0);
    await palette(page).locator('input').fill('line numbers');
    await palette(page).getByRole('option', { name: 'Hide line numbers' }).click();
    await expect(lineNumbersGutter(page)).toHaveCount(0);
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');

    await toolbarField(page).click();
    await palette(page).locator('input').fill('line numbers');
    await palette(page).getByRole('option', { name: 'Show line numbers' }).click();
    await expect(lineNumbersGutter(page)).toHaveCount(1);
    await openSettings(page);
    await expect(toggle(page, 'lineNumbers')).toBeChecked();
  });

  test('the bar button works from the keyboard', async ({ page }) => {
    await barButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

test('keeps settings after switching scripts', async ({ page, isMobile }) => {
  await openSettings(page);
  await toggle(page, 'lineNumbers').check();
  await toggle(page, 'spellcheck').uncheck();
  await toggle(page, 'strict').check();
  await closeSettings(page);

  // A new screenplay is a load into the one editor.
  await page.keyboard.press('ControlOrMeta+Alt+n');
  await expect(editor(page)).toContainText('Untitled Screenplay');
  if (isMobile) await showSource(page);
  await expect(lineNumbersGutter(page)).toHaveCount(1);
  await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
  await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');

  await setText(page, 'INT. HALL - DAY\nShe waits.\n');
  await expect(page.locator('.cm-lint-marker-warning').first()).toBeVisible();
});

test.describe('reopening at once', () => {
  // The dialog's open state is mirrored in `settingsOpen`; a reopen pressed right after a close
  // must neither be ignored (Escape) nor be undone by the close that is still on its way (Done).
  test('opens again when Mod+, follows Escape at once', async ({ page }) => {
    await start(page);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ControlOrMeta+,');
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+,');
      await expect(dialog(page)).toBeVisible();
      // And it stays: no late close takes it away.
      await page.waitForTimeout(150);
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    }
  });

  test('stays open when Mod+, follows Done at once', async ({ page }) => {
    await start(page);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ControlOrMeta+,');
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Done' }).click();
      await page.keyboard.press('ControlOrMeta+,');
      await page.waitForTimeout(150);
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Done' }).click();
      await expect(dialog(page)).toBeHidden();
    }
  });
});
