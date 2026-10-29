import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  problemsList,
  runCommand,
  setText,
  showProblems,
  start,
  textOf,
  turnOnFixture,
} from './modules';

// The Notes tab (Phase 2 design §8, §10, Plan B): every note and boneyard but the scene fields, in
// groups and filters, each linked to its scene and line; resolve, reopen, edit, set category, and
// delete in one undo each; Resolve all shown after asking; New note at the cursor; the setups and
// payoffs by label; the open count on the tab; a stale row's action changing nothing; the filters
// in a sheet on a phone; and no edits in a read-only tab.

const SCRIPT = [
  'Title: The Test',
  '',
  'INT. HALL - DAY',
  '',
  '= Ann arrives.',
  '[[Goal: Find the key.]]',
  '',
  'Ann waits by the door. [[Check the dates. #continuity]]',
  '[[TODO: cut this line]]',
  '',
  '[[Sam: Why does she wait? #character]]',
  '[[Ann re Sam: She is scared.]]',
  '',
  '/* an old line */',
  '',
  'EXT. YARD - NIGHT',
  '',
  'Bob hides a letter. [[Setup: the letter]]',
  '[[Ann: Too fast. #resolved #pacing]]',
  '',
  'INT. SHED - DAY',
  '',
  'Tools. [[Setup: the key]]',
  '',
  'INT. CAR - DAY',
  '',
  'Bob reads the letter. [[Payoff: the letter]]',
].join('\n');

const list = (page: Page) => page.getByRole('listbox', { name: 'Notes' });
const rows = (page: Page) => list(page).getByRole('option');
const row = (page: Page, name: RegExp) => list(page).getByRole('option', { name });
const dates = (page: Page) => row(page, /^Check the dates\./);
const todo = (page: Page) => row(page, /^cut this line\b/);
const sam = (page: Page) => row(page, /^Sam, Why does she wait\?/);
const bones = (page: Page) => row(page, /^Boneyard, an old line/);
const announcer = (page: Page) => page.locator('.outline-announcer');
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Notes to show' }).getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });
const rowMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));

async function showNotes(page: Page) {
  await runCommand(page, 'Show Notes');
  await expect(list(page)).toBeVisible();
}

async function openWith(page: Page, text = SCRIPT) {
  await start(page);
  await setText(page, text);
  await showNotes(page);
}

test.describe('the Notes tab', () => {
  test('lists the notes of a script with their scenes and lines', async ({ page }) => {
    await openWith(page);
    // Every note and boneyard, but not the scene's Goal.
    await expect(rows(page)).toHaveCount(9);
    await expect(list(page)).not.toContainText('Find the key');
    await expect(dates(page)).toHaveAccessibleName(
      'Check the dates. #continuity, continuity, open, Scene 1, line 8',
    );
    await expect(dates(page)).toContainText('Scene 1 · line 8');
    await expect(dates(page)).toContainText('continuity');
    await expect(dates(page)).toContainText('Open');
    await expect(todo(page)).toHaveAccessibleName('cut this line, todo, open, Scene 1, line 9');
    await expect(sam(page)).toHaveAccessibleName(
      'Sam, Why does she wait? #character, character, open, Scene 1, line 11',
    );
    // The reply sits under Sam's note.
    await expect(rows(page).nth(3)).toHaveAccessibleName(
      'Reply, Ann re Sam, She is scared., open, Scene 1, line 12',
    );
    await expect(bones(page)).toHaveAccessibleName('Boneyard, an old line, Scene 1, line 14');
    await expect(row(page, /^Ann, Too fast\./)).toHaveAccessibleName(
      'Ann, Too fast. #resolved #pacing, pacing, resolved, Scene 2, line 19',
    );
    // Enter goes to the note in the Source.
    await sam(page).focus();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeVisible();
    await expect(editor(page)).toBeFocused();
  });

  test('filters by group, category, person, and status', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone has the filters in a sheet, tried below');
    await openWith(page);
    await chip(page, 'My notes').click();
    await expect(chip(page, 'My notes')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(2);
    await chip(page, 'Readers').click();
    await expect(rows(page)).toHaveCount(3);
    await chip(page, 'Boneyard').click();
    await expect(rows(page)).toHaveCount(1);
    await chip(page, 'All').click();
    await field(page, 'Category').selectOption('continuity');
    await expect(rows(page)).toHaveCount(1);
    await expect(dates(page)).toBeVisible();
    await field(page, 'Category').selectOption('');
    // Ann's own note, and Sam's with her reply under it.
    await field(page, 'Person').selectOption('Ann');
    await expect(rows(page)).toHaveCount(3);
    await field(page, 'Person').selectOption('');
    await field(page, 'Status').selectOption('resolved');
    await expect(rows(page)).toHaveCount(1);
    await field(page, 'Status').selectOption('open');
    await expect(rows(page)).toHaveCount(4);
    await field(page, 'Status').selectOption('all');
    await page.getByRole('searchbox', { name: 'Find in notes' }).fill('dates');
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Find in notes' }).fill('nothing like it');
    await expect(list(page)).toHaveCount(0);
    await expect(page.getByText('No notes match.')).toBeVisible();
  });

  test('resolves and reopens a note, each in one undo', async ({ page }) => {
    await openWith(page);
    await dates(page).focus();
    await page.keyboard.press('r');
    await expect.poll(() => textOf(page)).toContain('[[Check the dates. #continuity #resolved]]');
    await expect(announcer(page)).toHaveText('Resolved the note.');
    await expect(dates(page)).toBeFocused();
    await expect(dates(page)).toHaveAccessibleName(/, resolved, Scene 1, line 8$/);
    await page.keyboard.press('r');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await expect(announcer(page)).toHaveText('Reopened the note.');
    // Each was one undo.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toContain('#continuity #resolved]]');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    // The row's button does the same for a pointer.
    await todo(page).getByRole('button', { name: 'Resolve', includeHidden: true }).click();
    await expect.poll(() => textOf(page)).toContain('[[TODO: cut this line #resolved]]');
  });

  test('edits a note in place, in one undo', async ({ page }) => {
    await openWith(page);
    await todo(page).focus();
    await page.keyboard.press('e');
    const body = page.getByRole('textbox', { name: 'Text of the note' });
    const head = page.getByRole('textbox', { name: 'Head of the note' });
    await expect(body).toBeFocused();
    await expect(body).toHaveValue('cut this line');
    await expect(head).toHaveValue('TODO');
    await body.fill('cut this whole line');
    await page.keyboard.press('Enter');
    await expect.poll(() => textOf(page)).toContain('[[TODO: cut this whole line]]');
    await expect(announcer(page)).toHaveText('Saved the note.');
    await expect(row(page, /^cut this whole line, todo/)).toBeFocused();
    // Escape leaves it as it was.
    await page.keyboard.press('e');
    await page.keyboard.insertText(' Changed.');
    await page.keyboard.press('Escape');
    await expect(row(page, /^cut this whole line, todo/)).toBeFocused();
    expect(await textOf(page)).toContain('[[TODO: cut this whole line]]');
    // The head too: Sam's note becomes Ann's.
    await sam(page).focus();
    await page.keyboard.press('e');
    await head.fill('Ann');
    await page.keyboard.press('Enter');
    await expect.poll(() => textOf(page)).toContain('[[Ann: Why does she wait? #character]]');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('sets a category, in one undo', async ({ page }) => {
    await openWith(page);
    await sam(page).focus();
    await page.keyboard.press('c');
    const dialog = page.getByRole('dialog', { name: 'Categories for this note' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'character' })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'character' }).uncheck();
    await dialog.getByRole('checkbox', { name: 'story' }).check();
    await dialog.getByRole('textbox', { name: 'New category' }).fill('motive');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('[[Sam: Why does she wait? #story #motive]]');
    await expect(announcer(page)).toHaveText('Set the note’s categories: story, motive.');
    await expect(sam(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    // A category's color, from the row's menu, kept in the metadata block.
    await page.keyboard.press('Shift+F10');
    await expect(rowMenu(page)).toBeVisible();
    await rowMenu(page).getByRole('menuitem', { name: 'Color of character…' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'teal' }).click();
    await expect.poll(() => textOf(page)).toMatch(/"categories":\s*\{\s*"character":\s*"teal"/);
    await expect(announcer(page)).toHaveText('Colored the character category teal.');
  });

  test('deletes a note, in one undo', async ({ page }) => {
    await openWith(page);
    await bones(page).focus();
    await page.keyboard.press('Delete');
    await expect.poll(() => textOf(page)).not.toContain('an old line');
    await expect(announcer(page)).toHaveText('Deleted the boneyard.');
    await expect(rows(page)).toHaveCount(8);
    // Focus goes to the row that took its place.
    await expect(row(page, /^Setup, the letter/)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('resolves all shown after asking', async ({ page }) => {
    await openWith(page);
    await chip(page, 'My notes').click();
    const button = page.getByRole('button', { name: 'Resolve all shown' });
    const ask = page.getByRole('dialog', { name: 'Resolve 2 notes?' });
    // Cancel changes nothing.
    await button.click();
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    await expect(button).toBeFocused();
    expect(await textOf(page)).toBe(SCRIPT);
    await button.click();
    await ask.getByRole('button', { name: 'Resolve' }).click();
    await expect.poll(() => textOf(page)).toContain('[[TODO: cut this line #resolved]]');
    expect(await textOf(page)).toContain('[[Check the dates. #continuity #resolved]]');
    expect(await textOf(page)).toContain('[[Sam: Why does she wait? #character]]');
    await expect(announcer(page)).toHaveText('Resolved 2 notes.');
    // One undo takes both back.
    await todo(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('adds a note at the cursor with a category', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    // The cursor is at the end of the last line.
    await runCommand(page, 'New note…');
    const dialog = page.getByRole('dialog', { name: 'New note' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.insertText('Check the time');
    await dialog.getByRole('combobox', { name: 'Category' }).fill('continuity');
    await dialog.getByRole('button', { name: 'Add note' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => textOf(page)).toBe(`${SCRIPT} [[Check the time #continuity]]`);
    await expect(announcer(page)).toHaveText('Added a note at the cursor.');
    // From the tab's button too; one undo each.
    await showNotes(page);
    await page.getByRole('button', { name: 'New note…' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.insertText('Later');
    await dialog.getByRole('button', { name: 'Add note' }).click();
    await expect
      .poll(() => textOf(page))
      .toBe(`${SCRIPT} [[Check the time #continuity]] [[Later]]`);
    await expect(page.getByRole('button', { name: 'New note…' })).toBeFocused();
    await expect(row(page, /^Later, open/)).toBeVisible();
    await rows(page).first().focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(`${SCRIPT} [[Check the time #continuity]]`);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('lists a setup with no payoff first in Setups & payoffs, and in Problems', async ({
    page,
  }) => {
    await openWith(page);
    await chip(page, 'Setups & payoffs').click();
    const groups = list(page).getByRole('group');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toHaveAccessibleName('the key: not paid off');
    await expect(groups.nth(1)).toHaveAccessibleName('the letter: paid off');
    await expect(groups.nth(0).getByRole('option')).toHaveAccessibleName(
      /^Setup, the key, (page \d+, )?Scene 3, line 23$/,
    );
    await expect(groups.nth(1).getByRole('option')).toHaveCount(2);
    await expect(groups.nth(1).getByRole('option').nth(1)).toHaveAccessibleName(
      /^Payoff, the letter, (page \d+, )?Scene 4, line 27$/,
    );
    // Each goes to its place.
    await groups.nth(0).getByRole('option').focus();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await showProblems(page);
    await expect(problemsList(page)).toContainText(
      'Nothing pays off the setup “the key” later in the script.',
    );
  });

  test('shows the open count on the tab', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    const pane = page.locator('[data-pane]').first();
    await pane.getByRole('button', { name: 'More tabs' }).click();
    const item = page
      .getByRole('menu', { name: 'More tabs' })
      .getByRole('menuitem', { name: 'Notes, 4 open', exact: true });
    await expect(item).toBeVisible();
    await item.click();
    const tab = pane.getByRole('tab', { name: 'Notes, 4 open', exact: true });
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab.locator('.badge')).toHaveText('4');
    await dates(page).focus();
    await page.keyboard.press('r');
    await expect(pane.getByRole('tab', { name: 'Notes, 3 open', exact: true })).toBeVisible();
  });

  test("a stale row's action changes nothing", async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the source and the list side by side');
    await start(page);
    await turnOnFixture(page);
    await setText(page, 'INT. HALL - DAY\n\nAnn waits. [[Check the dates]]');
    // The cursor inside the note, before its ]], where the fixture puts its note after a pause.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await showNotes(page);
    const note = row(page, /^Check the dates, open/);
    await note.focus();
    await runCommand(page, 'Fixture: add a note after a pause');
    await note.focus();
    await page.keyboard.press('c');
    const dialog = page.getByRole('dialog', { name: 'Categories for this note' });
    await expect(dialog).toBeVisible();
    // While the dialog is open, the note changes under it.
    const changed = 'INT. HALL - DAY\n\nAnn waits. [[Check the dates[[later]]]]';
    await expect.poll(() => textOf(page)).toBe(changed);
    await dialog.getByRole('checkbox', { name: 'story' }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(announcer(page)).toHaveText(
      'That note has changed since; the list is up to date now.',
    );
    expect(await textOf(page)).toBe(changed);
  });

  test('works with the filters in a sheet on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a wide screen has the filters in the tab');
    await openWith(page);
    await expect(field(page, 'Status')).toHaveCount(0);
    const button = page.getByRole('button', { name: 'Filters', exact: true });
    await button.click();
    const sheet = page.getByRole('dialog', { name: 'Filter notes' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('combobox', { name: 'Status', exact: true }).selectOption('resolved');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, /^Ann, Too fast\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeFocused();
    // The same keys on a phone's list.
    await chip(page, 'All').click();
    await page.getByRole('button', { name: 'Filters (1)' }).click();
    await sheet.getByRole('combobox', { name: 'Status', exact: true }).selectOption('all');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(rows(page)).toHaveCount(9);
  });

  test('offers no edits in a read-only tab, and says why', async ({ context, isMobile }) => {
    test.skip(!!isMobile, 'two browser tabs are the same on a phone');
    const why = 'This script is open for editing in another tab.';
    const first = await context.newPage();
    await start(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(why).first()).toBeVisible();
    await showNotes(second);
    // Everything shows.
    await expect(rows(second)).not.toHaveCount(0);
    const before = await textOf(second);
    const top = rows(second).first();
    await top.focus();
    for (const key of ['r', 'e', 'c', 'Delete']) {
      await second.keyboard.press(key);
      await expect(announcer(second)).toHaveText(why);
      await expect(top).toBeFocused();
    }
    await expect(second.getByRole('textbox', { name: 'Text of the note' })).toHaveCount(0);
    await second.keyboard.press('Shift+F10');
    await expect(rowMenu(second)).toBeVisible();
    await expect(rowMenu(second)).toContainText(why);
    for (const name of ['Resolve', 'Edit', 'Set category…', 'Delete']) {
      await expect(rowMenu(second).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    await second.keyboard.press('Escape');
    await expect(top).toBeFocused();
    const add = second.getByRole('button', { name: 'New note…' });
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await expect(add).toHaveAccessibleDescription(why);
    await expect(second.getByRole('button', { name: 'Resolve all shown' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(await textOf(second)).toBe(before);
  });
});
