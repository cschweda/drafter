import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';

// The keyboard-only journey (Phase 1 design §1, item 5): everything a writer does from a new script
// to a PDF, with no pointer. The page records every pointer event it is sent, and the test ends by
// checking there were none. (The axe half of the accessibility suite is
// a11y.spec.ts.)
//
// Safari's Tab skips buttons unless the reader turns that on in its settings, so in WebKit the part
// that Tabs to a button puts focus there instead (the other keyboard tests do the same), and the
// tests that are Tab from end to end do not run there. Everything else runs in all three engines.
test.skip(({ isMobile }) => !!isMobile, 'a phone has no keyboard');

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
// pdf-lib is render-pdf's, so it is found from there.
const { PDFDocument } = createRequire(`${ROOT}/packages/render-pdf/package.json`)(
  'pdf-lib',
) as typeof import('pdf-lib');

const editor = (page: Page) => page.locator('.cm-content');
const status = (page: Page) => page.locator('[data-tour="status"]');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const problemsList = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });

/**
 * Records every pointer event the page is sent, for `noPointer` to check. Call before `goto`.
 */
async function watchPointer(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { pointerSeen: string[] }).pointerSeen = seen;
    // A pointer's click comes after its pointerdown and mousedown, which are recorded; the click
    // itself is not, since Firefox gives a link's click from Enter a count too.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) {
      window.addEventListener(type, () => seen.push(type), true);
    }
  });
}
const noPointer = async (page: Page) =>
  expect(
    await page.evaluate(() => (window as unknown as { pointerSeen: string[] }).pointerSeen),
  ).toEqual([]);

/**
 * Opens the page and waits until the app is ready for a first key: the sample is loaded, and its bar
 * (which shows once the project is) is up, so a shortcut finds the commands registered and the
 * script session settled.
 */
async function open(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
  await expect(page.getByRole('region', { name: 'Sample' })).toBeVisible();
}

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
  await removePickers(page);
  await watchPointer(page);
  await open(page);

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
  if (browserName === 'webkit') {
    // Safari's Tab skips buttons; focus is put there instead, and the key does the rest.
    await fix.focus();
  } else {
    for (let i = 0; i < 12 && !(await fix.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
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
  expect(source).not.toContain("(CONT'D)");
  expect(source).toContain('@MARGARET\nHello?');

  // 7. Export a PDF from the palette.
  const exported = page.waitForEvent('download');
  await run(page, 'Export as PDF');
  const pdf = await exported;
  expect(pdf.suggestedFilename()).toBe('Untitled.pdf');
  const bytes = await readFile(await pdf.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // A whole file: it ends as a PDF does, and holds the page (the title page is gone with Select All).
  expect(bytes.subarray(-32).toString('latin1')).toContain('%%EOF');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);

  // Nothing in all of that was a pointer.
  await noPointer(page);
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

  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) return;
    await removePickers(page);
    await watchPointer(page);
    await open(page);
  });

  test.afterEach(async ({ page, isMobile }, testInfo) => {
    // The skipped tests (a phone has no keyboard) opened nothing to check.
    if (isMobile || testInfo.status === 'skipped') return;
    await noPointer(page);
  });

  test('skips to the editor from the first Tab', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to the editor' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('Zz');
    expect(await text(page)).toContain('Zz');
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
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.subarray(-32).toString('latin1')).toContain('%%EOF');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
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
