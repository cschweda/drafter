import { expect, type Page, test } from '@playwright/test';
import { editor, runCommand, setText, showSource, start } from './modules';

// Counts and a daily goal (Plan 5 Task 3). The accessibility test the brief names is deferred to
// the project's final stage (decided 2026-10-26); the panel's keyboard use is tested here.

const status = (page: Page) => page.locator('[data-tour="status"]');
const countsButton = (page: Page) => status(page).locator('.counts-button');
const panel = (page: Page) => page.getByRole('dialog', { name: 'Counts' });
const target = (page: Page) => panel(page).getByLabel('Goal for today');
const unit = (page: Page) => panel(page).getByLabel('Unit');

/** What the panel says for a figure: its definition, by the term. */
const figure = (page: Page, term: string) =>
  panel(page).locator('dt', { hasText: term }).locator('+ dd');

/** WebKit's Tab skips buttons and menus; Option-Tab doesn't. */
const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

/** A script of the writer's own (the sample can't have a goal). */
async function ownScript(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts' })
    .getByRole('button', { name: 'New screenplay' })
    .click();
  await showSource(page);
  await expect(editor(page)).toContainText('Title:');
}

test.describe('counts', () => {
  test('opens the counts from the status bar', async ({ page }) => {
    await start(page);
    // A first visit puts the cursor on the sample's first scene heading, on page 1.
    await expect(countsButton(page)).toHaveText('Page 1 of 2');
    await expect(countsButton(page)).toHaveAttribute('aria-expanded', 'false');
    await countsButton(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(countsButton(page)).toHaveAttribute('aria-expanded', 'true');
    // The sample, counted by hand: 1.4 pages, 2 scenes, 261 words (the title page's 11 included).
    await expect(figure(page, 'Pages')).toHaveText('1.4');
    await expect(figure(page, 'Scenes')).toHaveText('2');
    await expect(figure(page, 'Words')).toHaveText('261');
    await expect(figure(page, 'Running time')).toHaveText('About 1 min');
    // A sample keeps no goal.
    await expect(panel(page)).toContainText('This is a sample');
    await expect(target(page)).toHaveCount(0);
  });

  test('opens and closes from the keyboard, and Escape returns focus', async ({
    page,
    browserName,
  }) => {
    const tab = tabKey(browserName);
    await start(page);
    await countsButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(countsButton(page)).toBeFocused();
    // Space opens it too, and the button closes it again.
    await page.keyboard.press('Space');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press(`Shift+${tab}`);
    await expect(countsButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeHidden();
    // Tabbing out of the panel closes it.
    await countsButton(page).click();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press(tab);
    await expect(panel(page)).toBeHidden();
    // A click elsewhere closes it (the corner of the page: on a small phone the panel covers the rest).
    await countsButton(page).click();
    await expect(panel(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(panel(page)).toBeHidden();
  });

  test('follows the cursor to a page', async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(countsButton(page)).toHaveText('Page 2 of 2');
  });

  test('sets a daily goal and shows progress', async ({ page, browserName }) => {
    const tab = tabKey(browserName);
    await ownScript(page);
    await countsButton(page).click();
    await expect(panel(page)).toBeFocused();
    await expect(panel(page)).not.toContainText('This is a sample');

    // From the keyboard: the panel, the number, the unit, Enter.
    await page.keyboard.press(tab);
    await expect(target(page)).toBeFocused();
    await page.keyboard.type('1000');
    await page.keyboard.press(tab);
    await expect(unit(page)).toBeFocused();
    await unit(page).selectOption('words');
    await page.keyboard.press(tab);
    await page.keyboard.press('Enter');
    await expect(panel(page)).toContainText('0 of 1,000 words today');
    await expect(status(page)).toContainText('0 of 1,000 words today');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();

    // Four words typed on the title page are four words of growth.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nINT. HALL - DAY\n\nAlpha beta gamma delta.\n');
    await expect(status(page)).toContainText('8 of 1,000 words today');

    // A cut counts against it, and the bar doesn't go below nothing.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await expect(status(page)).toContainText('0 of 1,000 words today');

    // The goal is kept for the script: a new visit has it.
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await expect(status(page)).toContainText('of 1,000 words today');
  });

  test('says what a goal can’t be', async ({ page }) => {
    await ownScript(page);
    await countsButton(page).click();
    await target(page).fill('0');
    await panel(page).getByRole('button', { name: 'Set goal' }).click();
    await expect(panel(page).getByRole('alert')).toContainText('Enter a number of pages');
    await target(page).fill('1.5');
    await panel(page).getByRole('button', { name: 'Set goal' }).click();
    await expect(status(page)).toContainText('of 1.5 pages today');
    await panel(page).getByRole('button', { name: 'Clear goal' }).click();
    await expect(status(page)).not.toContainText('of 1.5 pages today');
    await expect(panel(page).getByRole('button', { name: 'Clear goal' })).toHaveCount(0);
  });

  test('counts words only in a Markdown document', async ({ page }) => {
    await start(page);
    await runCommand(page, 'New Markdown document');
    await showSource(page);
    await expect(editor(page)).toContainText('# Untitled');
    await setText(page, '# A title\n\nSome words here.\n');
    await expect(countsButton(page)).toHaveText('5 words');
    await countsButton(page).click();
    await expect(figure(page, 'Words')).toHaveText('5');
    await expect(panel(page).locator('dt', { hasText: 'Pages' })).toHaveCount(0);
    await expect(unit(page)).toHaveValue('words');
    await expect(unit(page)).toBeDisabled();
  });
});
