import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { runCommand, settled, showSource, showView, start } from './modules';

// Focus on one chapter or one section (Novel plan, Task 7): only the passage shows in the Source
// and the Preview, typing in it works, the whole book is still the document, and Show the whole
// book (or deleting the focused heading, Review Focus 5) brings everything back.

const source = (page: Page) => page.locator('.cm-content');
const bar = (page: Page) => page.getByRole('region', { name: 'Passage' });
const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });
/** The polite live region the Outline and the focus speak in. */
const announcer = (page: Page) => page.locator('.outline-announcer');

/** Where the editor's cursor is, and the whole text. */
const cursor = (page: Page) =>
  page.evaluate(() => {
    type Linked = {
      view?: { state: { selection: { main: { head: number } }; doc: { toString(): string } } };
    };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    const state = (content?.cmTile ?? content?.cmView)?.view?.state;
    return { head: state?.selection.main.head ?? -1, text: state?.doc.toString() ?? '' };
  });

/** The whole book, from the editor's state (the page draws only the lines in view). */
const textOf = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { doc: { toString(): string } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.doc.toString() ?? '';
  });

/** Puts the cursor just after `find` in the Source, and focus in the editor. */
async function cursorAfter(page: Page, find: string) {
  await showSource(page);
  await page.evaluate((text) => {
    type Linked = {
      view?: {
        state: { doc: { toString(): string } };
        dispatch(spec: unknown): void;
        focus(): void;
      };
    };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    const view = (content?.cmTile ?? content?.cmView)?.view;
    if (!view) return;
    const at = view.state.doc.toString().indexOf(text) + text.length;
    view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    view.focus();
  }, find);
}

/** Opens the sample novel (the Scripts menu's Samples), in the Source. */
async function openSample(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'Novel', exact: true })
    .click();
  await expect(source(page)).toContainText('Low Tide');
  await expect(page.getByRole('group', { name: 'Scripts', exact: true })).toBeHidden();
  await settled(page);
}

test.describe('focus on one chapter or one section', () => {
  test('shows only the chapter in the Source and the Preview, and typing in it works', async ({
    page,
  }) => {
    await openSample(page);
    const book = await textOf(page);
    await cursorAfter(page, 'ninety-one steps');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toContainText('Chapter 3 · The Night Watch — showing this chapter.');
    await expect(announcer(page)).toHaveText('Showing Chapter 3 · The Night Watch.');
    await expect(source(page)).toContainText('# The Night Watch');
    await expect(source(page)).toContainText('## The Turning Light');
    await expect(source(page)).not.toContainText('The Salt Road');
    await expect(source(page)).not.toContainText('Low Tide');
    await expect(source(page)).not.toContainText('to let him in.');
    // Hidden, not removed: the document is the whole book.
    expect(await textOf(page)).toBe(book);

    await expect(source(page)).toBeFocused();
    await page.keyboard.type(' Then wind.');
    await expect(source(page)).toContainText('Then wind.');
    await expect.poll(() => textOf(page)).toContain('# The Salt Road');
    expect(await textOf(page)).toContain('Then wind.');
    expect((await textOf(page)).length).toBe(book.length + ' Then wind.'.length);

    await showView(page, 'Preview');
    await expect(preview(page)).toContainText('Then wind.');
    await expect(preview(page).getByRole('heading', { name: 'The Night Watch' })).toBeVisible();
    await expect(preview(page)).not.toContainText('The Salt Road');
    await expect(preview(page)).not.toContainText('A Letter in Another Hand');

    await showSource(page);
    await bar(page).getByRole('button', { name: 'Show the whole book' }).click();
    await expect(bar(page)).toBeHidden();
    // The chapter before shows again: its last line, which is near the cursor (the editor draws the
    // lines in view, and a phone's view is short).
    await expect(source(page)).toContainText('to let him in.');
    await showView(page, 'Preview');
    await expect(preview(page)).toContainText('The Salt Road');
  });

  test('a section, by its command, and the keys for the passage and the whole book', async ({
    page,
  }) => {
    await openSample(page);
    await cursorAfter(page, '## The Visitor');
    await runCommand(page, 'Focus on this section');
    await expect(bar(page)).toContainText('Section 2 · The Visitor — showing this section.');
    await expect(announcer(page)).toHaveText('Showing Section 2 · The Visitor.');
    await expect(source(page)).not.toContainText('## The Page');
    await expect(source(page)).not.toContainText('The Night Watch');

    await page.keyboard.press('ControlOrMeta+Alt+Shift+F');
    await expect(bar(page)).toBeHidden();
    await expect(announcer(page)).toHaveText('Showing the whole book.');
    await expect(source(page)).toContainText('## The Page');

    // Focus on this passage: the section at the cursor, then, again, its chapter.
    await cursorAfter(page, '## The Page');
    await page.keyboard.press('ControlOrMeta+Alt+F');
    await expect(bar(page)).toContainText('Section 1 · The Page — showing this section.');
    await expect(source(page)).not.toContainText('## The Visitor');
    await page.keyboard.press('ControlOrMeta+Alt+F');
    await expect(bar(page)).toContainText(
      'Chapter 2 · A Letter in Another Hand — showing this chapter.',
    );
    await expect(announcer(page)).toHaveText('Showing Chapter 2 · A Letter in Another Hand.');
    await expect(source(page)).toContainText('## The Visitor');
    await expect(source(page)).not.toContainText('Low Tide');
  });

  test('the keys and a click keep the cursor in the passage', async ({ page }) => {
    await openSample(page);
    await cursorAfter(page, '## The Page');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    await expect(source(page)).toBeFocused();
    const { text } = await cursor(page);
    const from = text.indexOf('# A Letter in Another Hand');
    const next = text.indexOf('# The Night Watch');
    // Up from the heading, and the top of the text: the heading's line.
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ControlOrMeta+Home');
    expect((await cursor(page)).head).toBe(from);
    // The end of the text: the passage's last line, which brings the comment under it into view.
    await page.keyboard.press('ControlOrMeta+End');
    const end = (await cursor(page)).head;
    expect(end).toBeGreaterThan(from);
    expect(end).toBeLessThan(next);
    // A click on the comment, under the passage: the passage's last line too.
    await page.keyboard.press('ArrowUp');
    await source(page).locator('.cm-line', { hasText: '<!-- drafter' }).click();
    const { head } = await cursor(page);
    expect(head).toBeGreaterThan(from);
    expect(head).toBeLessThan(next);
    await expect(bar(page)).toBeVisible();
  });

  test('Go to another passage from the Outline shows the whole book', async ({ page }) => {
    await openSample(page);
    await cursorAfter(page, 'ninety-one steps');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    await runCommand(page, 'Show Outline');
    const row = page
      .getByRole('tree', { name: 'Outline' })
      .getByRole('treeitem', { name: /^The Visitor, section/ });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(source(page)).toBeFocused();
    await expect(bar(page)).toBeHidden();
    await expect(announcer(page)).toHaveText('Showing the whole book.');
    await expect(source(page)).toContainText('## The Visitor');
  });

  test('Replace All changes only the focused chapter, and says so', async ({ page }) => {
    await openSample(page);
    const book = await textOf(page);
    await cursorAfter(page, 'ninety-one steps');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press('ControlOrMeta+f');
    const panel = page.locator('.cm-search');
    await expect(panel).toBeVisible();
    await panel.locator('input[name="search"]').fill('Wren');
    await panel.locator('input[name="replace"]').fill('Robin');
    await panel.locator('button[name="replaceAll"]').click();
    await expect(page.locator('.cm-announced')).toHaveText(
      /^Replaced \d+ match(es)? in this chapter\.$/,
    );
    const at = book.indexOf('# The Night Watch');
    const end = book.indexOf('<!-- drafter');
    const text = await textOf(page);
    expect(text.slice(0, at)).toBe(book.slice(0, at));
    expect(text.slice(text.indexOf('<!-- drafter'))).toBe(book.slice(end));
    expect(text.slice(at, text.indexOf('<!-- drafter'))).toBe(
      book.slice(at, end).replaceAll('Wren', 'Robin'),
    );
    expect(book.slice(0, at)).toContain('Wren');
  });

  test('deleting the focused heading ends the focus and shows the whole book', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSample(page);
    await cursorAfter(page, '# The Night Watch');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    await expect(source(page)).toBeFocused();
    // The cursor is at the heading's end: select the heading's line and delete it.
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await expect(bar(page)).toBeHidden();
    await expect(announcer(page)).toHaveText('Showing the whole book.');
    await expect(source(page)).toContainText('to let him in.');
    await expect.poll(() => textOf(page)).not.toContain('# The Night Watch');
    expect(errors).toEqual([]);
  });
});

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const theme of ['dark', 'light'] as const) {
  test(`passes axe with a chapter focused (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
    await openSample(page);
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await cursorAfter(page, 'ninety-one steps');
    await runCommand(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
    ).toEqual([]);
  });
}
