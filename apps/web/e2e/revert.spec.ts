import { expect, type Page, test } from '@playwright/test';
import { expectNewestThenCompare } from './bulk-snapshot';
import {
  countFileAccess,
  fileAccess,
  nextFileName,
  removePickers,
  stubPickers,
  textOf,
} from './fs-stub';

const editor = (page: Page) => page.locator('.cm-content');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const revert = (page: Page) => menu(page).getByRole('menuitem', { name: /^Revert to Saved/ });
const status = (page: Page) => page.locator('[data-tour="status"]');
const notice = (page: Page) => page.locator('.notice [role="status"]');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const bar = (page: Page) => page.locator('[data-file-bar]');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });

const MESSAGE = (file: string) =>
  `Reverted to the text last saved to ${file}. Undo brings your changes back.`;

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

async function chooseNew(page: Page, name: string) {
  await openButton(page).click();
  await scriptsMenu(page).getByRole('button', { name }).click();
  await expect(scriptsMenu(page)).toBeHidden();
}

async function openMenu(page: Page) {
  await mark(page).click();
  await expect(menu(page)).toBeVisible();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

test.describe('Revert to Saved (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('reverts to the text last saved, and undo brings the changes back', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'The Call.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    const saved = await textOf(page, 'The Call.fountain');

    await typeAtEnd(page, ' MORE WORDS');
    await expect(status(page)).toContainText('Unsaved changes');

    await openMenu(page);
    await expect(revert(page)).not.toHaveAttribute('aria-disabled', 'true');
    await revert(page).click();

    // The saved text is back, said once in a polite live region and shown as a toast.
    await expect(editor(page)).not.toContainText('MORE WORDS');
    await expect(editor(page)).toContainText('FADE IN:');
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    await expect(notice(page)).toHaveText(MESSAGE('The Call.fountain'));
    await expect(notice(page)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.notice').filter({ hasText: 'Reverted' })).toBeVisible();
    // Nothing was written: the file is as it was.
    expect(await textOf(page, 'The Call.fountain')).toBe(saved);

    // Focus is in the editor once the menu has gone, and one undo brings every change back.
    await expect(menu(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).toContainText('MORE WORDS');
    await expect(status(page)).toContainText('Unsaved changes');
    // Redo reverts again.
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor(page)).not.toContainText('MORE WORDS');
  });

  test('takes a snapshot before Revert to Saved', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'The Call.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, ' MORE WORDS');
    await openMenu(page);
    await revert(page).click();
    await expect(editor(page)).not.toContainText('MORE WORDS');
    await expectNewestThenCompare(page, 'Before Revert to Saved');
  });

  test('is a command in the palette while there are changes to revert', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('ONE');
    await nextFileName(page, 'Palette.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    const options = () => palette.getByRole('option', { name: /^Revert to Saved/ });
    await page.keyboard.press('ControlOrMeta+k');
    await palette.locator('input').fill('Revert');
    await expect(palette.getByText('Nothing matches')).toBeVisible();
    await page.keyboard.press('Escape');

    await typeAtEnd(page, ' TWO');
    await page.keyboard.press('ControlOrMeta+k');
    await palette.locator('input').fill('Revert');
    await expect(options()).toBeVisible();
    await options().click();
    await expect(notice(page)).toHaveText(MESSAGE('Palette.fountain'));
    await expect(editor(page)).not.toContainText('TWO');
  });

  test('is unavailable when there’s nothing to revert', async ({ page }) => {
    await start(page);
    // A sample: no file was ever saved.
    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // A new script with typing but no file yet.
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // Saved, and not changed since.
    await nextFileName(page, 'Clean.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
    // Choosing a disabled item does nothing.
    await revert(page).click({ force: true });
    await expect(notice(page)).toHaveText('');
    await page.keyboard.press('Escape');

    // Changed, and back again by hand: nothing to revert either.
    await typeAtEnd(page, 'X');
    await openMenu(page);
    await expect(revert(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Backspace');
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('names the .md file for a Markdown document', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New Markdown document');
    await expect(editor(page)).toContainText('# Untitled');
    await nextFileName(page, 'notes.md');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, 'More notes');
    await openMenu(page);
    await revert(page).click();
    await expect(notice(page)).toHaveText(MESSAGE('notes.md'));
    await expect(editor(page)).not.toContainText('More notes');
  });

  test('leaves the changed-file check quiet: no question, no "Updated from" toast', async ({
    page,
  }) => {
    await countFileAccess(page);
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'Quiet.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    const saved = await textOf(page, 'Quiet.fountain');
    await typeAtEnd(page, ' MORE');
    await openMenu(page);
    await revert(page).click();
    await expect(editor(page)).not.toContainText('MORE');

    // The window regains focus: the check reads the file, which is as it was saved, as the text is.
    const afterRevert = await fileAccess(page);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect
      .poll(async () => (await fileAccess(page)).reads)
      .toBeGreaterThan(afterRevert.reads);
    // Give a verdict that replaces the text or asks a question time to show.
    await page.waitForTimeout(400);
    await expect(dialog(page)).toBeHidden();
    await expect(bar(page)).not.toContainText('Updated');
    await expect(editor(page)).not.toContainText('MORE');

    // Save's own check (a read) runs and the save lands (a write), both quietly. The status bar
    // reads "Saved" already, so it is the counts that say the save happened.
    const beforeSave = await fileAccess(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(async () => (await fileAccess(page)).writes)
      .toBeGreaterThan(beforeSave.writes);
    expect((await fileAccess(page)).reads).toBeGreaterThan(beforeSave.reads);
    await page.waitForTimeout(400);
    await expect(dialog(page)).toBeHidden();
    await expect(bar(page)).not.toContainText('Updated');
    await expect(editor(page)).not.toContainText('MORE');
    expect(await textOf(page, 'Quiet.fountain')).toBe(saved);
  });

  test('comes back clean, with the saved text, after a reload', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'Again.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, ' MORE');
    await openMenu(page);
    await revert(page).click();
    await expect(editor(page)).not.toContainText('MORE');

    await page.reload();
    await expect(editor(page)).toContainText('FADE IN:');
    await expect(editor(page)).not.toContainText('MORE');
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    await expect(status(page)).not.toContainText('Unsaved changes');
    await expect(dialog(page)).toBeHidden();
    // Nothing is left to revert.
    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('is off, and says why, after the document type changed', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'Kind.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, ' MORE');

    // Make it a Markdown document (the text is kept).
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await page.keyboard.press('ControlOrMeta+k');
    await palette.locator('input').fill('Document: Markdown');
    await palette.getByRole('option', { name: /^Document: Markdown/ }).click();
    await page
      .getByRole('dialog', { name: 'Make this a Markdown document?' })
      .getByRole('button', { name: 'Make it Markdown' })
      .click();
    await expect(page.locator('.chip.template')).toHaveText('Markdown (plain text)');

    await openMenu(page);
    await expect(revert(page)).toHaveAttribute('aria-disabled', 'true');
    // The reason is on the item, so it is read with it.
    await expect(revert(page)).toContainText('The saved file is a different type of document');
    await expect(revert(page)).toHaveAccessibleName(/different type of document/);
    await page.keyboard.press('Escape');

    // The palette hides the command; the text is untouched.
    await page.keyboard.press('ControlOrMeta+k');
    await palette.locator('input').fill('Revert');
    await expect(palette.getByText('Nothing matches')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toContainText('MORE');
    await expect(notice(page)).toHaveText('');
  });

  test('is off in a tab that only shows the script', async ({ page, context }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'Shared.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, ' CHANGED');
    await expect(status(page)).toContainText('Unsaved changes');
    // The recovery copy is written a moment after typing; the second tab reads it.
    await page.waitForTimeout(1500);

    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
    await expect(editor(other)).toContainText('CHANGED');
    await openMenu(other);
    await expect(revert(other)).toHaveAttribute('aria-disabled', 'true');
    await expect(menu(other).getByRole('menuitem', { name: /^New screenplay/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('Revert to Saved where Save downloads', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test('restores the downloaded text', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    const file = await download;
    await expect(status(page)).toContainText('Saved just now');

    await typeAtEnd(page, ' MORE');
    await expect(status(page)).toContainText('Unsaved changes');
    await openMenu(page);
    await revert(page).click();
    await expect(editor(page)).not.toContainText('MORE');
    await expect(editor(page)).toContainText('FADE IN:');
    await expect(notice(page)).toHaveText(MESSAGE(file.suggestedFilename()));
    await expect(status(page)).not.toContainText('Unsaved changes');
    // Focus is back in the editor once the menu has gone (while it closes, focus can pass through
    // it), and one undo brings the change back.
    await expect(menu(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).toContainText('MORE');
  });
});
