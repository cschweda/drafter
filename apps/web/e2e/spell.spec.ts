import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// Drafter's spellcheck (Phase 2 design §12; Plan D): the worker checks the text after a pause, and
// the Source pane underlines what it marks. Every name, place, and misspelling here is invented.

const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);

const editor = (page: Page) => page.locator('.cm-content');
const marks = (page: Page) => page.locator('.cm-misspelled');
const status = (page: Page) => page.locator('[data-tour="status"]');
const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const slim = (page: Page) =>
  page.locator('.slim').filter({ has: page.getByRole('group', { name: 'Zoom' }) });
const FAILED = 'Spellcheck couldn’t load its dictionary';

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/** The words marked, in order, once the marks have settled on `expected`. */
const expectMarks = (page: Page, expected: string[]) =>
  expect.poll(() => marks(page).allTextContents(), { timeout: 10_000 }).toEqual(expected);

/** Keeps a setting in Drafter's settings table, as Settings would, for the next load to read. */
async function keepSetting(page: Page, key: string, value: unknown) {
  await page.evaluate(
    ([key, value]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key, value });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as const,
  );
}

async function withSetting(page: Page, key: string, value: unknown) {
  await keepSetting(page, key, value);
  await page.reload();
  await expect(editor(page)).toBeAttached();
}

const SCRIPT = [
  'INT. QUORRAVEL STATION - NIGHT',
  '',
  'Ysolde Brannick waits by the phnoe.',
  '',
  'YSOLDE BRANNICK',
  'I wuold never leave Quorravel.',
  '',
  'Brannick’s coat is wet.',
  '',
  'SPLONDER CUT TO:',
  '',
  'EXT. VELLIMORE - DAY',
  '',
  'Ysolde walks to Vellimore.',
  '',
].join('\n');

test.describe('spellcheck', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test('marks a misspelling with a dotted underline and leaves names, locations, and transitions alone', async ({
    page,
  }) => {
    await setText(page, SCRIPT);
    await expectMarks(page, ['phnoe', 'wuold']);
    const style = await marks(page)
      .first()
      .evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--spelling)';
        document.body.append(probe);
        const spelling = getComputedStyle(probe).color;
        probe.remove();
        const css = getComputedStyle(el);
        return {
          line: css.textDecorationLine,
          style: css.textDecorationStyle,
          thickness: css.textDecorationThickness,
          color: css.textDecorationColor,
          spelling,
          invalid: el.getAttribute('aria-invalid'),
        };
      });
    expect(style).toEqual({
      line: 'underline',
      style: 'dotted',
      thickness: '2px',
      color: style.spelling,
      spelling: style.spelling,
      invalid: 'spelling',
    });
    // A marked word retyped is checked again: still wrong, it's marked again, as typed.
    await marks(page).first().dblclick();
    await page.keyboard.type('phoone');
    await expectMarks(page, ['phoone', 'wuold']);
    await marks(page).first().dblclick();
    await page.keyboard.type('phone');
    await expectMarks(page, ['wuold']);
  });

  test('checks British English after the language changes', async ({ page }) => {
    await setText(page, 'INT. HALL - DAY\n\nThe colour of the color.\n');
    await expectMarks(page, ['colour']);
    await withSetting(page, 'spellLanguage', 'en-GB');
    await setText(page, 'INT. HALL - DAY\n\nThe colour of the color.\n');
    await expectMarks(page, ['color']);
  });

  test('checks notes only with the setting on', async ({ page }) => {
    const text =
      'INT. HALL - DAY\n\nThe phnoe rings. [[Fix the rian later]]\n\n/* A boneyrad line. */\n';
    await setText(page, text);
    await expectMarks(page, ['phnoe']);
    await withSetting(page, 'spellNotes', true);
    await setText(page, text);
    await expectMarks(page, ['phnoe', 'rian', 'boneyrad']);
  });

  test('marks a Markdown document’s text and not its code', async ({ page }) => {
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await setText(
      page,
      '# A draft\n\nThe secnod act. Run `zzqxcode` first.\n\n```\nzzqxfence\n```\n\nThe thrid act.\n',
    );
    await expectMarks(page, ['secnod', 'thrid']);
  });

  test('marks nothing with spellcheck off', async ({ page }) => {
    await withSetting(page, 'spellcheck', false);
    await setText(page, SCRIPT);
    await expect(editor(page)).toContainText('phnoe');
    // Longer than the pause and a check.
    await page.waitForTimeout(1500);
    await expect(marks(page)).toHaveCount(0);
    await expect(editor(page)).toHaveAttribute('spellcheck', 'false');
  });
});

const menu = (page: Page) => page.getByRole('menu', { name: 'Spelling suggestions' });
const announcer = (page: Page) => page.locator('.outline-announcer');
/** The editor has focus, with the selection it had. */
const editorFocused = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('.cm-content'));
/** The text the selection holds. */
const selected = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? '');

const WORDS = 'INT. HALL - DAY\n\nThe phnoe rings. A phnoe again. Then the drowr shuts.\n';

test.describe('the spelling menu', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test('right-click on a misspelling opens the menu, and a suggestion replaces it', async ({
    page,
  }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    await marks(page).last().click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('menuitem', { name: 'Ignore here' })).toBeVisible();
    await menu(page).getByRole('menuitem', { name: 'drown', exact: true }).click();
    await expect(menu(page)).toBeHidden();
    await expect(editor(page)).toContainText('Then the drown shuts.');
    await expectMarks(page, ['phnoe', 'phnoe']);
    // Focus is back in the editor, after the word.
    expect(await editorFocused(page)).toBe(true);
    await page.keyboard.type('!');
    await expect(editor(page)).toContainText('Then the drown! shuts.');
  });

  test('right-click elsewhere leaves the browser’s menu', async ({ page }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    await page.evaluate(() => {
      const w = window as unknown as { menus: boolean[] };
      w.menus = [];
      window.addEventListener('contextmenu', (event) => w.menus.push(event.defaultPrevented));
    });
    await editor(page).getByText('INT. HALL - DAY').click({ button: 'right' });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { menus: boolean[] }).menus))
      .toEqual([false]);
    await expect(menu(page)).toHaveCount(0);
    await marks(page).first().click({ button: 'right' });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { menus: boolean[] }).menus))
      .toEqual([false, true]);
    await expect(menu(page)).toBeVisible();
  });

  test('Mod-. opens the menu at the cursor, and Escape gives the editor focus back', async ({
    page,
  }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    // Nothing to open on a word that is spelled right; it says so.
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ControlOrMeta+Period');
    await expect(announcer(page)).toHaveText('No misspelled word at the cursor.');
    await expect(menu(page)).toHaveCount(0);
    // The cursor in "drowr".
    const at = WORDS.indexOf('drowr') + 2;
    await page.keyboard.press('ControlOrMeta+End');
    for (let i = WORDS.length; i > at; i--) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ControlOrMeta+Period');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('menuitem', { name: 'drown', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect.poll(() => editorFocused(page)).toBe(true);
    // The cursor is where it was.
    await page.keyboard.type('Z');
    await expect(editor(page)).toContainText('drZowr');
  });

  test('Add to this script’s dictionary unflags every occurrence at once and Undo brings them back', async ({
    page,
  }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    // How many marks are drawn when the metadata block first is: the edit's own transaction.
    await page.evaluate(() => {
      const w = window as unknown as { marksWithBlock: number | null };
      w.marksWithBlock = null;
      const content = document.querySelector('.cm-content') as HTMLElement;
      new MutationObserver(() => {
        if (w.marksWithBlock === null && content.textContent?.includes('/* drafter')) {
          w.marksWithBlock = content.querySelectorAll('.cm-misspelled').length;
        }
      }).observe(content, { childList: true, subtree: true, characterData: true });
    });
    await marks(page).first().click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: 'Add to this script’s dictionary' }).click();
    await expect(editor(page)).toContainText('"dictionary":["phnoe"]');
    expect(
      await page.evaluate(() => (window as unknown as { marksWithBlock: number }).marksWithBlock),
    ).toBe(1);
    await expectMarks(page, ['drowr']);
    await expect(announcer(page)).toHaveText('Added “phnoe” to this script’s dictionary.');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('/* drafter');
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
  });

  test('Add to my dictionary unflags the word in another script too', async ({ page }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    await marks(page).last().click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: 'Add to my dictionary' }).click();
    await expectMarks(page, ['phnoe', 'phnoe']);
    // Not in the file.
    await expect(editor(page)).not.toContainText('/* drafter');
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await setText(page, 'INT. YARD - DAY\n\nThe drowr and the wuold.\n');
    await expectMarks(page, ['wuold']);
  });

  test('Ignore here unflags one occurrence', async ({ page }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    await marks(page).first().click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: 'Ignore here' }).click();
    await expectMarks(page, ['phnoe', 'drowr']);
    // The one left is the second.
    const left = await marks(page)
      .first()
      .evaluate((el) => el.closest('.cm-line')?.textContent?.indexOf('A phnoe'));
    expect(left).toBeGreaterThan(0);
    await expect(editor(page)).not.toContainText('/* drafter');
  });

  test('Next and Previous misspelling move the cursor and say the word', async ({ page }) => {
    await setText(page, WORDS);
    await expectMarks(page, ['phnoe', 'phnoe', 'drowr']);
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ControlOrMeta+Semicolon');
    await expect(announcer(page)).toHaveText('phnoe. Suggestion: phone.');
    expect(await selected(page)).toBe('phnoe');
    await page.keyboard.press('ControlOrMeta+Semicolon');
    await page.keyboard.press('ControlOrMeta+Semicolon');
    await expect(announcer(page)).toHaveText('drowr. Suggestion: drown.');
    expect(await selected(page)).toBe('drowr');
    // Wrapping past the end, and back.
    await page.keyboard.press('ControlOrMeta+Semicolon');
    await expect(announcer(page)).toHaveText('phnoe. Suggestion: phone.');
    await page.keyboard.press('ControlOrMeta+Shift+Semicolon');
    await expect(announcer(page)).toHaveText(/^drowr\./);
    expect(await selected(page)).toBe('drowr');
  });
});

test.describe('a dictionary that can’t load', () => {
  test('says once that the dictionary couldn’t load, and types on', async ({ page, context }) => {
    let asked = 0;
    await context.route('**/dictionaries/**', (route) => {
      asked++;
      return route.abort();
    });
    await start(page);
    await expect(status(page).getByRole('alert').filter({ hasText: FAILED })).toHaveCount(1);
    await typeOver(page, SCRIPT);
    await page.keyboard.type(' More words, one wuold.');
    await expect(editor(page)).toContainText('More words, one wuold.');
    await page.waitForTimeout(1000);
    await expect(marks(page)).toHaveCount(0);
    // Said once, and still once after the typing; and the typing fetched nothing.
    await expect(status(page).getByRole('alert').filter({ hasText: FAILED })).toHaveCount(1);
    const first = asked;
    expect(first).toBeGreaterThan(0);

    // Another script tries again, once; it fails again, and typing fetches nothing more.
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await expect.poll(() => asked).toBeGreaterThan(first);
    await page.waitForTimeout(1000);
    const retried = asked;
    await typeOver(page, SCRIPT);
    await page.keyboard.type(' Still more, one wuold.');
    await page.waitForTimeout(1500);
    expect(asked).toBe(retried);
    await expect(marks(page)).toHaveCount(0);
    await expect(status(page).getByRole('alert').filter({ hasText: FAILED })).toHaveCount(1);
  });
});

/** Replaces the text, focusing the editor rather than clicking it: on a small phone the status bar's alert can cover it. */
async function typeOver(page: Page, text: string) {
  await showSource(page);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/** Counts the long tasks (over 50 ms) from now on, in `window.longTasks`. */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  // Proof the observer sees what it should: a task of about 80 ms is reported once. Then the list
  // is emptied, so only the typing is judged. (A timer's task: the long-task API doesn't count the
  // evaluation itself.)
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
  await expect.poll(async () => (await longTasks(page)).length).toBe(1);
  await clearLongTasks(page);
}
const longTasks = (page: Page) =>
  page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
const clearLongTasks = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { longTasks: number[] }).longTasks.length = 0;
  });

/** Some 120 pages of the sample, with a misspelled line at the top of every copy. */
const LONG =
  `Margaret reaches for the phnoe. It wuold not ring.\n\n${SAMPLE.slice(SAMPLE.indexOf('# Act One'))}\n`.repeat(
    85,
  );

async function longScript(page: Page) {
  await setText(page, LONG);
  await expect
    .poll(() => script(page).locator('.drafter-page').count(), { timeout: 30_000 })
    .toBeGreaterThan(110);
  await expect(slim(page)).not.toContainText('Updating');
}

/**
 * Types a phrase with a misspelling at the start of the script (the worst place: every later
 * offset moves) and returns the long tasks seen, waiting out the pause and the check after it.
 * Best of three: a busy test machine can give one run a long task that isn't Drafter's.
 */
async function typeAndCount(page: Page, after: () => Promise<void> = async () => {}) {
  let best: number[] | undefined;
  for (let run = 0; run < 3 && (best === undefined || best.length > 0); run++) {
    await clearLongTasks(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('Typign into a long script, one letter at a time. ', { delay: 60 });
    await after();
    // The pause, the check, and the reply's marks.
    await page.waitForTimeout(1500);
    const seen = await longTasks(page);
    if (best === undefined || seen.length < best.length) best = seen;
  }
  return best ?? [];
}

test.describe('in Chromium', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'long tasks are a Chromium API; two panes need a wide screen',
  );

  test('types into a 120-page script with misspellings on screen without a long task', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await start(page);
    await longScript(page);
    await page.keyboard.press('ControlOrMeta+Home');
    // The marks are on screen before the typing starts.
    await expect(marks(page).first()).toBeVisible({ timeout: 15_000 });
    await watchLongTasks(page);
    expect(await typeAndCount(page)).toEqual([]);
    // And the check kept up: what was typed is marked.
    await expect(marks(page).filter({ hasText: 'Typign' }).first()).toBeVisible();
  });

  test('types while the dictionary is still loading without a long task', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const release = holdDictionary(context);
    await start(page);
    await longScript(page);
    await watchLongTasks(page);
    expect(await typeAndCount(page)).toEqual([]);
    // Nothing could be marked yet.
    await expect(marks(page)).toHaveCount(0);
    // Then the dictionary arrives, is read in the worker, and the marks come without a long task.
    release();
    await expect(marks(page).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    expect(await longTasks(page)).toEqual([]);
  });
});

/** Holds every request for a `.dic` until the returned function is called. */
function holdDictionary(context: BrowserContext): () => void {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  void context.route('**/dictionaries/**/*.dic', async (route) => {
    await released;
    await route.continue();
  });
  return release;
}
