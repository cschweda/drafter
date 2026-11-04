import { expect, type Page, test } from '@playwright/test';
import { files, nextFileName, stubPickers, textOf } from './fs-stub';
import {
  chooseExport,
  expectSaved,
  pasteText,
  runCommand,
  settled,
  showSource,
  showView,
  start,
  wholeText,
} from './modules';

// A novel's comment is Drafter's, not the book's (the final review of Novel): the Preview and an
// HTML export never show it, and Revert to Saved and a snapshot's Restore bring back exactly the
// text they keep, its facts with it, even after the Outline moved a chapter.

const BOOK = `# Alpha

The first chapter.

# Beta

The second chapter.

<!-- drafter {"template":"novel","novel":{"nodes":{"chapter:alpha:0":{"status":"done","synopsis":"A secret synopsis."},"chapter:beta:0":{"status":"draft"}}}} -->
`;

const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });
const tree = (page: Page) => page.getByRole('tree', { name: 'Outline' });
const alpha = (page: Page) => tree(page).getByRole('treeitem', { name: /^Alpha, chapter/ });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const snapshots = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');

async function openBook(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New novel' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await pasteText(page, BOOK);
  await settled(page);
}

/** Moves Alpha after Beta from the Outline, as Alt+Down does; the comment stays as it was. */
async function moveAlphaDown(page: Page) {
  await runCommand(page, 'Show Outline');
  await expect(alpha(page)).toBeVisible();
  await alpha(page).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => wholeText(page)).toMatch(/^# Beta\n[\s\S]*\n# Alpha\n/);
}

test.describe('a novel’s comment', () => {
  test('never shows in the Preview', async ({ page }) => {
    await openBook(page);
    await showView(page, 'Preview');
    await expect(preview(page)).toContainText('The second chapter.');
    await expect(preview(page)).not.toContainText('drafter');
    await expect(preview(page)).not.toContainText('secret synopsis');
  });

  test('never shows in an HTML export', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'the stand-in file system is Chromium’s');
    await stubPickers(page);
    await openBook(page);
    await chooseExport(page, 'HTML (.html)');
    await expect.poll(async () => (await files(page)).some((f) => f.endsWith('.html'))).toBe(true);
    const name = (await files(page)).find((f) => f.endsWith('.html')) as string;
    const html = (await textOf(page, name)) ?? '';
    expect(html).toContain('The second chapter.');
    expect(html).not.toContain('drafter {');
    expect(html).not.toContain('secret synopsis');
  });
});

test.describe('a novel’s facts through Revert and Restore', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test('Revert to Saved after a move is the saved file byte for byte', async ({ page }) => {
    await stubPickers(page);
    await openBook(page);
    await showSource(page);
    await nextFileName(page, 'Book.md');
    await page.keyboard.press('ControlOrMeta+s');
    await expectSaved(page);
    const saved = (await textOf(page, 'Book.md')) as string;
    expect(saved).toBe(BOOK);

    await moveAlphaDown(page);
    await runCommand(page, 'Revert to Saved');
    await expect.poll(() => wholeText(page)).toBe(saved);
    await expectSaved(page);
    // Alpha keeps its status, and Beta its own.
    await expect(alpha(page)).toHaveAccessibleName(/Done/);
  });

  test('Restore of a snapshot after a move is its text byte for byte', async ({ page }) => {
    await openBook(page);
    await runCommand(page, 'Take snapshot…');
    await expect(history(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(snapshots(page)).toHaveCount(1);
    await history(page).getByRole('button', { name: 'Close' }).click();
    await expect(history(page)).toBeHidden();

    await moveAlphaDown(page);
    await page.getByRole('button', { name: /^History, / }).click();
    await expect(history(page)).toBeVisible();
    const newest = snapshots(page).first();
    await newest.focus();
    await page.keyboard.press('r');
    await expect(history(page)).toBeHidden();
    await expect.poll(() => wholeText(page)).toBe(BOOK);
  });
});
