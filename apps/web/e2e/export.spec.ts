import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { bytesOf, cancelNextPick, failWrites, picks, removePickers, stubPickers } from './fs-stub';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
// pdf-lib is render-pdf's, so it is found from there.
const { PDFDocument } = createRequire(`${ROOT}/packages/render-pdf/package.json`)(
  'pdf-lib',
) as typeof import('pdf-lib');
const CLI = `${ROOT}/packages/cli/dist/index.js`;

const editor = (page: Page) => page.locator('.cm-content');
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });
const menu = (page: Page) => page.getByRole('group', { name: 'Export' });
const pdfItem = (page: Page) => menu(page).getByRole('button', { name: 'PDF' });
const txtItem = (page: Page) => menu(page).getByRole('button', { name: 'Plain text (.txt)' });
const toast = (page: Page) => page.locator('.toast [role="status"]');
const ready = (page: Page) => toast(page).filter({ hasText: 'Exported' });

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** `drafter build --txt`'s output for the sample, which the browser's export must equal. */
let cliText: string;
test.beforeAll(() => {
  if (!existsSync(CLI)) {
    execFileSync('pnpm', ['--filter', '@drafter/cli', 'build'], { cwd: ROOT, stdio: 'ignore' });
  }
  cliText = execFileSync('node', [CLI, 'build', 'samples/screenplay.fountain', '--txt', '-'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 16 * 1024 * 1024,
  });
});

test.describe('exporting where the browser downloads', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('exports the sample as a PDF', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    const download = page.waitForEvent('download');
    await pdfItem(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Call.pdf');
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Three pages: the title page and numbered pages 1 and 2.
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    await expect(ready(page)).toHaveText('Exported The Call.pdf.');
    // The menu has closed.
    await expect(menu(page)).toBeHidden();
  });

  test('exports plain text that matches the command line', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    const download = page.waitForEvent('download');
    await txtItem(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Call.txt');
    expect(await readFile(await file.path(), 'utf8')).toBe(cliText);
    await expect(ready(page)).toHaveText('Exported The Call.txt.');
  });

  test('exports what the editor shows now, under the title it has now', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'typing into the editor is covered on the desktop');
    await start(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    // The title line is the first line: select it and retitle.
    await page.keyboard.press('Shift+End');
    await page.keyboard.insertText('Title: Second: Draft');
    await exportButton(page).click();
    const download = page.waitForEvent('download');
    await txtItem(page).click();
    const file = await download;
    // The colon is not allowed in a file name.
    expect(file.suggestedFilename()).toBe('Second Draft.txt');
    expect(await readFile(await file.path(), 'utf8')).toContain('Second: Draft');
  });

  test('fetches the fonts from its own origin only, once', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      (window as unknown as { __violations: string[] }).__violations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        (window as unknown as { __violations: string[] }).__violations.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        ),
      );
    });
    const foreign: string[] = [];
    let fonts = 0;
    page.on('request', (request) => {
      if (request.url().startsWith('http') && !request.url().startsWith(`${baseURL}/`)) {
        foreign.push(request.url());
      }
    });
    page.on('response', (response) => {
      if (response.url().includes('/fonts/courier-prime/')) fonts++;
    });
    await start(page);
    const exportPdf = async () => {
      await exportButton(page).click();
      const download = page.waitForEvent('download');
      await pdfItem(page).click();
      await download;
      await expect(ready(page)).toBeVisible();
    };
    await exportPdf();
    const afterFirst = fonts;
    // The page's own use of the font, and the worker's four files, were all asked for.
    expect(afterFirst).toBeGreaterThanOrEqual(4);
    await exportPdf();
    // The worker keeps what it fetched.
    expect(fonts).toBe(afterFirst);
    expect(foreign).toEqual([]);
    expect(
      await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
    ).toEqual([]);
  });
});

test.describe('the Export menu from the keyboard', () => {
  test.skip(({ isMobile }) => !!isMobile, 'there is no keyboard on a phone');
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('opens, moves focus in, closes with Escape, and exports with Enter', async ({
    page,
    browserName,
  }) => {
    await start(page);
    await exportButton(page).focus();
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(pdfItem(page)).toBeFocused();

    // Safari's Tab skips buttons unless the user has turned that on.
    if (browserName !== 'webkit') {
      await page.keyboard.press('Tab');
      await expect(txtItem(page)).toBeFocused();
    }

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(exportButton(page)).toBeFocused();
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Space');
    await expect(pdfItem(page)).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('The Call.pdf');
    // Focus is back on the button, as after any menu.
    await expect(exportButton(page)).toBeFocused();
  });

  test('closes when focus leaves it', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    await expect(menu(page)).toBeVisible();
    await editor(page).click();
    await expect(menu(page)).toBeHidden();
  });
});

test.describe('exporting through the save picker (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('exports through the save picker where the browser has one', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    await pdfItem(page).click();
    await expect(ready(page)).toHaveText('Exported The Call.pdf.');
    expect(await picks(page)).toEqual(['The Call.pdf']);
    const bytes = await bytesOf(page, 'The Call.pdf');
    expect(String.fromCharCode(...(bytes ?? []).slice(0, 5))).toBe('%PDF-');

    await exportButton(page).click();
    await txtItem(page).click();
    await expect(ready(page)).toHaveText('Exported The Call.txt.');
    expect(await picks(page)).toEqual(['The Call.pdf', 'The Call.txt']);
    const text = new TextDecoder().decode(
      new Uint8Array((await bytesOf(page, 'The Call.txt')) ?? []),
    );
    expect(text).toBe(cliText);
  });

  test('does nothing when the picker is cancelled', async ({ page }) => {
    await start(page);
    await cancelNextPick(page);
    await exportButton(page).click();
    await pdfItem(page).click();
    await expect.poll(() => picks(page)).toEqual([]);
    await page.waitForTimeout(300);
    await expect(toast(page)).toHaveText('');
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t export' })).toHaveCount(0);
    expect(await bytesOf(page, 'The Call.pdf')).toBeNull();
  });

  test('says so when the file can’t be written', async ({ page }) => {
    await start(page);
    await failWrites(page);
    await exportButton(page).click();
    await txtItem(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Couldn’t export The Call.txt' }),
    ).toBeVisible();
    await expect(toast(page)).toHaveText('');
    // The editor is still there, and a later export works.
    await expect(editor(page)).toContainText('The Call');
  });
});
