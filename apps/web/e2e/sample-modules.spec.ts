import { expect, type Page, test } from '@playwright/test';
import {
  chooseTab,
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
/** The question Notes asks before it removes anything: Drafter's own dialog, headed with its name. */
const question = (page: Page) => page.getByRole('dialog', { name: 'Notes', exact: true });

/** Turns one sample on in Settings: no question, since none asks for the network. */
async function turnOn(page: Page, name: string) {
  await openSettings(page);
  await sceneSwitch(page, name).click();
  await expect(sceneSwitch(page, name)).toBeChecked();
  await closeSettings(page);
  await expect(button(page, name === 'Scene list' ? 'Scenes' : name)).toBeVisible();
}

/**
 * Runs "Notes: remove all notes" from the palette and waits for its question. On Firefox the palette
 * sometimes ignores Enter when it is opened again and again (the same happens with its Settings
 * command, with no module involved), so a command that didn't open anything is run once more.
 */
async function askToRemoveNotes(page: Page) {
  await expect(async () => {
    if (await palette(page).isVisible()) await page.keyboard.press('Escape');
    await runCommand(page, 'Notes: remove all notes').catch(() => {});
    await expect(question(page)).toBeVisible({ timeout: 2000 });
  }).toPass();
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

  test('goes to a scene from a tab that stayed open while another script was opened', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'a phone shows one tab at a time, so the tab is drawn again anyway');
    await openScript(page);
    await turnOn(page, 'Scene list');
    await button(page, 'Scenes').click();
    const panel = modulePanel(page, 'Scenes');
    await expect(panel.getByRole('button')).toHaveCount(2);

    // A new script opens in the Source pane, and the Scenes tab stays in the other.
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('INT. ATTIC - DAY\n\nDust.\n\nEXT. ROOF - NIGHT\n\nWind.');
    const rows = panel.getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('EXT. ROOF - NIGHT');

    // Its rows go to the new script's scenes.
    await rows.nth(1).click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('>');
    await expect.poll(() => textOf(page)).toContain('>EXT. ROOF - NIGHT');
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

    // The question says how many, and Cancel (focused first) changes nothing.
    await askToRemoveNotes(page);
    await expect(question(page)).toContainText(
      'Remove 2 notes from this script? You can undo it with Undo.',
    );
    await expect(question(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await question(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(question(page)).toBeHidden();
    await expect.poll(() => textOf(page)).toBe(SCRIPT);

    // So does Escape.
    await askToRemoveNotes(page);
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeHidden();
    await expect.poll(() => textOf(page)).toBe(SCRIPT);

    // Remove notes removes both, tidily, in one change.
    await askToRemoveNotes(page);
    await question(page).getByRole('button', { name: 'Remove notes' }).click();
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
    await runCommand(page, 'Notes: remove all notes');
    await expect(question(page)).toBeVisible();
    await expect(question(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    // (WebKit's Tab skips buttons, so the next button is focused directly.)
    await question(page).getByRole('button', { name: 'Remove notes' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => textOf(page)).not.toContain('[[');
  });

  test('tells a Markdown document that Scene list and Cast are not available', async ({ page }) => {
    await start(page);
    await turnOn(page, 'Scene list');
    await turnOn(page, 'Cast');
    await runCommand(page, 'New Markdown document');
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();

    // The new document brings the Source pane forward and focuses its editor; the tabs wait for it.
    await expect(editor(page)).toBeFocused();
    for (const name of ['Scenes', 'Cast']) {
      // On the emulated phone WebKit a tap on a tab is now and then ignored (about 1 in 10, under
      // investigation; see the Plan 4 deferred list), so tap again until the tab is chosen.
      // With two modules on, one of their tabs is under More (Phase 2 design §5.8).
      await expect(async () => {
        await chooseTab(page, name);
        await expect(moduleTab(page, name).first()).toHaveAttribute('aria-selected', 'true', {
          timeout: 1000,
        });
      }).toPass();
      await expect(modulePanel(page, name)).toHaveText('Not available for Markdown documents.');
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
    await expect(editor(page)).toBeFocused();
    await button(page, 'Notes').click();
    await expect(toast(page)).toContainText('Not available for Markdown documents.');
    await showProblems(page);
    await expect(problemsList(page).getByRole('button')).toHaveCount(0);
  });
});
