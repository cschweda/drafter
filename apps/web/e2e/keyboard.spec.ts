import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';

// The keyboard-only journey (Phase 1 design §1, item 5): everything a writer does from a new script
// to a PDF, with no pointer. The page records every pointer event it is sent, and the test ends by
// checking there were none. (The accessibility suite waits for the project's final stage, decided
// 2026-10-26; this is the functional half, which stays.)
//
// Safari's Tab skips buttons unless the reader turns that on in its settings, so the part that Tabs
// to a button does not run in WebKit, which has the same keys otherwise; the other keyboard
// tests put focus on a button for that reason.
test.skip(({ isMobile }) => !!isMobile, 'a phone has no keyboard');

const editor = (page: Page) => page.locator('.cm-content');
const status = (page: Page) => page.locator('[data-tour="status"]');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const problemsList = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });

/** The text of the lines CodeMirror has drawn: the whole script while it is this short. */
const text = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content .cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n'),
  );

/** Runs a palette command by typing its name: Mod+K, the name, Enter. */
async function run(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type(name);
  await expect(palette(page).getByRole('option', { name })).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

test('writes, finds, fixes, switches, saves, and exports with no pointer', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', "Safari's Tab skips buttons unless the reader turns that on");
  await removePickers(page);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { pointerSeen: string[] }).pointerSeen = seen;
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) {
      window.addEventListener(type, () => seen.push(type), true);
    }
    // A key's click has no position; a pointer's has a count.
    window.addEventListener('click', (e) => e.detail > 0 && seen.push('click'), true);
  });
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');

  // 1. A new screenplay, from its key, with the cursor in the editor.
  await page.keyboard.press('ControlOrMeta+Alt+n');
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toContainText('Untitled Screenplay');

  // 2. A scene: a heading, action, a cue (Tab on a blank line starts one), a parenthetical, dialogue;
  //    then the same speaker again with (CONT'D), which the lint calls advice with a fix; then a
  //    second scene.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('INT. KITCHEN - DAY\n\nMargaret waits.\n\n');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Margaret\n(quietly)\nIs anyone there?\n\n');
  await page.keyboard.press('Tab');
  await page.keyboard.type("Margaret (CONT'D)\nHello?\n\n");
  await page.keyboard.type('EXT. GARDEN - NIGHT\n\nRain falls.');
  const written = await text(page);
  expect(written).toContain('INT. KITCHEN - DAY');
  expect(written).toContain('@MARGARET\n(quietly)\nIs anyone there?');
  expect(written).toContain("@MARGARET (CONT'D)\nHello?");
  expect(written).toMatch(/EXT\. GARDEN - NIGHT\n+Rain falls\./);

  // 3. Go to the kitchen from the palette.
  await run(page, 'INT. KITCHEN - DAY');
  await expect(editor(page)).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (getSelection()?.anchorNode?.parentElement?.closest('.cm-line') as HTMLElement | null)
            ?.textContent,
      ),
    )
    .toBe('INT. KITCHEN - DAY');

  // 4. Fix a problem: Show Problems, then Tab to the fix and press it.
  await run(page, 'Show Problems');
  const fix = problemsList(page).getByRole('button', { name: "Remove (CONT'D)" });
  await expect(fix).toBeVisible({ timeout: 2000 });
  for (let i = 0; i < 12 && !(await fix.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(fix).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(fix).toBeHidden();
  expect(await text(page)).not.toContain("(CONT'D)");
  expect(await text(page)).toContain('@MARGARET\nHello?');

  // 5. A stage play, and back to a screenplay.
  await run(page, 'Template: Stage play');
  await expect(status(page)).toContainText('Stage play');
  await run(page, 'Template: Screenplay');
  await expect(status(page)).toContainText('Screenplay');

  // 6. Save: Mod+S downloads the file here, where there is no file picker.
  const saved = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const file = await saved;
  expect(file.suggestedFilename()).toBe('Untitled.fountain');
  const source = await readFile(await file.path(), 'utf8');
  expect(source).toContain('INT. KITCHEN - DAY');
  expect(source).toContain('@MARGARET\n(quietly)\nIs anyone there?');
  expect(source).toContain('"template":"us-screenplay"');

  // 7. Export a PDF from the palette.
  const exported = page.waitForEvent('download');
  await run(page, 'Export as PDF');
  const pdf = await exported;
  expect(pdf.suggestedFilename()).toBe('Untitled.pdf');
  expect((await readFile(await pdf.path())).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // Nothing in all of that was a pointer.
  expect(
    await page.evaluate(() => (window as unknown as { pointerSeen: string[] }).pointerSeen),
  ).toEqual([]);
});

// The toolbar by Tab alone, from a fresh page: the order is the mark, Open, Save, Export, Focus, the
// template chip, the palette, and the theme. Each is reached, opened with Enter, and works.
test.describe('the toolbar by Tab', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    "Safari's Tab skips buttons unless the reader turns that on",
  );

  /** Tabs from where focus is until the button named `name` has it. */
  async function tabTo(page: Page, name: string | RegExp) {
    const target = page.getByRole('button', { name }).first();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error(`Tab never reached ${name}`);
  }

  test.beforeEach(async ({ page }) => {
    await removePickers(page);
    await page.goto('/');
    await expect(editor(page)).toContainText('The Call');
  });

  test('chooses the template from the chip, and undoes it', async ({ page }) => {
    await tabTo(page, /^Template:/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(status(page)).toContainText('Stage play');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(status(page)).toContainText('Screenplay');
  });

  test('saves with Save, and exports a PDF from Export', async ({ page }) => {
    await tabTo(page, 'Save');
    const saved = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await saved).suggestedFilename()).toBe('The Call.fountain');

    await tabTo(page, 'Export');
    await page.keyboard.press('Enter');
    const menu = page.getByRole('group', { name: 'Export' });
    await expect(menu).toBeVisible();
    const exported = page.waitForEvent('download');
    const pdf = menu.getByRole('button', { name: 'PDF' });
    for (let i = 0; i < 4 && !(await pdf.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(pdf).toBeFocused();
    await page.keyboard.press('Enter');
    const file = await exported;
    expect(file.suggestedFilename()).toBe('The Call.pdf');
    expect((await readFile(await file.path())).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('starts a new screenplay from the sample bar, with the cursor in the editor', async ({
    page,
  }) => {
    await tabTo(page, 'New screenplay');
    await page.keyboard.press('Enter');
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('INT. HALL - DAY');
    await expect(editor(page)).toContainText('INT. HALL - DAY');
  });
});
