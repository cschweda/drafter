import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  setText,
  settingsDialog,
  showSource,
  start,
  stored,
  textOf,
} from './modules';

// The element bar (docs/drafter-element-bar-design.md): a row of buttons over the Source that
// writes Fountain's marks, names the element the cursor is in, and teaches the marks as it goes.
// (Its accessibility checks are in a11y.spec.ts.)

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
    /A name in capitals on its own line.*Shortcut: (Ctrl\+Alt\+3|⌘⌥3)\./,
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
  // The @ was only for typing the name in capitals: it goes once the cursor leaves the line.
  await page.keyboard.press('ArrowDown');
  expect(await textOf(page)).toBe('She waits.\n\nBOB\nHello there.');

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

test('names a name with no speech yet a Character, and lets a parenthetical go under it', async ({
  page,
}) => {
  await write(page, 'She waits.\n\nmargaret');
  await press(page, 'Character');
  await expect(here(page)).toHaveText('You’re in: Character');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Parenthetical')).not.toHaveAttribute('aria-disabled', 'true');
  await press(page, 'Parenthetical');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET\n()');
});

test('says why a button did nothing', async ({ page }) => {
  await write(page, 'MARGARET\n');
  await expect(here(page)).toHaveAccessibleDescription(/what you type here is their dialogue/);
  await press(page, 'Dialogue');
  await expect(page.getByRole('status').filter({ hasText: 'already dialogue' })).toContainText(
    'type what they say here',
  );
  expect(await textOf(page)).toBe('MARGARET\n');
});

test('runs the element commands from Ctrl+Alt+1 to 7', async ({ page }) => {
  await write(page, 'She waits.\n\nmargaret');
  await page.keyboard.press('ControlOrMeta+Alt+3');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET');
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

/** Chooses a button from the bar's More menu. */
async function chooseMore(page: Page, name: string) {
  await button(page, 'More elements').click();
  await page.getByRole('menuitem', { name }).click();
  await expect(editor(page)).toBeFocused();
}

test('Setup adds a mark at the end of the line with the cursor in its label', async ({ page }) => {
  await write(page, 'INT. HALL - DAY\n\nAnn pockets the key.');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await chooseMore(page, 'Setup');
  expect(await textOf(page)).toBe('INT. HALL - DAY\n\nAnn pockets the key. [[Setup: ]]');
  await page.keyboard.type('the key');
  expect(await textOf(page)).toBe('INT. HALL - DAY\n\nAnn pockets the key. [[Setup: the key]]');
});

test('Payoff offers the setup’s label', async ({ page }) => {
  await write(page, 'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door.');
  await chooseMore(page, 'Payoff');
  expect(await textOf(page)).toBe(
    'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door. [[Payoff: ]]',
  );
  const option = page.getByRole('option', { name: 'the key' });
  await expect(option).toBeVisible();
  await option.click();
  expect(await textOf(page)).toBe(
    'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door. [[Payoff: the key]]',
  );
});

test('Setup and Payoff are one undo each', async ({ page }) => {
  await write(page, 'One.\n\nTwo.');
  await chooseMore(page, 'Setup');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await chooseMore(page, 'Payoff');
  await page.keyboard.press('Escape');
  expect(await textOf(page)).toBe('One. [[Payoff: ]]\n\nTwo. [[Setup: ]]');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('One.\n\nTwo. [[Setup: ]]');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('One.\n\nTwo.');
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
  // It stays hidden after a reload, once the setting has been kept.
  await expect.poll(async () => (await stored(page)).elementBar).toBe(false);
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
    .getByRole('group', { name: 'Scripts', exact: true })
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

test('is hidden in a tab that only shows the script', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'two tabs are the same on a phone');
  await expect(bar(page)).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
  await showSource(other);
  await expect(other.getByRole('toolbar', { name: 'Element bar' })).toHaveCount(0);
});

test('keeps the editor’s focus when a button is tapped on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone’s touch screen');
  await write(page, 'She waits.\n\nmargaret');
  await button(page, 'Character').tap();
  await expect(editor(page)).toBeFocused();
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET');
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

test.describe('on a stage play', () => {
  const PLAY = (body: string) =>
    `${body}\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/`;

  /** Puts a play in the editor, with the cursor at the start of its line `n` (from 0). */
  async function play(page: Page, body: string, n: number) {
    await setText(page, PLAY(body));
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
  }

  test('offers Act, Scene, and Stage direction, and no Transition', async ({ page }) => {
    await play(page, '# ACT ONE\n\n## Scene 1\n\nMargaret waits.', 2);
    await expect(button(page, 'Act')).toBeVisible();
    await expect(button(page, 'Stage direction')).toBeVisible();
    await expect(button(page, 'Transition')).toHaveCount(0);
    await expect(here(page)).toHaveText('You’re in: Scene');
    await expect(button(page, 'Scene')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(here(page)).toHaveText('You’re in: Act');
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(here(page)).toHaveText('You’re in: Stage direction');
    await expect(button(page, 'Stage direction')).toHaveAttribute('aria-pressed', 'true');
  });

  test('writes a scene as ## from the button', async ({ page }) => {
    await play(page, 'Margaret waits.\n\nthe porch', 2);
    await press(page, 'Scene');
    expect(await textOf(page)).toContain('Margaret waits.\n\n## the porch\n');
  });

  test('writes a scene as ## from Ctrl+Alt+1', async ({ page }) => {
    await play(page, 'Margaret waits.\n\nthe porch', 2);
    await page.keyboard.press('ControlOrMeta+Alt+1');
    expect(await textOf(page)).toContain('Margaret waits.\n\n## the porch\n');
  });

  test('says why Ctrl+Alt+5 writes no transition', async ({ page }) => {
    await play(page, 'Margaret waits.\n\ncut to:', 2);
    await page.keyboard.press('ControlOrMeta+Alt+5');
    await expect(page.getByRole('status').filter({ hasText: 'no transitions' })).toBeVisible();
    expect(await textOf(page)).toContain('\n\ncut to:\n');
  });
});

test('says why a key did nothing', async ({ page }) => {
  await write(page, 'She waits.');
  await page.keyboard.press('ControlOrMeta+Alt+4');
  await expect(
    page.getByRole('status').filter({ hasText: 'under a character name' }),
  ).toBeVisible();
});
