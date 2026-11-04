import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { palette, paletteInput, runCommand, settled, showSource, showView, start } from './modules';

// Focus on one chapter or one section (Novel plan, Task 7): only the passage shows in the Source
// and the Preview, typing in it works, the whole book is still the document, and Show the whole
// book (or deleting the focused heading, Review Focus 5) brings everything back.

const source = (page: Page) => page.locator('.cm-content');
const bar = (page: Page) => page.getByRole('region', { name: 'Focus' });
const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });

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

/** `runCommand` for a command whose row also shows its keys (`Focus on this chapter ⌘⌥F`). */
async function runKeyed(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(paletteInput(page)).toBeFocused();
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.insertText(title);
  const row = palette(page).getByRole('option', { name: new RegExp(`^${title}\\b`) });
  await expect(row).toBeVisible();
  await expect(async () => {
    await expect(row).toHaveAttribute('data-highlighted', '', { timeout: 1_000 });
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
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
    await runKeyed(page, 'Focus on this chapter');
    await expect(bar(page)).toContainText('Chapter 3 · The Night Watch — showing this chapter.');
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

  test('a section, by its command, and the keys for the chapter and the whole book', async ({
    page,
  }) => {
    await openSample(page);
    await cursorAfter(page, '## The Visitor');
    await runCommand(page, 'Focus on this section');
    await expect(bar(page)).toContainText('Section 2 · The Visitor — showing this section.');
    await expect(source(page)).not.toContainText('## The Page');
    await expect(source(page)).not.toContainText('The Night Watch');

    await page.keyboard.press('ControlOrMeta+Alt+Shift+F');
    await expect(bar(page)).toBeHidden();
    await expect(source(page)).toContainText('## The Page');

    await cursorAfter(page, '## The Page');
    await page.keyboard.press('ControlOrMeta+Alt+F');
    await expect(bar(page)).toContainText(
      'Chapter 2 · A Letter in Another Hand — showing this chapter.',
    );
    await expect(source(page)).toContainText('## The Visitor');
    await expect(source(page)).not.toContainText('Low Tide');
  });

  test('deleting the focused heading ends the focus and shows the whole book', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSample(page);
    await cursorAfter(page, '# The Night Watch');
    await runKeyed(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    await expect(source(page)).toBeFocused();
    // The cursor is at the heading's end: select the heading's line and delete it.
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await expect(bar(page)).toBeHidden();
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
    await runKeyed(page, 'Focus on this chapter');
    await expect(bar(page)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
    ).toEqual([]);
  });
}
