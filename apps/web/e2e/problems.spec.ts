import { expect, type Page, test } from '@playwright/test';

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

const CONTD = "MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi again.\n";
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

  await page.keyboard.press('ControlOrMeta+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('switch', { name: 'Strict Fountain' }).check();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

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
});
