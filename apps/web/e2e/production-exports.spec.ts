import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { palette, replaceWhole, runCommand, showSource, start, wholeText } from './modules';

// A locked script's exports (production design §8): Export revised pages (PDF)… prints the pages
// the current revision changed, with their locked labels and the revision header.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const renderPdfRequire = createRequire(`${ROOT}/packages/render-pdf/package.json`);

/** The text of every page of a PDF, as pdfjs reads it, a page per entry. */
async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = (await import(
    pathToFileURL(renderPdfRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
  )) as typeof import('pdfjs-dist');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
  }
  return pages;
}

const panel = (page: Page) => page.locator('#panel-production');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const scriptRegion = (page: Page) => page.getByRole('region', { name: 'Script' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export revised pages' });

/** A script of four pages or so: twelve scenes, each a heading and three paragraphs. */
const LONG = [
  'Title: The Long Weir',
  '',
  ...Array.from({ length: 12 }, (_, i) => [
    `INT. ROOM ${i + 1} - DAY`,
    '',
    `Marra crosses room ${i + 1} and sets the lamp down on the long table by the window.`,
    '',
    `The water in the weir below rises a little, and the boards of room ${i + 1} creak with it.`,
    '',
    `She listens, counts to ten, and goes on to the next room without a word.`,
    '',
  ]).flat(),
].join('\n');

async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
}

test.describe('Production exports', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('exports revised pages after a Blue edit', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);
    await command(page, 'Show Production');
    await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');

    // A Blue change in room 8, a page or two in.
    const after = 'Marra crosses room 8 and sets the lamp down on the long table by the window.';
    const text = (await wholeText(page)) ?? '';
    const edited = text.replace(after, `${after}\n\nThe rain comes in under the door.`);
    await replaceWhole(page, edited);
    await expect.poll(() => wholeText(page)).toBe(edited);

    // The label of the page the Script pane marks.
    if (!(await scriptRegion(page).isVisible())) {
      await page.getByRole('tab', { name: 'Script', exact: true }).first().click();
    }
    const marked = scriptRegion(page)
      .locator('.drafter-page')
      .filter({ has: page.locator('.drafter-revision-star') });
    await expect(marked).toHaveCount(1);
    const label = ((await marked.locator('.drafter-page-number').textContent()) ?? '').trim();
    expect(label).toMatch(/^\d+[A-Z]*\.$/);

    await command(page, 'Export as Revised pages (PDF)…');
    await expect(dialog(page)).toBeVisible();
    const header = dialog(page).getByRole('textbox', { name: 'Header text' });
    await expect(header).toHaveValue(/^Blue Revision — /);
    await expect(
      dialog(page).getByRole('group', { name: 'Which pages' }).getByRole('button', {
        name: 'Current revision',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    const exportButton = dialog(page).getByRole('button', { name: 'Export', exact: true });
    await expect(exportButton).toBeEnabled();
    const download = page.waitForEvent('download');
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Long Weir – Blue revised pages.pdf');
    const pages = await pdfPages(await readFile(await file.path()));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain(label);
    expect(pages[0]).toContain('Blue Revision — ');
    expect(pages[0]).toContain('The rain comes in under the door.');
    await expect(dialog(page)).toBeHidden();
  });

  test('exports the breakdown as a CSV, with its header and a row per scene', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);

    const download = page.waitForEvent('download');
    await command(page, 'Export as Breakdown (CSV)');
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Long Weir – Breakdown.csv');
    const csv = (await readFile(await file.path(), 'utf8')).split('\r\n');
    expect(csv[0]).toBe('Scene,INT/EXT,Location,Time,Pages,Page,Cast,Synopsis');
    expect(csv[1]).toMatch(/^1,INT,ROOM 1,DAY,[\d /]+,1,,$/);
    expect(csv).toHaveLength(14);
    expect(csv[13]).toBe('');
  });

  test('says there is nothing to print before a Blue change, and makes no file', async ({
    page,
  }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);
    await command(page, 'Show Production');
    await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');

    const downloads: string[] = [];
    page.on('download', (file) => downloads.push(file.suggestedFilename()));
    await command(page, 'Export as Revised pages (PDF)…');
    const exportButton = dialog(page).getByRole('button', { name: 'Export', exact: true });
    await expect(exportButton).toBeEnabled();
    await exportButton.click();
    await expect(page.locator('.toast [role="alert"]')).toHaveText(
      'There are no Blue changes to print.',
    );
    expect(downloads).toEqual([]);
  });
  test('exports sides for MARGARET', async ({ page }) => {
    const script = [
      'Title: The Long Weir',
      '',
      'INT. HALL - DAY',
      '',
      'MARGARET',
      'The weir is rising tonight.',
      '',
      'INT. ROOM 2 - DAY',
      '',
      'Jon sets the lamp down on the long table by the window.',
      '',
      'INT. ROOM 3 - NIGHT',
      '',
      'MARGARET',
      'Then we leave at dawn.',
      '',
    ].join('\n');
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, script);
    await expect.poll(() => wholeText(page)).toBe(script);

    await command(page, 'Export as Sides (PDF)…');
    const sides = page.getByRole('dialog', { name: 'Export sides' });
    await expect(sides).toBeVisible();
    const exportButton = sides.getByRole('button', { name: 'Export', exact: true });
    await expect(sides.getByRole('checkbox', { name: 'MARGARET' })).toBeVisible();
    await expect(exportButton).toBeDisabled();
    await sides.getByRole('checkbox', { name: 'MARGARET' }).check();
    await expect(sides.getByRole('checkbox', { name: /^1 INT\. HALL/ })).toBeChecked();
    await expect(sides.getByRole('checkbox', { name: /^2 INT\. ROOM 2/ })).not.toBeChecked();
    await expect(sides.getByRole('checkbox', { name: /^3 INT\. ROOM 3/ })).toBeChecked();
    await expect(exportButton).toBeEnabled();
    const download = page.waitForEvent('download');
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Long Weir – Sides.pdf');
    const pages = await pdfPages(await readFile(await file.path()));
    expect(pages.join(' ')).toMatch(/SIDES — MARGARET — Scenes 1, 3 — \d+ \w+ \d{4}/);
    expect(pages.join(' ')).toContain('The weir is rising tonight.');
    expect(pages.join(' ')).toContain('Then we leave at dawn.');
    await expect(sides).toBeHidden();
  });

  test('a changed header prints, and is kept in the script', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);
    await command(page, 'Show Production');
    await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');
    const after = 'Marra crosses room 3 and sets the lamp down on the long table by the window.';
    const edited = ((await wholeText(page)) ?? '').replace(after, `${after}\n\nShe stops.`);
    await replaceWhole(page, edited);
    await expect.poll(() => wholeText(page)).toBe(edited);

    await command(page, 'Export as Revised pages (PDF)…');
    const header = dialog(page).getByRole('textbox', { name: 'Header text' });
    await expect(header).toHaveValue(/^Blue Revision — /);
    await header.fill('Blue Pages <b>Shooting</b>');
    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const pages = await pdfPages(await readFile(await (await download).path()));
    expect(pages[0]).toContain('Blue Pages <b>Shooting</b>');
    await expect
      .poll(async () => (await wholeText(page)) ?? '')
      .toContain('"header":"Blue Pages <b>Shooting<\\/b>"');
    // Opened again, the dialog shows the kept header.
    await command(page, 'Export as Revised pages (PDF)…');
    await expect(header).toHaveValue('Blue Pages <b>Shooting</b>');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  });
  test('a range with no pages says so in the dialog, which stays open', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);
    await command(page, 'Show Production');
    await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');

    const downloads: string[] = [];
    page.on('download', (file) => downloads.push(file.suggestedFilename()));
    await command(page, 'Export as Revised pages (PDF)…');
    const exportButton = dialog(page).getByRole('button', { name: 'Export', exact: true });
    await expect(exportButton).toBeEnabled();
    await dialog(page)
      .getByRole('group', { name: 'Which pages' })
      .getByRole('button', { name: 'Page range' })
      .click();
    const fromField = dialog(page).getByRole('textbox', { name: 'From page' });
    const toField = dialog(page).getByRole('textbox', { name: 'To page' });
    await expect(fromField).toHaveValue('1');
    await toField.fill('99');
    await exportButton.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('alert')).toHaveText(
      'There are no revised pages to print.',
    );
    await expect(fromField).toHaveAttribute('aria-invalid', 'true');
    await expect(toField).toHaveAttribute('aria-invalid', 'true');
    await expect(fromField).toBeFocused();
    // A bad header is said under it, and Export waits.
    await toField.fill('2');
    await expect(dialog(page).getByRole('alert')).toHaveCount(0);
    const header = dialog(page).getByRole('textbox', { name: 'Header text' });
    await header.fill('Blue\u202ePages');
    await expect(dialog(page).getByRole('alert')).toContainText('invisible formatting');
    await expect(exportButton).toBeDisabled();
    await header.fill('Blue Pages');
    await expect(exportButton).toBeEnabled();
    const download = page.waitForEvent('download');
    await exportButton.click();
    const pages = await pdfPages(await readFile(await (await download).path()));
    expect(pages).toHaveLength(2);
    expect(downloads).toHaveLength(1);
  });

  test('the Export menu and the tab list the exports, revised pages only once locked', async ({
    page,
    isMobile,
  }) => {
    // The top bar's Export menu is a desktop control; on a phone the exports are in the folded
    // menu, which `chooseExport` uses throughout.
    test.skip(!!isMobile, 'the top bar’s Export menu is checked on the desktop');
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await showSource(page);
    await replaceWhole(page, LONG);
    await expect.poll(() => wholeText(page)).toBe(LONG);
    const menu = page.getByRole('group', { name: 'Export', exact: true });
    const openMenu = async () => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(menu).toBeVisible();
    };
    await openMenu();
    for (const name of ['Breakdown (CSV)', 'Breakdown (PDF)', 'Sides (PDF)…']) {
      await expect(menu.getByRole('button', { name })).toBeVisible();
    }
    await expect(menu.getByRole('button', { name: 'Revised pages (PDF)…' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await command(page, 'Show Production');
    await expect(panel(page).getByRole('button', { name: 'Breakdown (CSV)' })).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Revised pages (PDF)…' })).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');
    await expect(panel(page).getByRole('button', { name: 'Revised pages (PDF)…' })).toBeVisible();
    await openMenu();
    await expect(menu.getByRole('button', { name: 'Revised pages (PDF)…' })).toBeVisible();
  });
});
