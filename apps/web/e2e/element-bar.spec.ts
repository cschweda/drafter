import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  settingsDialog,
  setText,
  showSource,
  start,
  textOf,
} from './modules';

// The element bar (docs/drafter-element-bar-design.md): a row of buttons over the Source that
// writes Fountain's marks, names the element the cursor is in, and teaches the marks as it goes.
// (No accessibility check here: those wait for the project's final stage, decided 2026-10-26.)

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Element bar' });
const button = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const here = (page: Page) => bar(page).locator('[data-here]');

/** Puts `text` in the editor with the cursor at its end, and waits for the bar to follow it. */
async function write(page: Page, text: string) {
  await setText(page, text);
  await page.keyboard.press('ControlOrMeta+End');
}

/** Clicks a button on the bar, and waits for the editor to have focus again. */
async function press(page: Page, name: string) {
  await button(page, name).click();
  await expect(editor(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await start(page);
  await showSource(page);
});

test('shows over the Source, and names the element the cursor is in', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await write(page, 'INT. HALL - DAY\n\nMARGARET\nHello.');
  await expect(here(page)).toHaveText('You’re in: Dialogue');
  await expect(button(page, 'Dialogue')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(here(page)).toHaveText('You’re in: Character');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'true');
  // Each button says what its element is, and its mark and key, as its description.
  await expect(button(page, 'Character')).toHaveAccessibleDescription(
    /A name in capitals on its own line.*(Ctrl\+Alt\+3|⌘⌥3) always adds it\./,
  );
  // The reason for the element is the description of the words at the left.
  await expect(here(page)).toHaveAccessibleDescription(/^A name in capitals after a blank line/);
  await page.keyboard.press('ArrowUp');
  await expect(here(page)).toHaveText('You’re on a blank line');
});

test('writes each element, natural Fountain first', async ({ page }) => {
  await write(page, 'She waits.\n\nkitchen - night');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('She waits.\n\nINT. KITCHEN - NIGHT');

  await write(page, 'She waits.\n\nmargaret');
  await press(page, 'Character');
  await page.keyboard.insertText('\nHello.');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET\nHello.');
  await expect(here(page)).toHaveText('You’re in: Dialogue');

  // Dialogue on a line of action starts a cue above it; the name is upper-cased as it is typed.
  await write(page, 'She waits.\n\nHello there.');
  await press(page, 'Dialogue');
  await page.keyboard.type('bob');
  await page.keyboard.press('Escape');
  expect(await textOf(page)).toBe('She waits.\n\n@BOB\nHello there.');

  await write(page, 'MARGARET\nquietly');
  await press(page, 'Parenthetical');
  expect(await textOf(page)).toBe('MARGARET\n(quietly)');

  await write(page, 'INT. HALL');
  await press(page, 'Action');
  expect(await textOf(page)).toBe('!INT. HALL');

  await write(page, 'She waits.\n\ncut to:');
  await press(page, 'Transition');
  expect(await textOf(page)).toBe('She waits.\n\nCUT TO:');
});

test('starts a heading on an empty line and offers the locations', async ({ page }) => {
  await write(page, 'INT. KITCHEN - NIGHT\n\nShe waits.\n\n');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('INT. KITCHEN - NIGHT\n\nShe waits.\n\nINT. ');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('KITCHEN');
});

test('is one undo step', async ({ page }) => {
  await write(page, 'She waits.\nkitchen');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('She waits.\n\nINT. KITCHEN');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('She waits.\nkitchen');
});

test('says why Parenthetical is off where it does not apply', async ({ page }) => {
  await write(page, 'She waits.');
  await expect(button(page, 'Parenthetical')).toHaveAttribute('aria-disabled', 'true');
  await expect(button(page, 'Parenthetical')).toHaveAccessibleDescription(
    /goes under a character name or in their dialogue/,
  );
  // Playwright waits for a button with aria-disabled to be enabled, so the click is forced.
  await button(page, 'Parenthetical').click({ force: true });
  expect(await textOf(page)).toBe('She waits.');
});

test('has the rest in More', async ({ page }) => {
  const choose = async (name: string) => {
    await button(page, 'More elements').click();
    await page.getByRole('menuitem', { name }).click();
    await expect(editor(page)).toBeFocused();
  };
  await write(page, 'THE END');
  await choose('Centered');
  expect(await textOf(page)).toBe('>THE END<');

  await write(page, 'Act one');
  await choose('Section');
  expect(await textOf(page)).toBe('# Act one');

  await setText(page, 'a word');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await choose('Bold');
  expect(await textOf(page)).toBe('a **word**');
});

test('moves along the bar with the arrow keys, as one tab stop', async ({ page }) => {
  await write(page, 'She waits.');
  await here(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(button(page, 'Scene')).toBeFocused();
  await expect(button(page, 'Scene')).toHaveAttribute('tabindex', '0');
  await expect(here(page)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(bar(page).getByRole('button', { name: 'Element bar options' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(here(page)).toBeFocused();
  // Enter on a button runs it, and the editor has focus after.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(button(page, 'Action')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
});

test('opens the Fountain cheat sheet from ?', async ({ page, context }) => {
  const opened = context.waitForEvent('page');
  await bar(page).getByRole('button', { name: 'Fountain cheat sheet' }).click();
  const sheet = await opened;
  await sheet.waitForLoadState();
  expect(new URL(sheet.url()).pathname).toBe('/docs/fountain/');
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('Fountain cheat sheet');
  await expect(sheet.locator('#character')).toContainText('@');
});

test('hides from its ⋯ menu, and Settings brings it back', async ({ page }) => {
  await bar(page).getByRole('button', { name: 'Element bar options' }).click();
  await page.getByRole('menuitem', { name: 'Hide the element bar' }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'element bar is hidden' })).toContainText(
    'Turn it back on in Settings',
  );
  // It stays hidden after a reload.
  await page.reload();
  await expect(editor(page)).toBeAttached();
  await showSource(page);
  await expect(bar(page)).toHaveCount(0);
  await openSettings(page);
  const on = settingsDialog(page).getByRole('switch', { name: 'Element bar' });
  await expect(on).not.toBeChecked();
  await on.check();
  await closeSettings(page);
  await expect(bar(page)).toBeVisible();
});

test('is hidden in focus mode', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(page.locator('[data-focus-layout]')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(bar(page)).toBeVisible();
});

test('shows the Markdown set in a Markdown document', async ({ page }) => {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts' })
    .getByRole('button', { name: 'New Markdown document' })
    .click();
  await expect(editor(page)).toContainText('# Untitled');
  await showSource(page);
  const md = page.getByRole('toolbar', { name: 'Markdown bar' });
  await expect(md).toBeVisible();
  await expect(md.getByRole('button', { name: 'Heading', exact: true })).toBeVisible();
  await expect(md.getByRole('button', { name: 'Scene', exact: true })).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(md.locator('[data-here]')).toHaveText('You’re in: Heading 1');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nfirst');
  await md.getByRole('button', { name: 'List', exact: true }).click();
  await expect(editor(page)).toBeFocused();
  expect(await textOf(page)).toContain('- first');
  await expect(md.locator('[data-here]')).toHaveText('You’re in: List item');
});

test('is one row on a phone, which scrolls sideways', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone’s width');
  const box = await bar(page).boundingBox();
  expect(box?.height ?? 0).toBeLessThan(40);
  const scrolls = await bar(page).evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(true);
  // It is above the text.
  const text = await page.locator('.cm-scroller').boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((text?.y ?? 0) + 1);
});
