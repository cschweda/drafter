import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { editor, runCommand, setText, showSource, start } from './modules';

// Show changes on the Script pane (version-history design §4): off on every visit; on, the pages
// are marked against the last save (or a chosen version) with the Changes view's colors, whole
// lines only, + and − and hidden words; N and Shift+N step through the marks; nothing of it is
// printed or exported; and it is off for a Markdown document.

const scriptRegion = (page: Page) => page.getByRole('region', { name: 'Script' });
/** The Script tab's slim bar, which holds the zoom buttons. */
const slim = (page: Page) =>
  page.locator('.slim').filter({ has: page.getByRole('group', { name: 'Zoom' }) });
const toggle = (page: Page) => slim(page).getByRole('button', { name: 'Changes', exact: true });
const since = (page: Page) => slim(page).getByRole('button', { name: /^since: / });
const marked = (page: Page) => scriptRegion(page).locator('.live-mark');
const announcer = (page: Page) => page.locator('.outline-announcer');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const status = (page: Page) => page.locator('[data-tour="status"]');

const BASE = [
  'Title: The Call',
  '',
  'INT. HALL - DAY',
  '',
  'She waits by the door.',
  '',
  'The phone rings.',
  '',
  'Nobody answers it.',
  '',
  'EXT. ROOF - NIGHT',
  '',
  'Wind.',
  '',
].join('\n');

const CHANGED = BASE.replace('She waits by the door.', 'She paces by the door.').replace(
  'The phone rings.',
  'The phone rings.\n\nA dog barks.',
);

async function newScript(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** The Script tab, which a phone shows on its own. */
async function showScript(page: Page) {
  if (!(await scriptRegion(page).isVisible()))
    await page.getByRole('tab', { name: 'Script', exact: true }).first().click();
  await expect(scriptRegion(page).locator('.drafter-page').first()).toBeVisible();
}

/** Saves the script (a download, so every browser saves the same way). */
async function save(page: Page) {
  const download = page.waitForEvent('download');
  await saveButton(page).click();
  await download;
  await expect(status(page)).toContainText('Saved');
}

/** Takes a snapshot, labelled `label`, from History, and closes it. */
async function takeSnapshot(page: Page, label = '') {
  await runCommand(page, 'Take snapshot…');
  await expect(labelField(page)).toBeFocused();
  if (label) await page.keyboard.insertText(label);
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

/** A new script at `before`, saved, then changed to `after`, with the Script tab showing. */
async function savedThenChanged(page: Page, before: string, after: string) {
  await removePickers(page);
  await start(page);
  await newScript(page);
  await setText(page, before);
  await save(page);
  await setText(page, after);
  await showScript(page);
}

/** Turns Show changes on from the slim bar, and waits for the marks. */
async function turnOn(page: Page, count?: number) {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  if (count !== undefined) await expect(marked(page)).toHaveCount(count);
}

/** The texts of the marked lines, as a screen reader reads them. */
const markedTexts = (page: Page) => marked(page).allTextContents();

test.describe('Show changes on the Script pane', () => {
  test('marks an added line with + and a hidden "added, "', async ({ page }) => {
    await savedThenChanged(page, BASE, CHANGED);
    // Off on every visit.
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(marked(page)).toHaveCount(0);
    await turnOn(page, 2);
    await expect(since(page)).toHaveText(/since: Last save/);
    expect(await markedTexts(page)).toEqual([
      'changed, She paces by the door.',
      'added, A dog barks.',
    ]);
    const added = marked(page).filter({ hasText: 'A dog barks.' });
    await expect(added).toHaveClass(/live-added/);
    await expect(added.locator('.drafter-sr-only')).toHaveText('added, ');
    // A + in the margin for each, hidden from a screen reader; a band behind each.
    const signs = scriptRegion(page).locator('.live-sign');
    await expect(signs).toHaveCount(2);
    await expect(signs.first()).toHaveText('+');
    await expect(signs.first()).toHaveAttribute('aria-hidden', 'true');
    await expect(scriptRegion(page).locator('.live-band')).toHaveCount(2);
    // The palette's command says Hide changes now, and turns it off.
    await runCommand(page, 'Hide changes');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(marked(page)).toHaveCount(0);
  });

  test('a removed-lines button shows the lines struck through', async ({ page }) => {
    await savedThenChanged(page, BASE, BASE.replace('Nobody answers it.\n\n', ''));
    await turnOn(page);
    const button = scriptRegion(page).getByRole('button', { name: '2 lines removed' });
    await expect(button).toBeVisible();
    await expect(button).toHaveText('− 2 lines removed');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const removed = scriptRegion(page).locator('.live-gap-lines del').first();
    await expect(removed).toHaveText('Nobody answers it.');
    expect(await removed.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
      'line-through',
    );
  });

  test('saving clears the marks', async ({ page }) => {
    await savedThenChanged(page, BASE, CHANGED);
    await turnOn(page, 2);
    await save(page);
    await expect(marked(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    // The next edit is marked against the new save.
    await setText(page, CHANGED.replace('Wind.', 'Wind and rain.'));
    await showScript(page);
    await expect(marked(page)).toHaveText(['changed, Wind and rain.']);
  });

  test('since a labelled snapshot from the menu', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await newScript(page);
    await setText(page, BASE);
    await takeSnapshot(page, 'Draft one');
    await setText(page, CHANGED);
    await save(page);
    await setText(page, CHANGED.replace('Wind.', 'Wind and rain.'));
    await showScript(page);
    await turnOn(page, 1);
    await since(page).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText(['Last save', 'Draft one']);
    await menu.getByRole('menuitemcheckbox', { name: 'Draft one' }).click();
    await expect(since(page)).toHaveText(/since: Draft one/);
    await expect(marked(page)).toHaveCount(3);
    expect(await markedTexts(page)).toEqual([
      'changed, She paces by the door.',
      'added, A dog barks.',
      'changed, Wind and rain.',
    ]);
  });

  test('Show changes since this from History', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await newScript(page);
    await setText(page, BASE);
    await takeSnapshot(page);
    await setText(page, CHANGED);
    await runCommand(page, 'History…');
    await options(page).first().focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Show changes since this' }).click();
    await expect(history(page)).toBeHidden();
    await expect(scriptRegion(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(since(page)).toHaveText(/since: \d+:\d\d/);
    await expect(marked(page)).toHaveCount(2);
  });

  test('typing keeps the marks on the right lines', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone shows one pane: the Source or the Script');
    await savedThenChanged(page, BASE, CHANGED);
    await turnOn(page, 2);
    // Type in the first heading, a letter at a time: every later line moves, and its marks with it.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.type(' AGAIN', { delay: 40 });
    await expect(marked(page)).toHaveCount(3);
    expect(await markedTexts(page)).toEqual([
      'changed, INT. HALL - DAY AGAIN',
      'changed, She paces by the door.',
      'added, A dog barks.',
    ]);
  });

  test('N steps through marks in the Script pane', async ({ page }) => {
    await savedThenChanged(page, BASE, CHANGED.replace('Wind.', 'Wind and rain.'));
    await turnOn(page, 3);
    await scriptRegion(page).locator('..').focus();
    const focused = () =>
      page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.change ?? null);
    const labels = [
      'Page 1, INT. HALL - DAY: 1 line changed',
      'Page 1, INT. HALL - DAY: 2 lines added',
      'Page 1, EXT. ROOF - NIGHT: 1 line changed',
    ];
    for (const i of [0, 1, 2, 0]) {
      await page.keyboard.press('n');
      await expect.poll(focused).toBe(String(i));
      await expect(announcer(page)).toHaveText(labels[i] as string);
    }
    await page.keyboard.press('Shift+N');
    await expect.poll(focused).toBe('2');
    // The palette's Next change does the same, with no comparison open.
    await runCommand(page, 'Next change');
    await expect.poll(focused).toBe('0');
  });

  test('off leaves the pages clean and the PDF unchanged', async ({ page }) => {
    await savedThenChanged(page, BASE, CHANGED.replace('Nobody answers it.\n\n', ''));
    const pdf = async () => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const download = page.waitForEvent('download');
      await page
        .getByRole('group', { name: 'Export' })
        .getByRole('button', { name: 'PDF' })
        .click();
      return readFile(await (await download).path());
    };
    const off = await pdf();
    await showScript(page);
    await turnOn(page, 2);
    const on = await pdf();
    expect(on.equals(off)).toBe(true);
    await showScript(page);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(
      scriptRegion(page).locator('.live-mark, .live-band, .live-sign, .live-gap, .live-said'),
    ).toHaveCount(0);
    await expect(scriptRegion(page).locator('[data-change]')).toHaveCount(0);
    // The marks are hidden from print, too.
    await toggle(page).click();
    await expect(marked(page)).toHaveCount(2);
    await page.emulateMedia({ media: 'print' });
    await expect(scriptRegion(page).locator('.live-sign').first()).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });

  test('is off for a Markdown document, and with nothing to compare with', async ({ page }) => {
    await start(page);
    await newScript(page);
    await showScript(page);
    await expect(toggle(page)).toHaveAttribute('aria-disabled', 'true');
    // It still takes focus and a press, and says why it is off.
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(announcer(page)).toHaveText(
      'Nothing to compare with yet: save, or take a snapshot.',
    );
    await expect(toggle(page)).toHaveAccessibleDescription(
      'Nothing to compare with yet: save, or take a snapshot.',
    );
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New Markdown document' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    // The Preview's bar has no toggle, and the palette doesn't offer it.
    await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.insertText('Show changes');
    await expect(
      page.getByRole('dialog', { name: 'Command palette' }).getByRole('option', {
        name: 'Show changes',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});

test.describe('Show changes in a long script', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'long tasks are a Chromium API');
  test.skip(({ isMobile }) => !!isMobile, 'typing with the pages beside it needs two panes');

  test('typing in a 120-page script with it on makes no long task', async ({ page }) => {
    test.setTimeout(120_000);
    // About 120 pages of invented words; the version compared with has a third of its dialogue
    // lines different.
    const scene = (s: number, edit: boolean) =>
      [
        `INT. VARROW ROOM ${s} - DAY`,
        '',
        ...Array.from({ length: 8 }, (_, i) => [
          `Tolven ${s} marsk ${i} quenby orrel pask dorrin vell amber tusk.`,
          '',
          'MARRA',
          edit && i % 3 === 0 ? `Velt ${s} orrin ${i} dask, again.` : `Velt ${s} orrin ${i} dask.`,
          '',
        ]).flat(),
      ].join('\n');
    const script = (edit: boolean) =>
      `Title: Varrow\n\n${Array.from({ length: 150 }, (_, s) => scene(s, edit)).join('\n')}`;
    await removePickers(page);
    await start(page);
    await newScript(page);
    await setText(page, script(false));
    await save(page);
    await setText(page, script(true));
    await showScript(page);
    await expect
      .poll(() => scriptRegion(page).locator('.drafter-page').count(), { timeout: 30_000 })
      .toBeGreaterThan(110);
    await expect(slim(page)).not.toContainText('Updating');
    await turnOn(page);
    await expect.poll(() => marked(page).count(), { timeout: 30_000 }).toBeGreaterThan(100);

    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    const longTasks = () =>
      page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    // The observer is proved first with a task of its own, then emptied.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            const end = performance.now() + 80;
            while (performance.now() < end);
            resolve();
          }),
        ),
    );
    await expect.poll(async () => (await longTasks()).length).toBe(1);
    await page.evaluate(() => {
      (window as unknown as { longTasks: number[] }).longTasks.length = 0;
    });

    const phrase = 'Typing with the changes shown.';
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('End');
    await page.keyboard.type(phrase, { delay: 60 });
    await expect(slim(page)).not.toContainText('Updating');
    await expect(marked(page).filter({ hasText: phrase.toUpperCase() })).toHaveCount(1);
    await page.waitForTimeout(500);
    const tasks = await longTasks();
    console.log(`Typing with Show changes on, 120+ pages: long tasks ${JSON.stringify(tasks)}.`);
    expect(tasks).toEqual([]);
  });
});

test.describe("Show changes' accessibility", () => {
  const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      const after = BASE.replace('She waits', 'She paces').replace('Nobody answers it.\n\n', '');
      await savedThenChanged(page, BASE, after);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await turnOn(page, 1);
      await scriptRegion(page).getByRole('button', { name: '2 lines removed' }).click();
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);
    });
  }
});
