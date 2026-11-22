import { expect, type Page, test } from './fixtures';
import { editor, palette, showSource, start } from './modules';

// The cursor stays where the writer left it when focus comes back to the editor (2026-11-22).
//
// A browser that gives an editable element focus with no selection inside it puts the caret at
// the element's start. CodeMirror puts it back where its own cursor is, but only when it hears of
// the caret within 200 ms of the focus: later than that, it takes the caret as the writer's, and
// the cursor is at the top of the script. Closing the palette or a dialog gives the editor focus
// that way, and a page can be busy for longer than 200 ms just then (a long script laid out
// again), so the next thing typed went in at the top. These tests make the page busy as focus
// arrives, which is all it took.

/** Where the editor's cursor is, as "at the end" or the place it is. */
const cursor = (page: Page) =>
  page.evaluate(() => {
    type View = { state: { doc: { length: number }; selection: { main: { head: number } } } };
    type Linked = { view?: View };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    const view = (content?.cmTile ?? content?.cmView)?.view;
    if (!view) return 'no editor';
    const { head } = view.state.selection.main;
    return head === view.state.doc.length ? 'at the end' : `at ${head}`;
  });

/** From now on the page is busy for `ms` each time focus arrives in the editor. */
const busyAsFocusArrives = (page: Page, ms = 400) =>
  page.evaluate((ms) => {
    document.addEventListener(
      'focusin',
      (event) => {
        if (!(event.target as Element).closest?.('.cm-content')) return;
        const from = performance.now();
        while (performance.now() - from < ms);
      },
      true,
    );
  }, ms);

/** Past the busy time and the browser's word of where its caret is. */
const settledCursor = async (page: Page) => {
  await expect(editor(page)).toBeFocused();
  await page.waitForTimeout(800);
  return cursor(page);
};

test.describe('the cursor, when focus comes back to a busy page', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect.poll(() => cursor(page)).toBe('at the end');
    await busyAsFocusArrives(page);
  });

  test('stays put when the palette closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    expect(await settledCursor(page)).toBe('at the end');
    // And what is typed next goes there.
    await page.keyboard.type('Q');
    await expect
      .poll(() => editor(page).evaluate((el) => el.textContent?.endsWith('Q')))
      .toBe(true);
  });

  test('stays put when a dialog closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog', { name: /Settings/ });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await settledCursor(page)).toBe('at the end');
  });

  test('stays put when the editor is given focus plainly', async ({ page }) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(editor(page)).not.toBeFocused();
    await page.evaluate(() => document.querySelector<HTMLElement>('.cm-content')?.focus());
    expect(await settledCursor(page)).toBe('at the end');
  });

  test('goes where the writer clicks', async ({ page, isMobile }) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(editor(page)).not.toBeFocused();
    const line = editor(page).locator('.cm-line').first();
    if (isMobile) await line.tap();
    else await line.click();
    await expect(editor(page)).toBeFocused();
    await page.waitForTimeout(800);
    expect(await cursor(page)).not.toBe('at the end');
  });
});
