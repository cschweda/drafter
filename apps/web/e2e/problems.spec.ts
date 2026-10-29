import { expect, type Page, test } from '@playwright/test';

import { expectNewestThenCompare, listedReasons, newScreenplay } from './bulk-snapshot';
import { runCommand } from './modules';

const editor = (page: Page) => page.locator('.cm-content');

/** The pane that holds Problems when it is chosen: the right pane, or the only one on a phone. */
const lastPane = (page: Page) => page.locator('[data-pane]').last();
const problemsTab = (page: Page) => lastPane(page).getByRole('tab', { name: /^Problems/ });
const list = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });
const problemButton = (page: Page, text: RegExp | string) =>
  list(page).getByRole('button', { name: text });

const HEADING_NO_TIME = /Warning: The scene heading "INT\. HALL" has no time of day/;

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

/** Replaces the script with `text`, typed in one go. */
async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

async function showProblems(page: Page) {
  await problemsTab(page).click();
  await expect(list(page)).toBeVisible();
}

/** The script's text, line by line, with line breaks as `\n`. */
const text = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content .cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n'),
  );

/**
 * Types over `find` in the text and, in the same task, presses the button: no timer can run
 * between them, so the 300 ms the lint waits cannot have passed.
 */
async function editThenPress(
  page: Page,
  change: { find: string; replace: string },
  button: string,
) {
  await page.evaluate(
    async ({ find, replace, button }) => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      content.focus();
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf(find) ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + find.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        break;
      }
      document.execCommand('insertText', false, replace);
      // Let the editor read the change from the page before the button is pressed.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const target = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] button'),
      ).find((b) => b.textContent?.trim() === button);
      if (!target) throw new Error(`no button named ${button}`);
      target.click();
    },
    { ...change, button },
  );
}

/** Turns Strict Fountain on in the Settings dialog. */
async function enableStrict(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('switch', { name: 'Strict Fountain' }).check();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
}

const CONTD = "MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi again.\n";
const TWO_CONTD = "MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi.\n\nMARGARET (CONT'D)\nHi.\n";
const STRICT = 'INT. HALL - DAY\nShe waits.\n\nMARGARET\n(quietly,\nthen louder)\nHi.\n';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
});

test('lists a problem as it appears', async ({ page }) => {
  await setText(page, 'INT. HALL\n\nShe waits.');
  await showProblems(page);
  const problem = problemButton(page, HEADING_NO_TIME);
  await expect(problem).toBeVisible({ timeout: 1000 });
  await expect(problem).toContainText('Line 1');
  await expect(problem).toHaveAccessibleName(/^Warning: .* Line 1$/);
});

test('jumps to a problem', async ({ page, isMobile }) => {
  await setText(page, 'Some action.\n\nINT. HALL\n\nShe waits.');
  await showProblems(page);
  await problemButton(page, HEADING_NO_TIME).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toBeFocused();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toBe('INT. HALL');
  // The Source tab shows: on a phone, in place of Problems.
  if (isMobile) await expect(list(page)).toBeHidden();
});

test('applies a fix', async ({ page }) => {
  await setText(page, CONTD);
  await showProblems(page);
  const fix = list(page).getByRole('button', { name: "Remove (CONT'D)" });
  await expect(fix).toBeVisible({ timeout: 1000 });
  await fix.click();
  await expect.poll(() => text(page)).toBe('MARGARET\nHi.\n\nMARGARET\nHi again.\n');
  // The fixed problem doesn't linger for the lint's 300 ms.
  await expect(fix).toBeHidden({ timeout: 250 });
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => text(page)).toBe(CONTD);
});

test('applies no fix to text that changed after linting', async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    'the text can be typed in only while the Source tab shows, not with the list',
  );
  await setText(page, CONTD);
  await showProblems(page);
  await expect(list(page).getByRole('button', { name: "Remove (CONT'D)" })).toBeVisible({
    timeout: 1000,
  });
  // The second cue becomes a different one, and the fix is pressed in the same task, before
  // the 300 ms the lint waits can pass.
  await editThenPress(page, { find: "(CONT'D)", replace: '(V.O.)' }, "Remove (CONT'D)");
  expect(await text(page)).toBe('MARGARET\nHi.\n\nMARGARET (V.O.)\nHi again.\n');
  // The list refreshes: the problem is gone.
  await expect(list(page).getByRole('button', { name: "Remove (CONT'D)" })).toBeHidden();
  await expect(list(page).getByText(/CONT'D/)).toBeHidden();
  expect(await text(page)).toBe('MARGARET\nHi.\n\nMARGARET (V.O.)\nHi again.\n');
});

test('counts problems on the tab and in the status bar', async ({ page }) => {
  const status = page.locator('footer');
  await setText(page, 'INT. HALL\n\nShe waits.\n\nINT. YARD\n\nHe waits.');
  await expect(problemsTab(page)).toHaveText(/^Problems\s+2$/, { timeout: 1000 });
  await expect(problemsTab(page)).toHaveAccessibleName('Problems 2');
  await expect(status).toContainText('2 problems');

  await setText(page, 'INT. HALL\n\nShe waits.');
  await expect(problemsTab(page)).toHaveText(/^Problems\s+1$/, { timeout: 1000 });
  await expect(status).toContainText('1 problem');
  await expect(status).not.toContainText('1 problems');

  // Advice isn't a fault: a (CONT'D) typed by hand is info, and isn't counted.
  await setText(page, CONTD);
  await showProblems(page);
  await expect(list(page).getByRole('button', { name: "Remove (CONT'D)" })).toBeVisible({
    timeout: 1000,
  });
  await expect(problemsTab(page)).toHaveText(/^Problems\s*$/);
  await expect(status).toContainText('No problems');
});

test('fixes everything at once in Strict Fountain', async ({ page }) => {
  await setText(page, STRICT);
  await showProblems(page);
  // Off to begin with: the problems are advice, and there is nothing to fix all of.
  await expect(problemButton(page, /Info: .* Line 1$/)).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole('button', { name: 'Fix all' })).toBeHidden();

  await enableStrict(page);

  await showProblems(page);
  await expect(problemButton(page, /^Warning: .* Line 1$/)).toBeVisible({ timeout: 1000 });
  await expect(problemButton(page, /^Warning: .* Line 5$/)).toBeVisible();
  await page.getByRole('button', { name: 'Fix all' }).click();
  await expect
    .poll(() => text(page))
    .toBe('INT. HALL - DAY\n\nShe waits.\n\nMARGARET\n(quietly, then louder)\nHi.\n');
  await expect(page.getByRole('button', { name: 'Fix all' })).toBeHidden();

  // One undo takes back both.
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => text(page)).toBe(STRICT);
});

test('takes a snapshot before Fix all, and none when the text equals the newest', async ({
  page,
}) => {
  await newScreenplay(page);
  await setText(page, STRICT);
  await enableStrict(page);
  await showProblems(page);
  await page.getByRole('button', { name: 'Fix all' }).click();
  await expect
    .poll(() => text(page))
    .toBe('INT. HALL - DAY\n\nShe waits.\n\nMARGARET\n(quietly, then louder)\nHi.\n');
  const count = await expectNewestThenCompare(page, 'Before Fix all');

  // Undo, and Fix all again: the text before it equals the newest snapshot, so none is added.
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => text(page)).toBe(STRICT);
  await showProblems(page);
  await page.getByRole('button', { name: 'Fix all' }).click();
  await expect.poll(() => text(page)).not.toBe(STRICT);
  expect(await listedReasons(page)).toHaveLength(count);
});

test('jumps to a problem and applies its fix from the keyboard', async ({ page }) => {
  await setText(page, CONTD);
  await showProblems(page);
  const jump = problemButton(page, /Info: .* Line 4$/);
  await expect(jump).toBeVisible({ timeout: 1000 });
  await jump.focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("MARGARET (CONT'D)");

  await showProblems(page);
  const fix = list(page).getByRole('button', { name: "Remove (CONT'D)" });
  await fix.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => text(page)).toBe('MARGARET\nHi.\n\nMARGARET\nHi again.\n');
  // Nothing is left, so focus stays in the list's panel and not on the page.
  await expect(list(page)).toBeFocused();
});

test('moves focus to the next problem after a fix', async ({ page }) => {
  await setText(page, TWO_CONTD);
  await showProblems(page);
  const fixes = list(page).getByRole('button', { name: "Remove (CONT'D)" });
  await expect(fixes).toHaveCount(2, { timeout: 1000 });
  await fixes.first().focus();
  await page.keyboard.press('Space');
  await expect(fixes).toHaveCount(1);
  await expect(problemButton(page, /Info: .* Line 7$/)).toBeFocused();
});

test('moves focus to the panel after Fix all', async ({ page }) => {
  await setText(page, STRICT);
  await enableStrict(page);
  await showProblems(page);
  const fixAll = page.getByRole('button', { name: 'Fix all' });
  await expect(fixAll).toBeVisible({ timeout: 1000 });
  await fixAll.focus();
  await page.keyboard.press('Enter');
  await expect(fixAll).toBeHidden();
  await expect(list(page)).toBeFocused();
});

test.describe('while typing', () => {
  test.skip(
    ({ isMobile }) => !!isMobile,
    'the text can be typed in only while the Source tab shows',
  );

  test('keeps the list items, and focus in them, when text above them changes', async ({
    page,
  }) => {
    await setText(page, 'INT. HALL\n\nShe waits.\n\nINT. YARD\n\nHe waits.');
    await showProblems(page);
    const second = problemButton(page, /INT\. YARD/);
    await expect(second).toContainText('Line 5', { timeout: 1000 });
    await second.focus();
    // The page's own mark on the element: a new element would not have it.
    await second.evaluate((el) => el.closest('li')?.setAttribute('data-mark', 'kept'));

    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Above.\n\n');
    await expect(second).toContainText('Line 7', { timeout: 1000 });
    await expect(list(page).locator('li[data-mark="kept"]')).toHaveCount(1);

    // Same element, so focus there is not lost to a remount.
    await second.focus();
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('More.\n\n');
    await expect(second).toContainText('Line 9', { timeout: 1000 });
    await expect(list(page).locator('li[data-mark="kept"]')).toHaveCount(1);
  });

  test('keeps focus on a problem while text above it changes', async ({ page }) => {
    await setText(page, 'INT. HALL\n\nShe waits.\n\nINT. YARD\n\nHe waits.');
    await showProblems(page);
    const second = problemButton(page, /INT\. YARD/);
    await expect(second).toContainText('Line 5', { timeout: 1000 });
    await second.focus();
    // An edit made without moving focus out of the list: one dispatched in the page.
    await page.evaluate(() => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      const keep = document.activeElement as HTMLElement;
      content.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(content.querySelector('.cm-line') as Node, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('insertText', false, 'Above.\n\n');
      keep.focus();
    });
    await expect(second).toContainText('Line 7', { timeout: 1000 });
    await expect(second).toBeFocused();
  });
});

test.describe('after a fix that did nothing', () => {
  test.skip(
    ({ isMobile }) => !!isMobile,
    'the text can be typed in only while the Source tab shows',
  );

  test('leaves focus in the editor when the writer goes on typing', async ({ page }) => {
    await setText(page, CONTD);
    await showProblems(page);
    await expect(list(page).getByRole('button', { name: "Remove (CONT'D)" })).toBeVisible({
      timeout: 1000,
    });
    // The text changes after the last problem, so the list stays as it is, and the fix (found
    // in the old text) does nothing.
    await editThenPress(page, { find: 'Hi again.', replace: 'Hi again!' }, "Remove (CONT'D)");
    expect(await text(page)).toBe("MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi again!\n");

    // Then the writer types above the problem, which moves it to another line.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Above.\n\n');
    await expect(problemButton(page, /Info: .* Line 6$/)).toBeVisible({ timeout: 1000 });
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('Still here.');
    expect(await text(page)).toContain('Still here.');
  });
});

test.describe('in a read-only tab', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two tabs are the same on a phone');

  test('offers no fix, and no Fix all', async ({ page, context }) => {
    await setText(page, STRICT);
    await enableStrict(page);
    // Wait for the text and the setting to be in the database the second tab reads.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open('drafter');
              open.onsuccess = () => {
                const db = open.result;
                const done = (ok: boolean) => {
                  db.close();
                  resolve(ok);
                };
                const projects = db.transaction('projects').objectStore('projects').getAll();
                projects.onsuccess = () =>
                  done(
                    (projects.result as Array<{ source: string }>).some((p) =>
                      p.source.includes('then louder'),
                    ),
                  );
                projects.onerror = () => done(false);
              };
              open.onerror = () => resolve(false);
            }),
        ),
      )
      .toBe(true);

    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
    await expect(other.locator('.cm-content')).toContainText('then louder');
    await problemsTab(other).click();
    const panel = other.getByRole('tabpanel', { name: /^Problems/ });
    const warning = panel.getByRole('button', { name: /^Warning: .* Line 5$/ });
    await expect(warning).toBeVisible({ timeout: 2000 });
    await expect(other.getByRole('button', { name: 'Fix all' })).toBeHidden();
    const fix = panel.getByRole('button', { name: 'Join onto one line' });
    await expect(fix).toHaveAttribute('aria-disabled', 'true');
    // Pressed anyway (Playwright won't click a disabled button): nothing happens.
    await fix.click({ force: true });
    expect(await text(other)).toBe(STRICT);
  });
});

// The Spelling group (Plan D, Calls 13 and 14): the spellcheck's marks, listed after the problems
// and never counted with them. Every misspelling here is invented.
test.describe('the Spelling group', () => {
  const MISSPELT = 'INT. HALL\n\nThe phnoe rings.\n\nA phnoe again. Then the drowr shuts.\n';
  const spellingHeading = (page: Page) => list(page).getByRole('heading', { name: /^Spelling/ });
  const spellingRows = (page: Page) =>
    list(page).getByRole('list', { name: 'Spelling' }).getByRole('button');
  const announcer = (page: Page) => page.locator('.outline-announcer');
  const marks = (page: Page) => page.locator('.cm-misspelled');

  test('lists misspellings under Spelling, outside the problem count', async ({ page }) => {
    await setText(page, MISSPELT);
    await showProblems(page);
    await expect(spellingHeading(page)).toHaveText('Spelling: 3 words', { timeout: 10_000 });
    await expect(spellingRows(page)).toHaveText([
      /^phnoe\s*Line 3$/,
      /^phnoe\s*Line 5$/,
      /^drowr\s*Line 5$/,
    ]);
    await expect(spellingRows(page).first()).toHaveAccessibleName('phnoe Line 3');
    // Only the heading's missing time is a problem: the misspellings aren't counted.
    await expect(problemButton(page, HEADING_NO_TIME)).toBeVisible();
    await expect(problemsTab(page)).toHaveText(/^Problems\s+1$/);
    await expect(page.locator('footer')).toContainText('1 problem');
    // Mended, a word leaves the group.
    await showSource(page);
    await marks(page).last().dblclick();
    await page.keyboard.type('drawer');
    await showProblems(page);
    await expect(spellingHeading(page)).toHaveText('Spelling: 2 words', { timeout: 10_000 });
  });

  test('Check spelling shows Problems with the Spelling heading focused', async ({ page }) => {
    await setText(page, MISSPELT);
    // At once, before the check after the pause has come back: it waits for it.
    await runCommand(page, 'Check spelling');
    await expect(list(page)).toBeVisible();
    await expect(spellingHeading(page)).toBeFocused();
    await expect(spellingHeading(page)).toHaveText('Spelling: 3 words');
    await expect(announcer(page)).toHaveText('3 misspelled words.');
  });

  test('a Spelling row goes to its word and selects it', async ({ page }) => {
    await setText(page, MISSPELT);
    await showProblems(page);
    await expect(spellingRows(page)).toHaveCount(3, { timeout: 10_000 });
    await spellingRows(page).nth(1).click();
    await expect(editor(page)).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('phnoe');
    // It is the second phnoe that is selected.
    await page.keyboard.type('phone');
    await expect.poll(() => text(page)).toContain('A phone again.');
    expect(await text(page)).toContain('The phnoe rings.');
    // From a row, Spelling suggestions opens the word's menu.
    await showProblems(page);
    await expect(spellingRows(page)).toHaveCount(2, { timeout: 10_000 });
    await spellingRows(page).first().click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+Period');
    await expect(page.getByRole('menu', { name: 'Spelling suggestions' })).toBeVisible();
  });

  test('Check spelling with spellcheck off says so', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const spellcheck = dialog.getByRole('switch', { name: 'Spellcheck', exact: true });
    await spellcheck.uncheck();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await setText(page, MISSPELT);
    await runCommand(page, 'Check spelling');
    await expect(announcer(page)).toHaveText('Spellcheck is off. Turn it on in Settings.');
    // No setting is changed, and Problems has no Spelling group.
    await page.keyboard.press('ControlOrMeta+,');
    await expect(spellcheck).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await showProblems(page);
    await expect(problemButton(page, HEADING_NO_TIME)).toBeVisible();
    await expect(spellingHeading(page)).toHaveCount(0);
    await expect(marks(page)).toHaveCount(0);
  });
});
