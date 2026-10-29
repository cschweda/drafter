import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { fileNameFor } from '../app/storage/text';
import { bytesOf, cancelNextPick, failWrites, picks, removePickers, stubPickers } from './fs-stub';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
// pdf-lib and pdfjs are render-pdf's, so they are found from there.
const renderPdfRequire = createRequire(`${ROOT}/packages/render-pdf/package.json`);
const { PDFArray, PDFDict, PDFDocument, PDFName, PDFHexString, PDFString } = renderPdfRequire(
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

/** The text of every page of a PDF, as pdfjs reads it, joined. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = (await import(
    pathToFileURL(renderPdfRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
  )) as typeof import('pdfjs-dist');
  // pdfjs wants a plain Uint8Array (not a Node Buffer), and takes ownership of it: a copy.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const parts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    for (const item of content.items) if ('str' in item) parts.push(item.str);
  }
  return parts.join(' ');
}

/** The address of each link annotation on each page. */
function linkAddresses(pdf: import('pdf-lib').PDFDocument): string[] {
  const addresses: string[] = [];
  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const action = annots?.lookup(i, PDFDict).lookupMaybe(PDFName.of('A'), PDFDict);
      const uri = action?.lookup(PDFName.of('URI'));
      if (uri instanceof PDFHexString || uri instanceof PDFString) addresses.push(uri.decodeText());
    }
  }
  return addresses;
}

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

/** Runs a command from the palette, by its title. */
async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type(title);
  await palette(page).getByRole('option', { name: title }).first().click();
  await expect(palette(page)).toBeHidden();
}

/** Help → Sample scripts → Markdown, which opens the sample as a new document. */
async function openMarkdownSample(page: Page) {
  await runCommand(page, 'Sample script: Markdown');
  await expect(editor(page)).toContainText('# Sample: Markdown');
}

/** Exports the open document as a PDF, from the Export menu, and answers the downloaded bytes. */
async function downloadPdf(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await exportButton(page).click();
  const download = page.waitForEvent('download');
  await pdfItem(page).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

/**
 * About 190 sections of invented words (so no text comes from anywhere else): headings,
 * paragraphs, a list, a quote, and code, a little under half a page each.
 */
function longDocument(): string {
  const words = ['vorn', 'taleb', 'quisp', 'marrowy', 'ost', 'plenk', 'dravish', 'ulm', 'senner'];
  let seed = 7;
  const pick = (count: number) =>
    Array.from({ length: count }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return words[Math.floor((seed / 2147483648) * words.length)];
    }).join(' ');
  const sections = ['# The Long Document'];
  for (let s = 0; s < 190; s++) {
    sections.push(
      `## ${pick(4)} ${s}`,
      pick(70),
      `${pick(30)} *${pick(4)}* and **${pick(3)}**.`,
      `- ${pick(12)}\n- ${pick(16)}\n  - ${pick(8)}`,
      `> ${pick(24)}`,
      `\`\`\`\n${pick(8)}\n  ${pick(12)}\n\`\`\``,
    );
  }
  return `${sections.join('\n\n')}\n`;
}

/** The screenplay sample, which `start` opens. */
const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);

const progressBar = (page: Page) => page.locator('.toast').getByRole('progressbar');

/**
 * Records every value the export toast's bar takes (its `aria-valuenow`, or null while it can't
 * say), from now on; `values()` answers them.
 */
async function recordProgress(page: Page) {
  await page.evaluate(() => {
    const seen: Array<string | null> = [];
    (window as unknown as { __progress: typeof seen }).__progress = seen;
    const note = () => {
      const bar = document.querySelector('.toast [role="progressbar"]');
      if (!bar) return;
      const value = bar.getAttribute('aria-valuenow');
      if (seen.at(-1) !== value) seen.push(value);
    };
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    });
  });
  return {
    values: () =>
      page.evaluate(() => (window as unknown as { __progress: Array<string | null> }).__progress),
  };
}

/** The numbers among `values`, which rise (never fall) and are more than one. */
function expectRising(values: Array<string | null>) {
  const numbers = values.filter((v): v is string => v !== null).map(Number);
  expect(numbers.length, JSON.stringify(values)).toBeGreaterThan(1);
  numbers.forEach((n, i) => {
    expect(n).toBeGreaterThanOrEqual(i === 0 ? 0 : (numbers[i - 1] as number));
  });
  expect(numbers.at(-1) as number).toBeGreaterThan(numbers[0] as number);
  expect(numbers.every((n) => n >= 0 && n <= 100)).toBe(true);
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

  test('refuses to export a script with nothing in it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'typing into the editor is covered on the desktop');
    await start(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    const downloads: string[] = [];
    page.on('download', (file) => downloads.push(file.suggestedFilename()));
    for (const item of [pdfItem, txtItem]) {
      await exportButton(page).click();
      await item(page).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Nothing to export yet.' }),
      ).toBeVisible();
    }
    await expect(toast(page)).toHaveText('');
    await page.waitForTimeout(300);
    expect(downloads).toEqual([]);
  });

  test('exports both kinds when asked for one after the other', async ({ page }) => {
    await start(page);
    const names: string[] = [];
    page.on('download', (file) => names.push(file.suggestedFilename()));
    await exportButton(page).click();
    await pdfItem(page).click();
    await exportButton(page).click();
    await txtItem(page).click();
    await expect.poll(() => [...names].sort()).toEqual(['The Call.pdf', 'The Call.txt']);
    await expect(ready(page)).toHaveText('Exported The Call.txt.');
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

test.describe('a Markdown document’s PDF', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('exports the sample Markdown document as a PDF', async ({ page }) => {
    await start(page);
    await openMarkdownSample(page);
    const name = fileNameFor('Sample: Markdown', '.pdf');
    const { name: downloaded, bytes } = await downloadPdf(page);
    expect(downloaded).toBe(name);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([width, height]).toEqual([612, 792]);
    expect(pdf.getTitle()).toBe('Sample: Markdown');
    const text = await pdfText(bytes);
    expect(text).toContain('Sample: Markdown');
    expect(text).toContain('Pancake, the cat');
    expect(linkAddresses(pdf)).toEqual(['https://drafter.dev/']);
    await expect(ready(page)).toHaveText(`Exported ${name}.`);
  });

  test('exports on A4 when Settings says so', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+,');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByLabel('Paper for Markdown PDFs').selectOption('a4');
    await settings.getByRole('button', { name: 'Done' }).click();
    await expect(settings).toBeHidden();
    await openMarkdownSample(page);
    const { bytes } = await downloadPdf(page);
    const { width, height } = (await PDFDocument.load(bytes)).getPage(0).getSize();
    expect([width, height]).toEqual([595.28, 841.89]);
    // A screenplay's PDF keeps its template's paper.
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New screenplay' })
      .click();
    await expect(editor(page)).not.toContainText('Sample: Markdown');
    await editor(page).click();
    await page.keyboard.insertText('INT. HALL - DAY\n\nA door.\n');
    const script = await downloadPdf(page);
    const size = (await PDFDocument.load(script.bytes)).getPage(0).getSize();
    expect([size.width, size.height]).toEqual([612, 792]);
  });

  test('says which characters print as ?', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'typing into the editor is covered on the desktop');
    await start(page);
    await runCommand(page, 'New Markdown document');
    await expect(editor(page)).toContainText('# Untitled');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nThe sign says 漢字.\n');
    const { name, bytes } = await downloadPdf(page);
    expect(name).toBe('Untitled.pdf');
    expect(await pdfText(bytes)).toContain('The sign says ??.');
    await expect(ready(page)).toHaveText(
      'Exported Untitled.pdf. Some characters aren’t in Drafter’s fonts and print as ?: 漢, 字.',
    );
  });

  test('exports a 100-page document in the worker', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'the budget is measured in Chromium');
    // The export itself fails only past 20 s (a hang guard; the budget is 3 s on the maintainer's
    // machine, Markdown PDF design §8); the rest of the test has time for the paste.
    test.setTimeout(60_000);
    await start(page);
    await runCommand(page, 'New Markdown document');
    await expect(editor(page)).toContainText('# Untitled');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(longDocument());
    // The editor draws only what is on screen; the window's title is the first heading.
    await expect(page).toHaveTitle(/The Long Document — Drafter$/);
    await exportButton(page).click();
    const progress = await recordProgress(page);
    const download = page.waitForEvent('download', { timeout: 20_000 });
    const started = Date.now();
    await pdfItem(page).click();
    // The toast says it's under way, with a bar named for the file.
    await expect(progressBar(page)).toHaveAccessibleName('Exporting The Long Document.pdf');
    const file = await download;
    const ms = Date.now() - started;
    const pages = (await PDFDocument.load(await readFile(await file.path()))).getPageCount();
    console.log(`A ${pages}-page Markdown PDF exported in the Chromium worker in ${ms} ms.`);
    test.info().annotations.push({ type: 'timing', description: `${pages} pages, ${ms} ms` });
    expect(pages).toBeGreaterThanOrEqual(100);
    expect(ms).toBeLessThan(20_000);
    await expect(ready(page)).toHaveText('Exported The Long Document.pdf.');
    // The bar rose as the export went, and went with it.
    expectRising(await progress.values());
    await expect(progressBar(page)).toHaveCount(0);
  });

  test('shows a long screenplay’s export rising, with no motion when the writer asks for none', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'a long export is checked in Chromium');
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    // The sample, with its body forty times over: some 60 pages.
    const body = SAMPLE.slice(SAMPLE.indexOf('# Act One'));
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(`${SAMPLE}\n${`${body}\n`.repeat(40)}`);
    // The fonts come slowly, as on a slow connection: the export's first stage can't say how far
    // it is, and lasts long enough to watch.
    await page.route('**/fonts/courier-prime/*.ttf', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await exportButton(page).click();
    const progress = await recordProgress(page);
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await pdfItem(page).click();
    const bar = progressBar(page);
    await expect(bar).toHaveAccessibleName('Exporting The Call.pdf');
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    // While the fonts come, the bar can't say how far it is: no number, and (reduced motion)
    // nothing sweeps or slides; the bar only fills.
    await expect(bar).not.toHaveAttribute('aria-valuenow', /./);
    await expect(bar).toHaveAttribute('aria-valuetext', 'Under way');
    const motion = await bar.evaluate((el) => {
      const fill = getComputedStyle(el.firstElementChild as Element);
      return { animation: fill.animationName, transition: fill.transitionDuration };
    });
    expect(motion).toEqual({ animation: 'none', transition: '0s' });
    const file = await download;
    const pages = (await PDFDocument.load(await readFile(await file.path()))).getPageCount();
    expect(pages).toBeGreaterThan(50);
    await expect(ready(page)).toHaveText('Exported The Call.pdf.');
    const values = await progress.values();
    expect(values[0]).toBeNull();
    expectRising(values);
    expect(values.at(-1)).toBe('100');
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
