import { expect, type Page } from '@playwright/test';
import { runCommand, showSource } from './modules';

// Shared by the specs that check a snapshot before a bulk operation (Phase 2 design §11.1): a
// script of the writer's own to work on, and History's newest row compared with the text now.

const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });

/** A new screenplay, which (unlike a sample) keeps snapshots, with the Source showing. */
export async function newScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
  await expect(page.locator('.cm-content')).toContainText('Title:');
}

/**
 * Opens History, checks that row `row` (0 is the newest) says `reason`, and compares it with now: Compare
 * opens and lists at least one change. Returns the number of snapshots History listed.
 */
export async function expectNewestThenCompare(
  page: Page,
  reason: string | RegExp,
  row = 0,
): Promise<number> {
  await runCommand(page, 'History…');
  await expect(history(page)).toBeVisible();
  await expect(options(page).nth(row)).toContainText(reason);
  const count = await options(page).count();
  await options(page).nth(row).focus();
  await page.keyboard.press('Enter');
  await expect(history(page)).toBeHidden();
  await expect(
    page.getByRole('tab', { name: 'Compare', exact: true, selected: true }),
  ).toBeVisible();
  await expect(page.locator('#panel-compare .changes .change').first()).toBeAttached();
  return count;
}

/** Opens History and returns the reasons it lists, newest first, then closes it. */
export async function listedReasons(page: Page): Promise<string[]> {
  await runCommand(page, 'History…');
  await expect(history(page)).toBeVisible();
  await expect(options(page).first()).toBeVisible();
  const rows = await options(page).allInnerTexts();
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
  return rows;
}
