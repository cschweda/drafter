import { expect, type Page, test } from '@playwright/test';
import { type Outcome, TRAPS, type Trap } from '../../../fixtures/trap/traps';
import { removePickers } from './fs-stub';
import { showView } from './modules';

// The trap documents (fixtures/trap) through the real web app, in real browsers: one of each format
// and the nastiest few, dropped on the window and chosen with the file input. Each must open with
// its text or be refused with its message, and nothing in it may run, draw markup, or reach the
// network: the page counts every request off its own origin, every dialog, and the flag a
// payload would set (`window.__trapped`).

/** The traps driven here: one per format, and the ones most likely to hurt a browser. */
const IDS = [
  'fountain-title-page-html',
  'fountain-action-html',
  'fountain-notes-html',
  'fountain-utf16le',
  'fountain-pdf',
  'md-raw-html',
  'md-hostile-links',
  'txt-exe',
  'fdx-valid',
  'fdx-billion-laughs',
  'fdx-xxe-http',
  'fdx-unknown-types',
  'highland-valid',
  'highland-bomb',
  'highland-traversal-dotdot',
  'fadein-valid',
  'fadein-xxe',
  'html-hostile-page',
  'html-two-blocks',
  'epub-scripts',
  'epub-source-bomb',
];
const CHOSEN: Trap[] = IDS.map((id) => {
  const trap = TRAPS.find((t) => t.id === id);
  if (!trap) throw new Error(`no trap ${id}`);
  return trap;
});

const editor = (page: Page) => page.locator('.cm-content');
const status = (page: Page) => page.locator('[data-tour="status"]');
const alert = (page: Page) => status(page).getByRole('alert');
const toast = (page: Page) => page.locator('.toast [role="status"]');

/** What the page did that a trap must never make it do. */
interface Watch {
  offOrigin: string[];
  dialogs: string[];
}

async function start(page: Page, baseURL: string): Promise<Watch> {
  const watch: Watch = { offOrigin: [], dialogs: [] };
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      watch.offOrigin.push(url);
    }
  });
  page.on('dialog', (dialog) => {
    watch.dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.goto('/');
  // The sample is up (by its title: a small phone's editor may have scrolled its top away).
  await expect(editor(page)).toBeAttached();
  await expect(page).toHaveTitle(/The Call/);
  return watch;
}

/** A file dropped on the window, its bytes sent as base64. */
async function drop(page: Page, name: string, bytes: Uint8Array) {
  await page.evaluate(
    ({ n, b64 }) => {
      const raw = atob(b64);
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([data], n));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    },
    { n: name, b64: Buffer.from(bytes).toString('base64') },
  );
}

/** Open a file… with the file input (the browser has no picker). */
async function chooseWithInput(page: Page, name: string, bytes: Uint8Array) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Scripts', exact: true });
  const item = menu.getByRole('button', { name: 'Open a file…' });
  await expect(item).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await item.click();
  await (await chooser).setFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
}

/** Short lines to look for on screen: the outcome's own, else its text's first few. */
function keyLines(outcome: Outcome): string[] {
  if (outcome.kind === 'refused') return [];
  const lines = outcome.lines ?? outcome.text?.split('\n') ?? [];
  return lines.filter((line) => line.trim() !== '' && line.length < 80).slice(0, 3);
}

/** Checks the outcome on screen, then that nothing ran, drew markup, or left the origin. */
async function expectOutcome(page: Page, trap: Trap, watch: Watch) {
  const outcome = trap.expect['web-open'] as Outcome;
  if (outcome.kind === 'refused') {
    await expect(alert(page)).toContainText(outcome.says);
    // The sample on show stays (by its title: a small phone's editor may have scrolled its top away).
    await expect(page).toHaveTitle(/The Call/);
  } else {
    for (const line of keyLines(outcome)) await expect(editor(page)).toContainText(line);
    if (outcome.kind === 'opens-with-warning')
      await expect(toast(page)).toContainText(outcome.says);
    // The text drawn in each view, so a payload has every chance to run.
    const markdown = trap.name.endsWith('.md');
    await showView(page, markdown ? 'Preview' : 'Script');
    await page.waitForTimeout(300);
    const view = markdown
      ? page.getByRole('article', { name: 'Preview' })
      : page.getByRole('region', { name: 'Script' });
    await expect(view.locator('img, iframe, object, embed, script').first()).toHaveCount(0);
    // The Preview shows a link's text, never a link (javascript:, data:, or any other).
    if (markdown) await expect(view.locator('a[href]')).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as { __trapped?: unknown }).__trapped)).toBeUndefined();
  expect(watch.dialogs, 'no dialog opened').toEqual([]);
  expect(watch.offOrigin, 'nothing fetched off the origin').toEqual([]);
}

test.describe('trap documents, dropped on the window', () => {
  for (const trap of CHOSEN) {
    test(`${trap.id}: ${trap.tests}`, async ({ page, baseURL }) => {
      const watch = await start(page, baseURL as string);
      await drop(page, trap.name, trap.bytes?.() as Uint8Array);
      await expectOutcome(page, trap, watch);
    });
  }
});

test.describe('trap documents, chosen with the file input', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });
  for (const id of ['fountain-action-html', 'md-raw-html', 'html-hostile-page', 'highland-bomb']) {
    const trap = CHOSEN.find((t) => t.id === id) as Trap;
    test(`${trap.id}: ${trap.tests}`, async ({ page, baseURL }) => {
      const watch = await start(page, baseURL as string);
      await chooseWithInput(page, trap.name, trap.bytes?.() as Uint8Array);
      await expectOutcome(page, trap, watch);
    });
  }
});
