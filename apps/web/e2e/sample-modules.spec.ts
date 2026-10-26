import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  lastPane,
  openSettings,
  palette,
  paletteInput,
  problemsList,
  runCommand,
  setText,
  settingsDialog,
  showProblems,
  showSource,
  start,
  textOf,
} from './modules';

// The three sample modules in modules/: Scene list, Cast, and Notes. `pnpm e2e` builds with them
// (every build has them), and they are off until turned on in Settings.

const SCRIPT = [
  'INT. HALL - DAY',
  '',
  'Rain on the glass. [[check the rain]]',
  '',
  'ANN',
  'Hello.',
  '',
  '[[cut this]]',
  '',
  'EXT. YARD - NIGHT',
  '',
  'BOB',
  'Hi.',
  '',
  'ANN',
  'Bye.',
].join('\n');

const sceneSwitch = (page: Page, name: string) =>
  settingsDialog(page).getByRole('switch', { name, exact: true });
const button = (page: Page, name: string) =>
  page.locator('header.toolbar').getByRole('button', { name, exact: true });
const toast = (page: Page) => page.locator('.module-toast');

/** Turns one sample on in Settings: no question, since none asks for the network. */
async function turnOn(page: Page, name: string) {
  // Settings sometimes ignores a Mod+, pressed just after it closed (seen once in thirty on the
  // emulated Pixel 7), so a second press is tried.
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+,');
    await expect(settingsDialog(page)).toBeVisible({ timeout: 1500 });
  }).toPass();
  await sceneSwitch(page, name).click();
  await expect(sceneSwitch(page, name)).toBeChecked();
  await closeSettings(page);
  await expect(button(page, name === 'Scene list' ? 'Scenes' : name)).toBeVisible();
}

/** The tab a module adds, in whichever pane shows it. */
const moduleTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const modulePanel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

async function openScript(page: Page, text = SCRIPT) {
  await start(page);
  await setText(page, text);
}

test.describe('sample modules', () => {
  test('are in Settings and off to begin with', async ({ page }) => {
    await start(page);
    for (const name of ['Scenes', 'Cast', 'Notes']) {
      await expect(button(page, name)).toHaveCount(0);
    }
    await openSettings(page);
    const modules = settingsDialog(page).getByRole('region', { name: 'Modules' });
    for (const name of ['Scene list', 'Cast', 'Notes']) {
      await expect(sceneSwitch(page, name)).not.toBeChecked();
    }
    await expect(modules).toContainText('Lists every scene heading');
    await expect(modules).toContainText('It needs no network');
  });

  test('turns on each sample module and uses it: Scene list', async ({ page }) => {
    await openScript(page);
    await turnOn(page, 'Scene list');
    await button(page, 'Scenes').click();

    // The button opens the tab, and focus goes into it.
    const panel = modulePanel(page, 'Scenes');
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    const rows = panel.getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveText(/^1\s*INT\. HALL - DAY\s*Page 1 · \d\/8 page$/);
    await expect(rows.nth(1)).toHaveText(/^2\s*EXT\. YARD - NIGHT\s*Page 1 · \d\/8 page$/);

    // Choosing a scene goes to its heading in the source.
    await rows.nth(1).click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('>');
    await expect.poll(() => textOf(page)).toContain('>EXT. YARD - NIGHT');
  });

  test('turns on each sample module and uses it: Cast', async ({ page }) => {
    await openScript(page);
    await turnOn(page, 'Cast');
    await button(page, 'Cast').click();

    const panel = modulePanel(page, 'Cast');
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    const rows = panel.getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveText(/^ANN\s*2 speeches · first in scene 1, INT\. HALL - DAY$/);
    await expect(rows.nth(1)).toHaveText(/^BOB\s*1 speech · first in scene 2, EXT\. YARD - NIGHT$/);

    // Choosing a character goes to their first cue, not a later one.
    await rows.nth(0).click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('>');
    await expect.poll(() => textOf(page)).toContain('>ANN\nHello.');
    expect(await textOf(page)).not.toContain('>ANN\nBye.');
  });

  test('copies the Cast list as plain text', async ({ page, context, browserName }) => {
    // Only Chromium lets a test grant the clipboard; elsewhere the module's answer is checked.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await openScript(page);
    await turnOn(page, 'Cast');
    await runCommand(page, 'Cast: copy the list');
    if (browserName === 'chromium') {
      await expect(toast(page)).toContainText('Copied the list of 2 characters.');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        [
          'ANN: 2 speeches, first in scene 1 (INT. HALL - DAY)',
          'BOB: 1 speech, first in scene 2 (EXT. YARD - NIGHT)',
          '',
        ].join('\n'),
      );
    } else {
      await expect(toast(page)).toContainText(
        /Copied the list of 2 characters|Couldn’t copy the list/,
      );
    }
  });

  test('turns on each sample module and uses it: Notes', async ({ page }) => {
    await openScript(page);
    await turnOn(page, 'Notes');
    await button(page, 'Notes').click();
    await expect(toast(page)).toContainText('2 notes are listed in Problems.');

    await showProblems(page);
    const list = problemsList(page);
    await expect(
      list.getByRole('button', { name: 'Notes Info: check the rain Line 3' }),
    ).toBeVisible();
    await expect(list.getByRole('button', { name: 'Notes Info: cut this Line 8' })).toBeVisible();

    // Choosing one selects the note in the source.
    await list.getByRole('button', { name: /cut this/ }).click();
    await expect(editor(page)).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('[[cut this]]');
  });

  test("undoes Notes' removal in one step", async ({ page }) => {
    await openScript(page);
    await turnOn(page, 'Notes');
    await button(page, 'Notes').click();

    // Cancel changes nothing.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('Remove 2 notes from this script? You can undo it with Undo.');
      void dialog.dismiss();
    });
    await runCommand(page, 'Notes: remove all notes');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);

    // OK removes both, tidily, in one change.
    page.once('dialog', (dialog) => void dialog.accept());
    await runCommand(page, 'Notes: remove all notes');
    const expected = SCRIPT.replace(' [[check the rain]]', '').replace('[[cut this]]\n\n', '');
    await expect.poll(() => textOf(page)).toBe(expected);
    await expect(toast(page)).toContainText('Removed 2 notes.');
    // Their items are gone from Problems.
    await showProblems(page);
    await expect(problemsList(page).getByRole('button', { name: /^Notes/ })).toHaveCount(0);

    // One undo brings both notes back, and nothing else changes.
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => textOf(page)).toBe(expected);
  });

  test("reaches each sample module's button, tab, rows, and command from the keyboard", async ({
    page,
  }) => {
    await openScript(page);
    // The switch: Space turns it on.
    await openSettings(page);
    await sceneSwitch(page, 'Scene list').focus();
    await page.keyboard.press('Space');
    await expect(sceneSwitch(page, 'Scene list')).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();

    // The button: Enter opens the tab and moves focus into its panel.
    await button(page, 'Scenes').focus();
    await page.keyboard.press('Enter');
    const panel = modulePanel(page, 'Scenes');
    await expect(panel).toBeFocused();
    // The first row is a button, so it takes focus, and Enter goes to the heading. (WebKit's Tab
    // skips buttons unless the system setting says otherwise, so focus is set directly.)
    await panel.getByRole('button').first().focus();
    await expect(panel.getByRole('button').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('>');
    await expect.poll(() => textOf(page)).toContain('>INT. HALL - DAY');

    // The tab row: End reaches the module's tab (the last), and Enter chooses it.
    await showProblems(page);
    await lastPane(page).getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('End');
    await expect(moduleTab(page, 'Scenes').last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(modulePanel(page, 'Scenes')).toBeVisible();

    // A command from the palette, with Notes, from the keyboard alone.
    await turnOn(page, 'Notes');
    await showSource(page);
    page.once('dialog', (dialog) => void dialog.accept());
    await runCommand(page, 'Notes: remove all notes');
    await expect.poll(() => textOf(page)).not.toContain('[[');
  });

  test('tells a Markdown document that Scene list and Cast are not available', async ({ page }) => {
    await start(page);
    await turnOn(page, 'Scene list');
    await turnOn(page, 'Cast');
    await runCommand(page, 'New Markdown document');
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();

    // Opening a document brings the Source pane forward a moment after its tabs change, so a click
    // that lands in between is tried again.
    for (const name of ['Scenes', 'Cast']) {
      await expect(async () => {
        await moduleTab(page, name).first().click();
        await expect(modulePanel(page, name)).toHaveText('Not available for Markdown documents.', {
          timeout: 1000,
        });
      }).toPass();
    }

    // The copy command is left out of the palette there.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Cast: copy the list');
    await expect(palette(page).getByRole('option', { name: 'Cast: copy the list' })).toHaveCount(0);
  });

  test('finds no notes in a Markdown document', async ({ page }) => {
    await start(page);
    await turnOn(page, 'Notes');
    await runCommand(page, 'New Markdown document');
    await button(page, 'Notes').click();
    await expect(toast(page)).toContainText('Not available for Markdown documents.');
    await showProblems(page);
    await expect(problemsList(page).getByRole('button')).toHaveCount(0);
  });
});
