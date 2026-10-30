import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderScriptHtml, stylesUsed } from '@drafter/render-html-file';
import { FONT_FILES } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { fileNameFor } from '../app/storage/text';
import { bytesOf, cancelNextPick, failWrites, picks, removePickers, stubPickers } from './fs-stub';
import { setText } from './modules';

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
const htmlItem = (page: Page) => menu(page).getByRole('button', { name: 'HTML (.html)' });
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

/** A small Final Draft file, of the tests' own words, that imports with nothing left over. */
const TIDE = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>EXT. SEAWALL - DAWN</Text></Paragraph>
    <Paragraph Type="Action"><Text>The tide comes in.</Text></Paragraph>
  </Content>
</FinalDraft>
`;

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
    for (const item of [pdfItem, htmlItem, txtItem]) {
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

  test('keeps a slow export’s bar while another message comes and goes', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'a long export is checked in Chromium');
    test.setTimeout(60_000);
    await start(page);
    // The fonts come slowly enough that an import's message is said, and gone, before they arrive.
    await page.route('**/fonts/courier-prime/*.ttf', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      await route.continue();
    });
    await exportButton(page).click();
    const download = page.waitForEvent('download', { timeout: 40_000 });
    await pdfItem(page).click();
    const bar = progressBar(page);
    await expect(bar).toBeVisible();
    // A Final Draft file dropped meanwhile says it came in, in the same toast.
    await page.evaluate((xml) => {
      const dt = new DataTransfer();
      dt.items.add(new File([xml], 'tide.fdx', { type: 'application/xml' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    }, TIDE);
    await expect(toast(page)).toHaveText('Imported “tide.fdx”.');
    await expect(bar).toBeVisible();
    // Its message goes after a few seconds; the export, still under way, keeps its bar and says so.
    await expect(toast(page)).toHaveText('', { timeout: 10_000 });
    await expect(bar).toBeVisible();
    await expect(page.locator('.toast')).toContainText('Exporting The Call.pdf…');
    await download;
    await expect(ready(page)).toHaveText('Exported The Call.pdf.');
    await expect(bar).toHaveCount(0);
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
      await expect(htmlItem(page)).toBeFocused();
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

const optionsDialog = (page: Page) => page.getByRole('dialog', { name: 'Export options' });
const optionsItem = (page: Page) => menu(page).getByRole('button', { name: 'Export options…' });
const sceneNumbers = (page: Page) =>
  optionsDialog(page).getByRole('group', { name: 'Scene numbers' });
const titlePage = (page: Page) => optionsDialog(page).getByRole('group', { name: 'Title page' });

/** Opens Export options from the end of the toolbar's Export menu. */
async function openOptions(page: Page) {
  await exportButton(page).click();
  await optionsItem(page).click();
  await expect(optionsDialog(page)).toBeVisible();
}

/** Opens the dialog, chooses `label` in the `group`, and closes it with Done. */
async function choose(
  page: Page,
  group: 'Scene numbers' | 'Title page' | 'Include notes (Markdown and HTML)',
  label: string,
) {
  await openOptions(page);
  const radio = optionsDialog(page)
    .getByRole('group', { name: group })
    .getByRole('radio', { name: label, exact: true });
  await radio.check();
  await expect(radio).toBeChecked();
  await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(optionsDialog(page)).toBeHidden();
}

test.describe('export options', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  /** Exports the open script as plain text from the Export menu, and answers the text. */
  async function downloadText(page: Page): Promise<{ name: string; text: string }> {
    await exportButton(page).click();
    const download = page.waitForEvent('download');
    await txtItem(page).click();
    const file = await download;
    return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
  }

  /** The text of each page of a PDF, as pdfjs reads it. */
  async function pagesOf(bytes: Uint8Array): Promise<string[]> {
    const pdfjs = (await import(
      pathToFileURL(renderPdfRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    )) as typeof import('pdfjs-dist');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages;
  }

  test('Export options… is at the end of the Export menu and in the palette', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    await expect(menu(page).getByRole('button')).toHaveText([
      'PDF',
      'HTML (.html)',
      'Plain text (.txt)',
      'Final Draft (.fdx)',
      'Markdown (.md)',
      'Treatment (.md)…',
      'Export options…',
    ]);
    // After a line, of its own.
    await expect(menu(page).getByRole('separator')).toHaveCount(1);
    await optionsItem(page).click();
    await expect(optionsDialog(page)).toBeVisible();
    // The defaults, as an export was before there were options.
    await expect(
      sceneNumbers(page).getByRole('radio', { name: 'None', exact: true }),
    ).toBeChecked();
    await expect(titlePage(page).getByRole('radio', { name: 'Full', exact: true })).toBeChecked();
    await expect(optionsDialog(page)).toContainText(
      'A Final Draft file gets the title page you choose, and always keeps the scene numbers written in the script',
    );
    await expect(optionsDialog(page)).toContainText('so two scenes can share a number');
    await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(optionsDialog(page)).toBeHidden();

    await runCommand(page, 'Export options…');
    await expect(optionsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toBeHidden();
  });

  test('choosing No title page exports a PDF without one, and the toast says so', async ({
    page,
  }) => {
    await start(page);
    await choose(page, 'Title page', 'None');
    const { name, bytes } = await downloadPdf(page);
    expect(name).toBe('The Call.pdf');
    const pages = await pagesOf(bytes);
    // The title page is gone: two pages, and the first is the script's page 1.
    expect(pages).toHaveLength(2);
    expect(pages[0]).not.toContain('Written by');
    expect(pages[0]).not.toContain('writer@example.com');
    expect(pages[0]).toContain('INT. KITCHEN - NIGHT');
    await expect(ready(page)).toHaveText('Exported The Call.pdf, with no title page.');
  });

  test('the options are remembered per script, after a reload', async ({ page }) => {
    await start(page);
    await choose(page, 'Scene numbers', 'Number every scene');
    await choose(page, 'Title page', 'Title and author only');
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await openOptions(page);
    await expect(
      sceneNumbers(page).getByRole('radio', { name: 'Number every scene', exact: true }),
    ).toBeChecked();
    await expect(
      titlePage(page).getByRole('radio', { name: 'Title and author only', exact: true }),
    ).toBeChecked();
    await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
    const { text } = await downloadText(page);
    // Every scene numbered, at both sides of its heading; the title and author, but no contact.
    expect(text).toMatch(/^ *1 +INT\. KITCHEN - NIGHT +1$/m);
    expect(text).toContain('A. Writer');
    expect(text).not.toContain('writer@example.com');
    expect(text).not.toContain('October 2026');
    await expect(ready(page)).toHaveText(
      'Exported The Call.txt, with every scene numbered and the title and author only.',
    );
  });

  test('exports each script with its own options after switching', async ({ page }) => {
    await start(page);
    await choose(page, 'Title page', 'None');
    // A second script, with a title page of its own and no options chosen.
    await runCommand(page, 'New guided screenplay');
    await expect(page).toHaveTitle('Your Title Here — Drafter');
    const guided = await downloadText(page);
    expect(guided.name).toBe('Your Title Here.txt');
    expect(guided.text).toContain('Your email or phone');
    await expect(ready(page)).toHaveText('Exported Your Title Here.txt.');
    await choose(page, 'Title page', 'Title and author only');
    const cut = await downloadText(page);
    expect(cut.text).toContain('Your Title Here');
    expect(cut.text).toContain('Your Name');
    expect(cut.text).not.toContain('Your email or phone');

    // Back to the first: its own choice, not the one just made.
    await runCommand(page, 'Open sample: Screenplay');
    await expect(page).toHaveTitle('The Call — Drafter');
    const call = await downloadText(page);
    expect(call.name).toBe('The Call.txt');
    expect(call.text).not.toContain('Written by');
    expect(call.text).toContain('INT. KITCHEN - NIGHT');
    await expect(ready(page)).toHaveText('Exported The Call.txt, with no title page.');
  });

  test('is disabled for a Markdown document, with the reason', async ({ page }) => {
    await start(page);
    await openMarkdownSample(page);
    await exportButton(page).click();
    await expect(optionsItem(page)).toBeDisabled();
    await expect(menu(page)).toContainText(
      'A Markdown document has no scene numbers, title page, or notes to choose.',
    );
    await page.keyboard.press('Escape');
    // The palette doesn't offer it.
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill('Export options');
    await expect(palette(page).getByRole('option', { name: /^Export options/ })).toHaveCount(0);
  });

  test('a Markdown document’s Export options… is reached from the keyboard and says why it is off', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!!isMobile, 'there is no keyboard on a phone');
    await start(page);
    await openMarkdownSample(page);
    await exportButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(pdfItem(page)).toBeFocused();
    // Safari's Tab skips buttons unless the user has turned that on: there, focus it directly.
    if (browserName === 'webkit') await optionsItem(page).focus();
    else for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(optionsItem(page)).toBeFocused();
    await expect(optionsItem(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(optionsItem(page)).toHaveAccessibleDescription(
      'A Markdown document has no scene numbers, title page, or notes to choose.',
    );
    // Choosing it does nothing: no dialog, and the menu stays.
    await page.keyboard.press('Enter');
    // A click too (Playwright's own waits for an enabled item, so the event is sent directly).
    await optionsItem(page).dispatchEvent('click');
    await expect(optionsDialog(page)).toBeHidden();
    await expect(optionsItem(page)).toBeVisible();
  });

  test('gives focus back to the Export button, or to the script, when the dialog closes', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'there is no keyboard on a phone');
    await start(page);
    // From the Export menu: back to its button, after Escape and after Done.
    await openOptions(page);
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toBeHidden();
    await expect(exportButton(page)).toBeFocused();
    await openOptions(page);
    await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(optionsDialog(page)).toBeHidden();
    await expect(exportButton(page)).toBeFocused();
    // From the palette, opened while writing: to the script.
    await editor(page).click();
    await runCommand(page, 'Export options…');
    await expect(optionsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(optionsDialog(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
    await runCommand(page, 'Export options…');
    await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(optionsDialog(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();

    // The treatment's dialog, the same way.
    const treatment = page.getByRole('dialog', { name: 'Export as treatment' });
    await exportButton(page).click();
    await menu(page).getByRole('button', { name: 'Treatment (.md)…' }).click();
    await expect(treatment).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(treatment).toBeHidden();
    await expect(exportButton(page)).toBeFocused();
    await exportButton(page).click();
    await menu(page).getByRole('button', { name: 'Treatment (.md)…' }).click();
    await treatment.getByRole('button', { name: 'Cancel' }).click();
    await expect(treatment).toBeHidden();
    await expect(exportButton(page)).toBeFocused();
    await editor(page).click();
    await runCommand(page, 'Export as treatment…');
    await expect(treatment).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(treatment).toBeHidden();
    await expect(editor(page)).toBeFocused();
  });

  test('in a read-only tab the choices are disabled and say why, and exporting works', async ({
    context,
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'two tabs are the same on a phone');
    await start(page);
    await choose(page, 'Title page', 'None');
    const other = await context.newPage();
    await removePickers(other);
    await other.goto('/');
    await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
    await openOptions(other);
    await expect(optionsDialog(other)).toContainText(
      'Another tab has this script open, so its export options can’t be changed here.',
    );
    for (const radio of await optionsDialog(other).getByRole('radio').all()) {
      await expect(radio).toBeDisabled();
    }
    // The stored choice shows, and is the one the export uses.
    await expect(titlePage(other).getByRole('radio', { name: 'None', exact: true })).toBeChecked();
    await optionsDialog(other).getByRole('button', { name: 'Done' }).click();
    const { bytes } = await downloadPdf(other);
    expect(await pagesOf(bytes)).toHaveLength(2);
    await expect(ready(other)).toHaveText('Exported The Call.pdf, with no title page.');
  });

  test('the script is unchanged by choosing options', async ({ page, isMobile }) => {
    await start(page);
    const before = await page.title();
    expect(before).toBe('The Call — Drafter');
    await choose(page, 'Scene numbers', 'As written');
    await choose(page, 'Title page', 'Title and author only');
    // No changed dot in the title, and Undo has nothing to take back.
    await expect(page).toHaveTitle('The Call — Drafter');
    if (!isMobile) {
      await editor(page).click();
      const text = await editor(page).evaluate((el) => el.textContent);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(100);
      expect(await editor(page).evaluate((el) => el.textContent)).toBe(text);
      await expect(page).toHaveTitle('The Call — Drafter');
    }
  });
});

test.describe('a script as Markdown', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  const mdItem = (page: Page) => menu(page).getByRole('button', { name: 'Markdown (.md)' });
  const appMenu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });

  /** Runs `choose`, which starts a download, and answers the file's name and text. */
  async function downloaded(
    page: Page,
    choose: () => Promise<void>,
  ): Promise<{ name: string; text: string }> {
    const download = page.waitForEvent('download');
    await choose();
    const file = await download;
    return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
  }

  /** Exports the open script as Markdown from the toolbar's Export menu. */
  const downloadMarkdown = (page: Page) =>
    downloaded(page, async () => {
      await exportButton(page).click();
      await mdItem(page).click();
    });

  test('exports the sample screenplay as Markdown from the Export menu, the palette, and the app menu', async ({
    page,
  }) => {
    await start(page);
    const fromMenu = await downloadMarkdown(page);
    expect(fromMenu.name).toBe('The Call.md');
    // The title page's title, its section, and its first scene, under it; no notes by default.
    expect(fromMenu.text.startsWith('# The Call\n\nWritten by\n\nA. Writer\n')).toBe(true);
    expect(fromMenu.text).toContain('\n## Act One\n');
    expect(fromMenu.text).toContain('\n### INT. KITCHEN - NIGHT\n');
    expect(fromMenu.text).toContain("**MARGARET**\\\n*(quietly)*\\\nYou said you'd call.");
    expect(fromMenu.text).not.toContain('[[');
    expect(fromMenu.text).not.toContain('Note');
    expect(fromMenu.text.endsWith('\n')).toBe(true);
    await expect(ready(page)).toHaveText('Exported The Call.md.');

    const fromPalette = await downloaded(page, () => runCommand(page, 'Export as Markdown file'));
    expect(fromPalette).toEqual(fromMenu);

    const fromAppMenu = await downloaded(page, async () => {
      await page.getByRole('button', { name: 'Drafter menu' }).click();
      await appMenu(page)
        .getByRole('menuitem', { name: /^Export as Markdown file/ })
        .click();
    });
    expect(fromAppMenu).toEqual(fromMenu);
  });

  test('exports a stage play as Markdown with its acts and scenes as headings', async ({
    page,
  }) => {
    await start(page);
    await runCommand(page, 'Open sample: Stage play');
    await expect(editor(page)).toContainText('A play in one act by');
    const { name, text } = await downloadMarkdown(page);
    expect(name).toBe('The Call.md');
    expect(text.startsWith('# The Call\n\nA play in one act by\n')).toBe(true);
    expect(text).toContain('\n## Act One\n\n### Scene 1\n');
    // A stage direction is in italics; a speech is its name in bold, then its lines.
    expect(text).toContain('*A kitchen, late at night.');
    expect(text).toContain('**DANNY (offstage)**\\\nMom?');
  });

  test('exports Markdown with every scene numbered and no title page, and the toast says so', async ({
    page,
  }) => {
    await start(page);
    await choose(page, 'Scene numbers', 'Number every scene');
    await choose(page, 'Title page', 'None');
    const { text } = await downloadMarkdown(page);
    expect(text).not.toContain('# The Call');
    expect(text).not.toContain('writer@example.com');
    expect(text.startsWith('## Act One\n')).toBe(true);
    expect(text).toContain('\n### 1. INT. KITCHEN - NIGHT\n');
    await expect(ready(page)).toHaveText(
      'Exported The Call.md, with every scene numbered and no title page.',
    );
  });

  test('includes notes when Include notes says Include, and the choice is remembered after a reload', async ({
    page,
  }) => {
    await start(page);
    await choose(page, 'Include notes (Markdown and HTML)', 'Include');
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await openOptions(page);
    const notes = optionsDialog(page).getByRole('group', {
      name: 'Include notes (Markdown and HTML)',
    });
    await expect(notes.getByRole('radio', { name: 'Include', exact: true })).toBeChecked();
    await optionsDialog(page).getByRole('button', { name: 'Done' }).click();
    const { text } = await downloadMarkdown(page);
    // Each note a quote where it stands, and the synopsis too.
    expect(text).toContain('> **Note:** A scene heading starts with INT. or EXT.');
    expect(text).toContain('\n> Margaret waits up for a call that never comes.\n');
    await expect(ready(page)).toHaveText('Exported The Call.md, with notes.');
    // A PDF never prints them, and its toast doesn't say so.
    const { bytes } = await downloadPdf(page);
    expect(await pdfText(bytes)).not.toContain('A scene heading starts with');
    await expect(ready(page)).toHaveText('Exported The Call.pdf.');
  });

  test('Include notes is reached from the keyboard and the dialog passes axe in both themes', async ({
    page,
    isMobile,
    browserName,
  }) => {
    for (const theme of ['dark', 'light'] as const) {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await start(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await openOptions(page);
      const notes = optionsDialog(page).getByRole('group', {
        name: 'Include notes (Markdown and HTML)',
      });
      await expect(notes).toContainText(
        'Only the Markdown and HTML exports carry notes; a PDF never prints them.',
      );
      const leaveOut = notes.getByRole('radio', { name: 'Leave out', exact: true });
      const include = notes.getByRole('radio', { name: 'Include', exact: true });
      await expect(leaveOut).toBeChecked();
      await expect(include).toHaveAccessibleDescription(/each note and synopsis as a quote/);
      // The dialog's fades are waited out: axe measures the colors on the screen.
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
      );
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
        theme,
      ).toEqual([]);
      // Last, so the choice it makes is not the next pass's start.
      if (!isMobile && theme === 'light') {
        // Done has focus; one step back is the Include notes choice, and an arrow changes it.
        await expect(optionsDialog(page).getByRole('button', { name: 'Done' })).toBeFocused();
        // Safari's Tab skips form controls unless the user has turned that on: there, focus it.
        if (browserName === 'webkit') await leaveOut.focus();
        else await page.keyboard.press('Shift+Tab');
        await expect(leaveOut).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(include).toBeChecked();
        await expect(include).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(optionsDialog(page)).toBeHidden();
    }
  });

  test('the script is unchanged by exporting Markdown', async ({ page }) => {
    await start(page);
    await choose(page, 'Include notes (Markdown and HTML)', 'Include');
    const before = await editor(page).evaluate((el) => el.textContent);
    await downloadMarkdown(page);
    await expect(ready(page)).toHaveText('Exported The Call.md, with notes.');
    expect(await editor(page).evaluate((el) => el.textContent)).toBe(before);
    // No changed dot in the title.
    await expect(page).toHaveTitle('The Call — Drafter');
  });
});

/** Where an exported HTML file is opened: an address no server answers, which the test answers. */
const OPENED_AT = 'http://exported.drafter.test/file.html';

/**
 * Opens `html` in a page of `context` as a reader would open the file, with every other request
 * refused, and answers what was asked for besides the file (a `data:` font is in the file, and is
 * no request).
 */
async function openExported(context: BrowserContext, html: string, { script = true } = {}) {
  const asked: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith('data:')) asked.push(request.url());
  });
  await context.route('**/*', (route) =>
    route.request().url() === OPENED_AT
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
  // Anything the file's Content-Security-Policy refused (its own style or script among them),
  // so a blocked resource can't pass unnoticed: the event, and the console's word for it. Firefox
  // asks for the address's /favicon.ico itself, and the policy refuses it: that one is the
  // browser's, not the file's (a file opened from disk has no such address).
  if (script) {
    await context.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { cspSeen: string[] }).cspSeen = seen;
      document.addEventListener('securitypolicyviolation', (event) => {
        if (!event.blockedURI.endsWith('/favicon.ico')) {
          seen.push(`${event.violatedDirective} ${event.blockedURI}`);
        }
      });
    });
  }
  const page = await context.newPage();
  const said: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/content[- ]security[- ]policy|\bCSP\b/i.test(text) && !text.includes('favicon.ico')) {
      said.push(text);
    }
  });
  await page.goto(OPENED_AT);
  // With JavaScript off there is nothing to evaluate in (Firefox waits for ever).
  if (script) await page.evaluate(() => document.fonts.ready);
  return {
    page,
    others: () => asked.filter((url) => url !== OPENED_AT),
    /** What the policy refused, as events and console messages; [] with JavaScript off. */
    refused: async () => [
      ...(script
        ? await page.evaluate(() => (window as unknown as { cspSeen?: string[] }).cspSeen ?? [])
        : []),
      ...said,
    ],
  };
}

test.describe('Export as HTML', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  const appMenu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });

  /** Runs `choose`, which starts a download, and answers the file's name and text. */
  async function downloaded(
    page: Page,
    choose: () => Promise<void>,
  ): Promise<{ name: string; text: string }> {
    const download = page.waitForEvent('download');
    await choose();
    const file = await download;
    return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
  }

  const fromExportMenu = (page: Page) =>
    downloaded(page, async () => {
      await exportButton(page).click();
      await htmlItem(page).click();
    });

  test('exports HTML from the Export menu, the app menu, and the palette', async ({ page }) => {
    await start(page);
    const fromMenu = await fromExportMenu(page);
    expect(fromMenu.name).toBe('The Call.html');
    expect(fromMenu.text.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(fromMenu.text).toContain('<h1 class="title">The Call</h1>');
    expect(fromMenu.text).toMatch(/<p class="kind">Screenplay · 2 pages · About \d+ min<\/p>/);
    await expect(ready(page)).toHaveText('Exported The Call.html.');

    const fromAppMenu = await downloaded(page, async () => {
      await page.getByRole('button', { name: 'Drafter menu' }).click();
      await appMenu(page)
        .getByRole('menuitem', { name: /^Export as HTML/ })
        .click();
    });
    expect(fromAppMenu).toEqual(fromMenu);

    const fromPalette = await downloaded(page, () => runCommand(page, 'Export as HTML'));
    expect(fromPalette).toEqual(fromMenu);
  });

  test('the exported file opens with every request blocked', async ({ page, browser }) => {
    await start(page);
    const { text } = await fromExportMenu(page);
    const context = await browser.newContext();
    try {
      const opened = await openExported(context, text);
      const file = opened.page;
      // Pages first: the printed pages, the title page among them, and Reading hidden.
      const pages = file.locator('main .pages');
      await expect(pages).toBeVisible();
      await expect(pages.locator('.page')).toHaveCount(3);
      await expect(file.locator('main .reading')).toBeHidden();
      await expect(file.locator('html')).toHaveAttribute('data-theme', 'dark');
      // The switch shows Reading …
      const reading = file.getByRole('button', { name: 'Reading' });
      await expect(reading).toHaveAttribute('aria-pressed', 'false');
      await reading.click();
      await expect(reading).toHaveAttribute('aria-pressed', 'true');
      await expect(file.locator('main .reading')).toBeVisible();
      await expect(file.locator('main .reading')).toContainText('You said you');
      await expect(pages).toBeHidden();
      // … and the toggle turns it light.
      const light = file.getByRole('button', { name: 'Light' });
      await light.click();
      await expect(light).toHaveAttribute('aria-pressed', 'true');
      await expect(file.locator('html')).toHaveAttribute('data-theme', 'light');
      // Nothing asked for but the file itself, and nothing in it refused by its own policy.
      expect(opened.others()).toEqual([]);
      expect(await opened.refused()).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('with JavaScript off the file still shows the pages', async ({ page, browser }) => {
    await start(page);
    const { text } = await fromExportMenu(page);
    // With no stored state: the config's seeds the app's IndexedDB, which takes script, and
    // Firefox never finishes making the context when there is none.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const opened = await openExported(context, text, { script: false });
      const file = opened.page;
      await expect(file.locator('main .pages .page')).toHaveCount(3);
      await expect(file.locator('main .pages')).toBeVisible();
      await expect(file.locator('main .pages')).toContainText('INT. KITCHEN - NIGHT');
      await expect(file.locator('html')).toHaveAttribute('data-theme', 'dark');
      // The switches need the script, so they stay hidden.
      await expect(file.getByRole('button', { name: 'Reading' })).toBeHidden();
      expect(opened.others()).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('a Markdown document exports HTML with its links and footnotes', async ({
    page,
    browser,
  }) => {
    await start(page);
    await openMarkdownSample(page);
    await setText(
      page,
      [
        '# Harbour Notes',
        '',
        'See [the Fountain syntax guide](https://fountain.io/syntax) first.[^1]',
        '',
        '## Later',
        '',
        `${'The keeper climbs the stair and counts the lamps. '.repeat(60)}`,
        '',
        '[^1]: Like this one, at the end.',
        '',
      ].join('\n'),
    );
    await expect(editor(page)).toContainText('[^1]: Like this one');
    const { name, text } = await fromExportMenu(page);
    expect(name).toBe('Harbour Notes.html');
    expect(text).toMatch(/<p class="kind">Document · [\d,]+ words · \d+ min read<\/p>/);
    const context = await browser.newContext();
    try {
      const opened = await openExported(context, text);
      const file = opened.page;
      // A writer's web link is a real link, to a new tab.
      const link = file.getByRole('link', { name: 'the Fountain syntax guide' });
      await expect(link).toHaveAttribute('href', 'https://fountain.io/syntax');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // A footnote's reference goes to its note, and the note back.
      const reference = file.getByRole('link', { name: 'Footnote 1', exact: true });
      await expect(reference).toHaveAttribute('href', '#fn-1');
      const note = file.locator('section.footnotes li#fn-1');
      await expect(note).toContainText('Like this one, at the end.');
      await reference.click();
      await expect(note).toBeInViewport();
      await note.locator('a.back').click();
      await expect(file.locator('#fnref-1')).toBeInViewport();
      // No Reading switch for a document; the toggle still works.
      await expect(file.getByRole('button', { name: 'Reading' })).toHaveCount(0);
      await file.getByRole('button', { name: 'Light' }).click();
      await expect(file.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(opened.others()).toEqual([]);
      expect(await opened.refused()).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('prints one sheet for each page, on Letter and on A4', async ({
    page,
    browser,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium’s');
    test.skip(!!isMobile, 'the same Chromium as the desktop project');
    const letter = builtins['us-screenplay'];
    const a4: Template = {
      ...letter,
      page: {
        ...letter.page,
        paper: 'a4',
        width: 82,
        height: 70,
        margin: { ...letter.page.margin, right: 7 },
      },
    };
    const pagesOf = (template: Template) => paginate(parse(SAMPLE), template).pages.length;
    // Letter: the app's own export of the sample.
    await start(page);
    const { text: letterHtml } = await fromExportMenu(page);
    // A4: the same generator, from the A4 page grid, as the command line and a template would.
    const doc = parse(SAMPLE);
    const layout = paginate(doc, a4);
    const fonts = Object.fromEntries(
      [...stylesUsed(layout)].map((style) => [
        style,
        new Uint8Array(readFileSync(`${ROOT}/packages/render-pdf/fonts/${FONT_FILES[style]}`)),
      ]),
    );
    const a4Html = renderScriptHtml({
      doc,
      layout,
      template: a4,
      notes: 'leave-out',
      fonts,
      title: 'The Call',
      lang: 'en',
      generator: 'Drafter',
      kindLine: 'Screenplay',
    });
    for (const [label, html, template, size] of [
      ['Letter', letterHtml, letter, [612, 792]],
      ['A4', a4Html, a4, [595.28, 841.89]],
    ] as const) {
      const context = await browser.newContext();
      try {
        const { page: file } = await openExported(context, html);
        const pdf = await PDFDocument.load(await file.pdf({ preferCSSPageSize: true }));
        expect(pdf.getPageCount(), label).toBe(pagesOf(template));
        for (const sheet of pdf.getPages()) {
          const { width, height } = sheet.getSize();
          expect([Math.round(width), Math.round(height)], label).toEqual(size.map(Math.round));
        }
      } finally {
        await context.close();
      }
    }
  });
});
