import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  openCountsPanel,
  pasteText,
  runCommand,
  settled,
  showSource,
  start,
} from './modules';

// Counts and targets for a novel (Novel plan, Task 8): a book target set in the Counts panel and
// kept in the file's comment; a passage target set from the Outline row's menu, with its progress
// in the row; Stats listing each chapter's words; and typing in a 120,000-word novel, in a
// paragraph and in a chapter heading, makes no long task.

const tree = (page: Page) => page.getByRole('tree', { name: 'Outline' });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name });
const nightWatch = (page: Page) => row(page, /^The Night Watch, chapter/);
const rowMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));
const countsPanel = (page: Page) => page.getByRole('dialog', { name: 'Counts' });
const bookField = (page: Page) => countsPanel(page).getByLabel('Words for the book');
const bookProgress = (page: Page) => countsPanel(page).locator('[data-book-progress]');
const targetDialog = (page: Page) => page.getByRole('dialog', { name: /^Target for / });

/** The sources of the projects stored in Drafter's database. */
function storedSources(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve((request.result as Array<{ source: string }>).map((p) => p.source));
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

async function openSample(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'Novel', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('Low Tide');
  await expect(page.getByRole('group', { name: 'Scripts', exact: true })).toBeHidden();
  await settled(page);
}

async function showOutline(page: Page) {
  await runCommand(page, 'Show Outline');
  await expect(tree(page)).toBeVisible();
}

async function menuFor(page: Page, target: ReturnType<typeof row>) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(rowMenu(page)).toBeVisible();
}

/** The sample's words, as the Counts panel says them. */
async function panelWords(page: Page): Promise<number> {
  const text = (await countsPanel(page).locator('dt:text-is("Words") + dd').textContent()) ?? '';
  return Number(text.replaceAll(',', ''));
}

const percentOf = (words: number, target: number) =>
  words < target
    ? Math.min(99, Math.floor((words * 100) / target))
    : Math.floor((words * 100) / target);

test.describe('the book target', () => {
  test('is set in the Counts panel, shown as words of the target, and kept after a reload', async ({
    page,
  }) => {
    await openSample(page);
    await openCountsPanel(page);
    // The sample comes with a target of 60,000.
    const words = await panelWords(page);
    await expect(bookProgress(page)).toHaveText(
      `${words.toLocaleString('en-US')} of 60,000 words (${percentOf(words, 60_000)}%)`,
    );
    await bookField(page).fill('90000');
    await countsPanel(page).getByRole('button', { name: 'Set target' }).click();
    const line = `${words.toLocaleString('en-US')} of 90,000 words (${percentOf(words, 90_000)}%)`;
    await expect(bookProgress(page)).toHaveText(line);
    await expect(countsPanel(page).getByRole('status')).toHaveText(
      'Book target set: 90,000 words.',
    );

    await showSource(page);
    await expect
      .poll(async () => (await storedSources(page)).some((s) => s.includes('"bookTarget":90000')))
      .toBe(true);
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await openCountsPanel(page);
    await expect(bookProgress(page)).toHaveText(line);
  });

  test('refuses what is not a whole number, and a blank or 0 clears it', async ({ page }) => {
    await openSample(page);
    await openCountsPanel(page);
    const set = countsPanel(page).getByRole('button', { name: 'Set target' });
    await bookField(page).fill('12.5');
    await set.click();
    await expect(countsPanel(page).getByRole('alert')).toContainText('whole number of words');
    await expect(bookField(page)).toHaveAttribute('aria-invalid', 'true');
    // What was there stays.
    await expect(bookProgress(page)).toContainText('of 60,000 words');

    await bookField(page).fill('5,000');
    await set.click();
    await expect(bookProgress(page)).toContainText('of 5,000 words');
    // Past the target, the real percentage.
    await bookField(page).fill('100');
    await set.click();
    await expect(bookProgress(page)).toHaveText(/ of 100 words \(\d{3,}%\)$/);

    await bookField(page).fill('0');
    await set.click();
    await expect(bookProgress(page)).toHaveCount(0);
    await expect(countsPanel(page).getByRole('status')).toHaveText('Book target cleared.');
    await bookField(page).fill('7000');
    await set.click();
    await expect(bookProgress(page)).toBeVisible();
    await bookField(page).fill('');
    await set.click();
    await expect(bookProgress(page)).toHaveCount(0);
  });
});

test.describe('a passage target', () => {
  test('is set from the Outline row’s menu, shows progress in the row, and clears', async ({
    page,
  }) => {
    await openSample(page);
    await showOutline(page);
    await expect(nightWatch(page).locator('.target')).toHaveCount(0);
    await menuFor(page, nightWatch(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Set a target…' }).click();
    await expect(targetDialog(page)).toBeVisible();
    const field = targetDialog(page).getByRole('textbox', { name: 'Words' });
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('inputmode', 'numeric');

    // A word that isn't a number is refused, in words, and the dialog stays.
    await field.fill('lots');
    await page.keyboard.press('Enter');
    await expect(targetDialog(page).getByRole('alert')).toContainText('whole number of words');
    await expect(targetDialog(page)).toBeVisible();

    await field.fill('320');
    await page.keyboard.press('Enter');
    await expect(targetDialog(page)).toBeHidden();
    await expect(nightWatch(page).locator('.target')).toHaveText('50% of 320');
    await expect(nightWatch(page)).toHaveAccessibleName(/, 50% of a 320-word target, To do$/);
    await expect(nightWatch(page)).toBeFocused();

    // Past the target: the real percentage, with the bar full.
    await menuFor(page, nightWatch(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Set a target…' }).click();
    await expect(field).toHaveValue('320');
    await field.fill('100');
    await page.keyboard.press('Enter');
    await expect(nightWatch(page).locator('.target')).toHaveText('160% of 100');

    // Blank clears it.
    await menuFor(page, nightWatch(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Set a target…' }).click();
    await field.fill('');
    await page.keyboard.press('Enter');
    await expect(nightWatch(page).locator('.target')).toHaveCount(0);
    await expect(nightWatch(page)).toBeFocused();
  });

  test('one undo takes the target back', async ({ page }) => {
    await openSample(page);
    await showOutline(page);
    await menuFor(page, nightWatch(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Set a target…' }).click();
    await targetDialog(page).getByRole('textbox', { name: 'Words' }).fill('500');
    await page.keyboard.press('Enter');
    await expect(nightWatch(page).locator('.target')).toHaveText('32% of 500');
    await nightWatch(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(nightWatch(page).locator('.target')).toHaveCount(0);
  });
});

test.describe('Stats for a novel', () => {
  test('lists each chapter’s words under its part, and says nothing of scenes or pages', async ({
    page,
  }) => {
    await openSample(page);
    await openCountsPanel(page);
    await countsPanel(page).getByRole('button', { name: 'Stats…' }).click();
    const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
    const table = stats.getByRole('table', { name: 'Words in each chapter' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(1 + 1 + 3);
    await expect(table.getByRole('row', { name: /^Part One 634$/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /^The Salt Road 275$/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /^The Night Watch 160$/ })).toBeVisible();
    await expect(stats).not.toContainText(/\bscenes?\b|INT\.|\bpages?\b/i);
  });
});

// The long-task budget (Novel plan, Global Constraints): a Chromium API.
test.describe('Typing in a long novel', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'long tasks are a Chromium API');

  test('typing in a 120,000-word novel makes no long task', async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    // 40 chapters of three sections, 3,000 words each: 120,000 words of invented ones.
    const para = (c: number, s: number, p: number) =>
      Array.from(
        { length: 5 },
        (_, i) => `Tolven${c} marsk${s} quenby${p} orrel pask${i} dorrin vell amber tusk wend.`,
      ).join(' ');
    const chapter = (c: number) =>
      [
        `# Chapter ${c} Varrow`,
        '',
        ...Array.from({ length: 3 }, (_, s) => [
          `## Section ${s} of ${c}`,
          '',
          ...Array.from({ length: 20 }, (_, p) => [para(c, s, p), '']).flat(),
        ]).flat(),
      ].join('\n');
    const facts = Object.fromEntries(
      Array.from({ length: 40 }, (_, c) => [
        `chapter:chapter-${c}-varrow:0`,
        { status: 'draft', target: 3500 },
      ]),
    );
    const meta = `<!-- drafter ${JSON.stringify({ template: 'novel', novel: { bookTarget: 150000, nodes: facts } })} -->\n`;
    const book = `${Array.from({ length: 40 }, (_, c) => chapter(c)).join('\n')}\n${meta}`;
    expect(book.split(/\s+/).length).toBeGreaterThan(120_000);

    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New novel' })
      .click();
    await expect(editor(page)).toContainText('# Chapter One');
    await pasteText(page, book);
    if (!isMobile) await showOutline(page);
    await showSource(page);
    await expect(editor(page)).toBeVisible();
    await settled(page);

    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
      // For the log only: how long the slowest key took to reach the screen.
      const keys: number[] = [];
      (window as unknown as { keyTimes: number[] }).keyTimes = keys;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.name === 'keydown') keys.push(entry.duration);
      }).observe({
        type: 'event',
        durationThreshold: 16,
        buffered: false,
      } as PerformanceObserverInit);
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

    // In a paragraph: from the top, two lines down.
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    const phrase = ' Typing in the novel.';
    await page.keyboard.type(phrase, { delay: 60 });
    // In a chapter heading line, which reparses the book in the facts filter.
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('End');
    await page.keyboard.type(' renamed', { delay: 60 });
    await page.waitForTimeout(700);
    const tasks = await longTasks();
    const keys = await page.evaluate(() => (window as unknown as { keyTimes: number[] }).keyTimes);
    console.log(
      `Typing in a 120,000-word novel: long tasks ${JSON.stringify(tasks)}; keys over 16 ms ${JSON.stringify(keys)}.`,
    );
    await expect(editor(page)).toContainText('# Chapter 0 Varrow renamed');
    expect(tasks).toEqual([]);
  });
});

// axe on what Counts and targets add, in both themes, in every project.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function clean(page: Page, state: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
    state,
  ).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`counts and targets for a novel in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await openSample(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    });

    test(`passes axe on the Counts panel, the target dialog, and Stats (${theme})`, async ({
      page,
    }) => {
      await openCountsPanel(page);
      await bookField(page).fill('90000');
      await countsPanel(page).getByRole('button', { name: 'Set target' }).click();
      await expect(bookProgress(page)).toBeVisible();
      await clean(page, 'the Counts panel with a book target');
      await bookField(page).fill('12.5');
      await countsPanel(page).getByRole('button', { name: 'Set target' }).click();
      await expect(countsPanel(page).getByRole('alert')).toBeVisible();
      await clean(page, 'the Counts panel with a problem');
      await countsPanel(page).getByRole('button', { name: 'Stats…' }).click();
      const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
      await expect(stats.getByRole('table', { name: 'Words in each chapter' })).toBeVisible();
      await clean(page, 'Stats for a novel');
      await showOutline(page);
      await menuFor(page, nightWatch(page));
      await rowMenu(page).getByRole('menuitem', { name: 'Set a target…' }).click();
      await expect(targetDialog(page)).toBeVisible();
      await clean(page, 'the target dialog');
      await targetDialog(page).getByRole('textbox', { name: 'Words' }).fill('x');
      await page.keyboard.press('Enter');
      await expect(targetDialog(page).getByRole('alert')).toBeVisible();
      await clean(page, 'the target dialog with a problem');
    });
  });
}
