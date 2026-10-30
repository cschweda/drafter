import { expect, type Page, test } from '@playwright/test';
import { editor, runCommand, showSource, start } from './modules';

// Writing stats (docs/drafter-stats-design.md): words and time today in the status bar, and the
// Stats window. Its accessibility test is in a11y.spec.ts.

const status = (page: Page) => page.locator('[data-tour="status"]');
const countsButton = (page: Page) => status(page).locator('.counts-button');
const countsPanel = (page: Page) => page.getByRole('dialog', { name: 'Counts' });
const stats = (page: Page) => page.getByRole('dialog', { name: 'Stats' });
const wordsToday = (page: Page) => status(page).locator('[data-stat="words-today"]');
const timeToday = (page: Page) => status(page).locator('[data-stat="time-today"]');

const minutesField = (page: Page) => stats(page).getByLabel('Minutes a page');
const wordsField = (page: Page) => stats(page).getByLabel('Spoken words a minute');

/** What the window says for a figure: its definition, by the term, in a section. */
const figure = (page: Page, section: string, term: string) =>
  stats(page)
    .getByRole('region', { name: section })
    .locator('dt', { hasText: new RegExp(`^${term}$`) })
    .locator('+ dd');

async function newScript(
  page: Page,
  name: 'New screenplay' | 'New stage play' | 'New Markdown document',
) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name })
    .click();
  await showSource(page);
  await expect(editor(page)).toContainText(
    name === 'New Markdown document' ? '# Untitled' : 'Title:',
  );
}

/** Types `text` at the end of the script, as the writer would. */
async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/** The keys of the writing-stats rows kept in this browser. */
const statsKeys = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const keys = db.transaction('settings').objectStore('settings').getAllKeys();
          keys.onsuccess = () => {
            db.close();
            resolve((keys.result as string[]).filter((key) => key.startsWith('stats-day:')));
          };
          keys.onerror = () => resolve([]);
        };
      }),
  );

/** The words the open script's day began with, as kept (the daily goal's `day:` row). */
const dayStartWords = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('settings').objectStore('settings').getAll();
          all.onsuccess = () => {
            db.close();
            const day = (all.result as Array<{ key: string; value: { words?: number } }>).find(
              (row) => row.key.startsWith('day:'),
            );
            resolve(day?.value.words ?? null);
          };
          all.onerror = () => resolve(null);
        };
      }),
  );

// 13 words: the headings' four each, the cues' one each, and the speeches'.
const SCENES = '\n\nINT. HALL - DAY\n\nANN\nHello there.\n\nEXT. YARD - NIGHT\n\nBOB\nHi.\n';

test.describe('writing stats', () => {
  test('the status bar shows the words and time of today, after the first edit', async ({
    page,
  }) => {
    await newScript(page, 'New screenplay');
    await expect(wordsToday(page)).toHaveCount(0);
    await expect(timeToday(page)).toHaveCount(0);
    await typeAtEnd(page, SCENES);
    await expect(wordsToday(page)).toHaveText('+13 words today');
    await expect(timeToday(page)).toHaveText('<1 min today');
    // Neither is a live region: a screen reader reads them when asked, not as they change.
    await expect(wordsToday(page)).not.toHaveAttribute('role', /.+/);
    await expect(wordsToday(page)).not.toHaveAttribute('aria-live', /.+/);
    await expect(status(page).locator('[aria-live]:has([data-stat])')).toHaveCount(0);
    // A cut counts against the day.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await expect(wordsToday(page)).toHaveText(/^−\d+ words today$/);
  });

  test('the status bar shows neither on a sample', async ({ page }) => {
    await start(page);
    await showSource(page);
    await typeAtEnd(page, '\n\nMore words here.\n');
    await expect(countsButton(page)).toBeVisible();
    await expect(status(page)).not.toContainText('today');
  });

  test('a daily goal in words leaves out the words item', async ({ page }) => {
    await newScript(page, 'New screenplay');
    await typeAtEnd(page, SCENES);
    await expect(wordsToday(page)).toBeVisible();
    await countsButton(page).click();
    await countsPanel(page).getByLabel('Goal for today').fill('1000');
    await countsPanel(page).getByLabel('Unit').selectOption('words');
    await countsPanel(page).getByRole('button', { name: 'Set goal' }).click();
    await expect(status(page)).toContainText('13 of 1,000 words today');
    await expect(wordsToday(page)).toHaveCount(0);
    await expect(timeToday(page)).toBeVisible();
  });

  test('the Stats window opens from the Counts panel, shows the script, and Escape returns focus', async ({
    page,
  }) => {
    await newScript(page, 'New screenplay');
    await typeAtEnd(page, SCENES);
    await expect(wordsToday(page)).toHaveText('+13 words today');
    await countsButton(page).click();
    await countsPanel(page).getByRole('button', { name: 'Stats…' }).click();
    await expect(stats(page)).toBeVisible();
    // The window has focus, at its top.
    await expect(stats(page)).toBeFocused();
    await expect(countsPanel(page)).toBeHidden();

    await expect(figure(page, 'Today', 'Words added')).toHaveText('+13');
    await expect(figure(page, 'Today', 'Writing time')).toHaveText('<1 min');
    await expect(figure(page, 'This script', 'Scenes')).toHaveText('2');
    await expect(figure(page, 'This script', 'Characters')).toHaveText('2');
    await expect(figure(page, 'This script', 'Days written')).toHaveText('1');
    const characters = stats(page).getByRole('table', { name: 'Characters' });
    await expect(characters.getByRole('row')).toHaveCount(3);
    await expect(characters.getByRole('row').nth(1)).toHaveText(/ANN\s*1\s*1\s*2/);
    const headings = stats(page).getByRole('table', { name: 'Scene headings' });
    await expect(headings).toContainText('Interior');
    await expect(headings).toContainText('Night');
    await expect(figure(page, 'Last 30 days', 'Days written')).toHaveText('1');
    await expect(figure(page, 'Last 30 days', 'Current streak')).toHaveText('1 day');
    // The chart's numbers, as a table for a screen reader: a header and 30 days.
    const chartTable = stats(page).getByRole('table', { name: /Words added each day/ });
    await expect(chartTable.getByRole('row')).toHaveCount(31);
    await expect(chartTable.getByRole('row').last()).toContainText('+13');

    await page.keyboard.press('Escape');
    await expect(stats(page)).toBeHidden();
    await expect(countsButton(page)).toBeFocused();
  });

  test('the Stats window opens from the palette and the Drafter menu, and its Close button closes it', async ({
    page,
  }) => {
    await start(page);
    await runCommand(page, 'Show stats');
    await expect(stats(page)).toBeVisible();
    // The sample's figures are shown, and nothing is kept for it.
    await expect(stats(page)).toContainText(
      'Stats are kept for your own scripts, not the samples.',
    );
    await expect(figure(page, 'This script', 'Scenes')).toHaveText('2');
    await stats(page).getByRole('button', { name: 'Close' }).click();
    await expect(stats(page)).toBeHidden();

    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await page
      .getByRole('menu', { name: 'Drafter menu' })
      .getByRole('menuitem', { name: /^Show stats/ })
      .click();
    await expect(stats(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(stats(page)).toBeHidden();
  });

  test('a new script says nothing is written yet', async ({ page }) => {
    await newScript(page, 'New screenplay');
    await runCommand(page, 'Show stats');
    await expect(stats(page)).toContainText('Nothing written yet today.');
    await expect(stats(page)).toContainText('Writing time is counted from now on.');
  });

  test('a Markdown document shows its words, headings, and reading time', async ({ page }) => {
    await newScript(page, 'New Markdown document');
    // The day begins with the words first counted, a moment after a Markdown document opens: wait
    // for that start to be kept, as a writer would be slower than the test.
    await expect(countsButton(page)).toHaveText('1 word');
    await expect.poll(() => dayStartWords(page)).toBe(1);
    await typeAtEnd(page, 'Some words to read here.\n\n## Part two\n');
    // The document began the day with its heading's one word.
    await expect(wordsToday(page)).toHaveText('+7 words today');
    await runCommand(page, 'Show stats');
    await expect(figure(page, 'This script', 'Words')).toHaveText('8');
    await expect(figure(page, 'This script', 'Headings')).toHaveText('2');
    await expect(figure(page, 'This script', 'Reading time')).toHaveText('Under a minute');
    // No pages in a Markdown document.
    await expect(figure(page, 'Today', 'Pages added')).toHaveCount(0);
    await expect(stats(page).getByRole('table', { name: 'Characters' })).toHaveCount(0);
  });

  test('closing the window opened from the palette or the Drafter menu gives focus back to the script', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'a phone shows the Script tab, not the editor, to begin with');
    await start(page);
    await showSource(page);
    await editor(page).click();
    await runCommand(page, 'Show stats');
    await expect(stats(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(stats(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();

    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await page
      .getByRole('menu', { name: 'Drafter menu' })
      .getByRole('menuitem', { name: /^Show stats/ })
      .click();
    await expect(stats(page)).toBeFocused();
    await stats(page).getByRole('button', { name: 'Close' }).click();
    await expect(editor(page)).toBeFocused();
  });

  test('a stage play counts its ## scenes, for the script and for each character', async ({
    page,
  }) => {
    await newScript(page, 'New stage play');
    // After the title page, before the block at the end that names the template.
    await editor(page).locator('.cm-line', { hasText: 'Draft date:' }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(
      '\n\n# Act One\n\n## Scene 1\n\nANN\nHello.\n\n## Scene 2\n\nANN\nAgain.',
    );
    await runCommand(page, 'Show stats');
    await expect(figure(page, 'This script', 'Scenes')).toHaveText('2');
    const characters = stats(page).getByRole('table', { name: 'Characters' });
    await expect(characters.getByRole('row').nth(1)).toHaveText(/ANN\s*2\s*2\s*2/);
    // A play has no INT./EXT. headings to divide.
    await expect(stats(page).getByRole('table', { name: 'Scene headings' })).toHaveCount(0);
  });

  test('removing the open script removes its stats for good', async ({ page }) => {
    await newScript(page, 'New screenplay');
    await typeAtEnd(page, SCENES);
    // Kept within a few seconds of the edit.
    await expect.poll(() => statsKeys(page), { timeout: 10_000 }).toHaveLength(1);
    // More words, not yet kept, then the script is removed while it is open.
    await typeAtEnd(page, 'More.\n');
    await runCommand(page, 'Remove from this browser');
    const ask = page.getByRole('dialog', { name: /Remove “Untitled Screenplay”/ });
    await ask.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(ask).toBeHidden();
    await expect(editor(page)).not.toContainText('Untitled Screenplay');
    // Past the moment the last write would have come.
    await page.waitForTimeout(6000);
    expect(await statsKeys(page)).toEqual([]);
  });

  test("shows the running time at the script's rate and the estimate from the dialogue", async ({
    page,
  }) => {
    await start(page);
    await runCommand(page, 'Show stats');
    // The sample: 1.4 pages at a minute a page; 77 words spoken at 150 a minute (31 s) and 20
    // lines of action at 1.5 s (30 s), about a minute.
    await expect(figure(page, 'This script', 'Running time')).toHaveText(
      'About 1 min, at 1 minute a page',
    );
    await expect(figure(page, 'This script', 'Estimate from the dialogue')).toHaveText(
      'About 1 min',
    );
    await expect(minutesField(page)).toHaveValue('1');
    await expect(wordsField(page)).toHaveValue('150');
    await expect(stats(page)).toContainText('Plays often run longer than a minute a page.');
    await expect(stats(page)).toContainText(
      'The words spoken, at 150 words a minute, plus 1.5 seconds for each line of action. A rough guide, not a timing.',
    );
    // 1.4 pages at 3 minutes a page is 4.2 minutes.
    await minutesField(page).fill('3');
    await minutesField(page).blur();
    await expect(figure(page, 'This script', 'Running time')).toHaveText(
      'About 4 min, at 3 minutes a page',
    );
  });

  test('a rate set in Stats is kept for that script only, after a reload', async ({ page }) => {
    await newScript(page, 'New screenplay');
    await typeAtEnd(page, SCENES);
    const title = await page.title();
    await runCommand(page, 'Show stats');
    await minutesField(page).fill('1.5');
    await minutesField(page).blur();
    await wordsField(page).fill('180');
    await wordsField(page).blur();
    await expect(figure(page, 'This script', 'Running time')).toContainText(
      'at 1.5 minutes a page',
    );
    await expect(stats(page)).toContainText('at 180 words a minute');
    // Nothing in the script changed.
    await expect(page).toHaveTitle(title);
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(editor(page)).toContainText('EXT. YARD - NIGHT');
    await runCommand(page, 'Show stats');
    await expect(minutesField(page)).toHaveValue('1.5');
    await expect(wordsField(page)).toHaveValue('180');
    await expect(figure(page, 'This script', 'Running time')).toContainText(
      'at 1.5 minutes a page',
    );
    await page.keyboard.press('Escape');

    // Another script has rates of its own.
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New screenplay' })
      .click();
    await runCommand(page, 'Show stats');
    await expect(minutesField(page)).toHaveValue('1');
    await expect(wordsField(page)).toHaveValue('150');
  });

  test('a rate out of range is refused and the last good one kept', async ({ page }) => {
    await newScript(page, 'New screenplay');
    await runCommand(page, 'Show stats');
    await minutesField(page).fill('1.2');
    await minutesField(page).blur();
    await expect(figure(page, 'This script', 'Running time')).toContainText(
      'at 1.2 minutes a page',
    );
    for (const typed of ['10', '0', 'abc', '1,2']) {
      await minutesField(page).fill(typed);
      await minutesField(page).blur();
      await expect(stats(page).getByRole('alert')).toHaveText('Enter a number from 0.5 to 3.');
      await expect(minutesField(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(minutesField(page)).toHaveAccessibleDescription(
        'Plays often run longer than a minute a page. Enter a number from 0.5 to 3.',
      );
      await expect(figure(page, 'This script', 'Running time')).toContainText(
        'at 1.2 minutes a page',
      );
    }
    await wordsField(page).fill('152');
    await wordsField(page).blur();
    await expect(wordsField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(wordsField(page)).toHaveAccessibleDescription(
      'Enter a whole number from 100 to 220, in steps of 5.',
    );
    await expect(stats(page)).toContainText('at 150 words a minute');
    // A good one clears the problem.
    await minutesField(page).fill('2');
    await minutesField(page).blur();
    await expect(minutesField(page)).toHaveAttribute('aria-invalid', 'false');
    await expect(figure(page, 'This script', 'Running time')).toContainText('at 2 minutes a page');
  });

  test('in a read-only tab the rates are disabled and say why', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'two tabs are the same on a phone');
    await newScript(page, 'New screenplay');
    await runCommand(page, 'Show stats');
    await minutesField(page).fill('1.5');
    await minutesField(page).blur();
    await expect(figure(page, 'This script', 'Running time')).toContainText(
      'at 1.5 minutes a page',
    );
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByRole('button', { name: 'Edit here instead' })).toBeVisible();
    await runCommand(other, 'Show stats');
    await expect(stats(other)).toContainText(
      'Another tab has this script open, so its rates can’t be changed here.',
    );
    await expect(minutesField(other)).toBeDisabled();
    await expect(wordsField(other)).toBeDisabled();
    // The stored rate shows, and the times read at it.
    await expect(minutesField(other)).toHaveValue('1.5');
    await expect(figure(other, 'This script', 'Running time')).toContainText(
      'at 1.5 minutes a page',
    );
    await expect(figure(other, 'This script', 'Estimate from the dialogue')).toBeVisible();
  });

  test('a tab that only shows the script says the editing tab keeps its stats, and shows them', async ({
    page,
    context,
  }) => {
    await newScript(page, 'New screenplay');
    await typeAtEnd(page, SCENES);
    // Kept within a few seconds of the edit.
    await expect.poll(() => statsKeys(page), { timeout: 10_000 }).toHaveLength(1);
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByRole('button', { name: 'Edit here instead' })).toBeVisible();
    await runCommand(other, 'Show stats');
    await expect(stats(other)).toContainText(
      'Another tab is editing this script, and counts its writing time there.',
    );
    await expect(stats(other)).not.toContainText('Nothing written yet today.');
    await expect(figure(other, 'Last 30 days', 'Days written')).toHaveText('1');
  });
});
