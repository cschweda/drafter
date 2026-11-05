import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { chooseExport, editor, pasteText, start } from './modules';

// A 120,000-word novel exported as a manuscript, as a PDF and as a Word file, each within a budget
// (manuscript plan, Task 7). Named for its limit: a fixed time limit is the release gate's, not a
// shared runner's, and "within" keeps it off the pull-request run (checks.yml's --grep-invert).
//
// Measured on the maintainer's machine (Chromium, 2026-11-05, click on Export to the file saved):
//   PDF  about 1,400 ms (401 pages, 265 KB; three runs 1,336 to 1,430)
//   Word about 270 ms (932 KB; three runs 263 to 270)
// The budgets are twice those, rounded up.
const PDF_BUDGET_MS = 3_000;
const DOCX_BUDGET_MS = 600;

/** 40 chapters of three sections, 3,000 words each: 120,000 words of invented ones. */
function novel(): string {
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
        ...(s > 0 ? ['***', ''] : []),
        ...Array.from({ length: 20 }, (_, p) => [para(c, s, p), '']).flat(),
      ]).flat(),
    ].join('\n');
  const meta = `<!-- drafter ${JSON.stringify({ template: 'novel' })} -->\n`;
  return `${Array.from({ length: 40 }, (_, c) => chapter(c)).join('\n')}\n${meta}`;
}

// pdf-lib is render-pdf's, so it is found from there.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const { PDFDocument } = createRequire(`${ROOT}/packages/render-pdf/package.json`)(
  'pdf-lib',
) as typeof import('pdf-lib');

test.beforeEach(async ({ page }) => {
  await removePickers(page);
});

test('exports a 120,000-word novel as a manuscript PDF and Word file, each within its budget', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || !!isMobile, 'the budget is measured in Chromium');
  test.setTimeout(1_200_000);
  const book = novel();
  expect(book.split(/\s+/).length).toBeGreaterThan(120_000);

  await start(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'New novel' })
    .click();
  await expect(editor(page)).toContainText('# Chapter One');
  // Pasted, as a writer brings in a book: typing it in isn't what is measured here.
  await pasteText(page, book);
  await expect(page).toHaveTitle(/Chapter 0 Varrow|Untitled/);

  const dialog = page.getByRole('dialog', { name: 'Manuscript details' });
  for (const [menu, button, budget, kind] of [
    ['Manuscript (PDF)…', 'Export PDF', PDF_BUDGET_MS, 'pdf'],
    ['Manuscript (Word)…', 'Export Word file', DOCX_BUDGET_MS, 'docx'],
  ] as const) {
    await chooseExport(page, menu);
    await expect(dialog).toBeVisible();
    const download = page.waitForEvent('download', { timeout: budget + 30_000 });
    const started = Date.now();
    await dialog.getByRole('button', { name: button }).click();
    const file = await download;
    const bytes = await readFile(await file.path());
    const ms = Date.now() - started;
    console.log(`A 120,000-word manuscript ${kind} (${bytes.length} bytes) in ${ms} ms.`);
    test.info().annotations.push({ type: 'timing', description: `${kind}: ${ms} ms` });
    expect(bytes.subarray(0, 2).toString('latin1')).toBe(kind === 'pdf' ? '%P' : 'PK');
    if (kind === 'pdf') {
      // A real book's length: about 480 pages of 250 words, a page for each chapter's start at least.
      const pages = (await PDFDocument.load(bytes)).getPageCount();
      console.log(`The manuscript PDF has ${pages} pages.`);
      expect(pages).toBeGreaterThan(300);
    }
    expect(ms).toBeLessThan(budget);
    await expect(dialog).toBeHidden();
  }
});
