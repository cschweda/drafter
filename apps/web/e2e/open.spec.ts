import AxeBuilder from '@axe-core/playwright';
import { zipStored } from '@drafter/archive';
import { expect, type Page, test } from '@playwright/test';
import {
  alertsHeard,
  bytesOf,
  files,
  modifiedOf,
  nextFileName,
  putFile,
  removePickers,
  stubPickers,
  watchAlerts,
} from './fs-stub';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const status = (page: Page) => page.locator('[data-tour="status"]');
const zone = (page: Page) => page.locator('[data-drop-zone]');
const dialog = (page: Page) => page.getByRole('dialog');
const alert = (page: Page) => status(page).getByRole('alert');

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
  fileName?: string;
  savedHash?: string;
  savedAt?: number;
  lineBreak?: string;
  bom?: boolean;
  fsHandleId?: string;
  updatedAt: number;
}

function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.close();
            resolve([]);
            return;
          }
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as Row[]);
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

const mine = async (page: Page) => (await stored(page)).filter((p) => !p.sample);

async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeAttached();
}

const SCRIPT = 'Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n';
const crlf = (s: string) => s.replace(/\n/g, '\r\n');
const bytesOfText = (s: string) => Array.from(new TextEncoder().encode(s));

async function openMenu(page: Page) {
  await openButton(page).click();
  await expect(menu(page)).toBeVisible();
}

/** Open a file… with a file input: the browser has no picker. */
async function chooseWithInput(page: Page, name: string, content: string | number[]) {
  await openMenu(page);
  const chooser = page.waitForEvent('filechooser');
  await menu(page).getByRole('button', { name: 'Open a file…' }).click();
  await (await chooser).setFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(typeof content === 'string' ? content : new Uint8Array(content)),
  });
}

/** Open a file… with the stand-in picker, which answers with a file already in the stand-in file system. */
async function choosePicked(page: Page, name: string) {
  await nextFileName(page, name);
  await openMenu(page);
  await menu(page).getByRole('button', { name: 'Open a file…' }).click();
}

/** A file dragged over the window (the page's drop zone shows), and optionally let go. */
async function dragFile(page: Page, name: string, content: string | number[], letGo: boolean) {
  const bytes = typeof content === 'string' ? bytesOfText(content) : content;
  await page.evaluate(
    ({ n, b, drop }) => {
      const w = window as unknown as { __dt?: DataTransfer };
      if (!w.__dt) {
        w.__dt = new DataTransfer();
        w.__dt.items.add(new File([new Uint8Array(b)], n, { type: 'text/plain' }));
      }
      const fire = (type: string) =>
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: w.__dt, bubbles: true, cancelable: true }),
        );
      fire('dragenter');
      fire('dragover');
      if (drop) {
        fire('drop');
        w.__dt = undefined;
      }
    },
    { n: name, b: bytes, drop: letGo },
  );
}

/** A file dropped on the editor's own text, where CodeMirror's drop handler is, and then let go. */
async function dropOnEditor(page: Page, name: string, content: string | number[]) {
  const bytes = typeof content === 'string' ? bytesOfText(content) : content;
  const box = await editor(page).boundingBox();
  await page.evaluate(
    ({ n, b, x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], n, { type: 'text/plain' }));
      const target = document.querySelector('.cm-content') as Element;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      }
    },
    { n: name, b: bytes, x: (box?.x ?? 0) + 40, y: (box?.y ?? 0) + 40 },
  );
}

test.describe('opening a file (Chromium, with the picker)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('opens a file from the picker', async ({ page }) => {
    await start(page);
    await putFile(page, 'Door.fountain', SCRIPT);
    await choosePicked(page, 'Door.fountain');

    await expect(editor(page)).toContainText('A door opens.');
    await expect(menu(page)).toBeHidden();
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    const row = (await mine(page)).find((p) => p.title === 'The Open Door');
    expect(row?.fileName).toBe('Door.fountain');
    expect(row?.fsHandleId).toBeTruthy();
    expect(row?.savedHash).toBeTruthy();
    expect(row?.source).toBe(SCRIPT);
    await expect(page).toHaveTitle('The Open Door — Drafter');
  });

  test('saves a CRLF file with a BOM byte for byte', async ({ page }) => {
    await start(page);
    const original = [0xef, 0xbb, 0xbf, ...bytesOfText(crlf(SCRIPT))];
    await putFile(page, 'Crlf.fountain', original);
    await choosePicked(page, 'Crlf.fountain');
    await expect(editor(page)).toContainText('A door opens.');
    const row = (await mine(page)).find((p) => p.fileName === 'Crlf.fountain');
    expect(row?.lineBreak).toBe('\r\n');
    expect(row?.bom).toBe(true);

    // Edit, undo, save: the file is as it was.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('MORE');
    await expect(status(page)).toContainText('Unsaved changes');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('MORE');
    // A file nobody changed is not changed, so the save writes it again as it was. That a save
    // happened is proved by the file's modified time moving and the script's record of it, not by
    // the bytes, which were the same before.
    const modified = (await modifiedOf(page, 'Crlf.fountain')) ?? 0;
    const savedAt = (await mine(page)).find((p) => p.fileName === 'Crlf.fountain')?.savedAt ?? 0;
    await page.waitForTimeout(50);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await expect
      .poll(async () => (await modifiedOf(page, 'Crlf.fountain')) ?? 0)
      .toBeGreaterThan(modified);
    await expect
      .poll(
        async () => (await mine(page)).find((p) => p.fileName === 'Crlf.fountain')?.savedAt ?? 0,
      )
      .toBeGreaterThan(savedAt);
    expect(await bytesOf(page, 'Crlf.fountain')).toEqual(original);

    // And an edit that stays is written with the file's line breaks.
    await page.keyboard.insertText('X');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    const written = await bytesOf(page, 'Crlf.fountain');
    expect(written?.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(Buffer.from(written ?? []).toString('utf8')).toBe(`﻿${crlf(SCRIPT)}X`);
  });

  test('opens a file that’s already open as the same script', async ({ page }) => {
    await start(page);
    await putFile(page, 'Door.fountain', SCRIPT);
    await choosePicked(page, 'Door.fountain');
    await expect(editor(page)).toContainText('A door opens.');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('EDITED');
    await expect
      .poll(async () => (await mine(page)).some((p) => p.source.includes('EDITED')))
      .toBe(true);

    await openMenu(page);
    await menu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(editor(page)).not.toContainText('A door opens.');
    const before = (await mine(page)).length;

    await choosePicked(page, 'Door.fountain');
    await expect(editor(page)).toContainText('EDITED');
    expect((await mine(page)).length).toBe(before);
    expect(await files(page)).toEqual(['Door.fountain']);
  });

  test('can’t open a file or save from a read-only tab', async ({ context }) => {
    const first = await context.newPage();
    await stubPickers(first);
    await start(first);
    await openMenu(first);
    await menu(first).getByRole('button', { name: 'New screenplay' }).click();
    await expect(menu(first)).toBeHidden();
    await first.keyboard.insertText('HELD');
    await expect
      .poll(async () => (await mine(first)).some((p) => p.source.includes('HELD')))
      .toBe(true);

    const second = await context.newPage();
    await stubPickers(second);
    await start(second);
    await expect(second.getByText('This script is open for editing in another tab')).toBeVisible();
    await putFile(second, 'Door.fountain', SCRIPT);
    const count = (await stored(second)).length;

    await openMenu(second);
    for (const name of ['Open a file…', 'New screenplay', 'New stage play', 'Save As…']) {
      await expect(menu(second).getByRole('button', { name })).toBeDisabled();
    }
    await expect(menu(second).getByText('Choose “Edit here instead” first')).toBeVisible();
    await second.keyboard.press('Escape');

    // Save says why, and writes nothing.
    await second.getByRole('button', { name: 'Save', exact: true }).click({ force: true });
    await expect(alert(second)).toContainText('Choose “Edit here instead” first');
    await nextFileName(second, 'nope.fountain');
    await second.keyboard.press('ControlOrMeta+s');
    expect(await files(second)).toEqual(['Door.fountain']);
    expect(
      await second.evaluate(() => (window as unknown as { __picks: string[] }).__picks),
    ).toEqual([]);

    // A dropped file is turned away the same way, and the editor stays as it was.
    await dragFile(second, 'Door.fountain', SCRIPT, true);
    await expect(editor(second)).toContainText('HELD');
    await expect(editor(second)).not.toContainText('A door opens.');
    expect((await stored(second)).length).toBe(count);

    // Editing here lifts all of it.
    await second.getByRole('button', { name: 'Edit here instead' }).click();
    await expect(alert(second)).toHaveCount(0);
    await openMenu(second);
    await expect(menu(second).getByRole('button', { name: 'Open a file…' })).toBeEnabled();
  });
});

test.describe('opening a file where there is no picker', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('opens a file from the file input', async ({ page }) => {
    await start(page);
    await chooseWithInput(page, 'Door.fountain', SCRIPT);
    await expect(editor(page)).toContainText('A door opens.');
    await expect(menu(page)).toBeHidden();
    const row = (await mine(page)).find((p) => p.title === 'The Open Door');
    expect(row?.fileName).toBe('Door.fountain');
    // No handle without a picker, and it opens clean.
    expect(row?.fsHandleId).toBeUndefined();
    expect(row?.savedHash).toBeTruthy();
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
  });

  test('opens a file from the keyboard', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no keyboard on a phone');
    await start(page);
    await openButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    const item = menu(page).getByRole('button', { name: 'Open a file…' });
    // The menu's items wait while it loads this browser's scripts.
    await expect(item).toBeEnabled();
    await item.focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({
      name: 'Door.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(SCRIPT),
    });
    await expect(editor(page)).toContainText('A door opens.');
  });

  test('opens a dropped file', async ({ page }) => {
    await start(page);
    await dragFile(page, 'Dropped.txt', SCRIPT, false);
    await expect(zone(page)).toContainText(
      'Drop a .fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein file to open it',
    );
    await dragFile(page, 'Dropped.txt', SCRIPT, true);
    await expect(zone(page)).toHaveCount(0);
    await expect(editor(page)).toContainText('A door opens.');
    const row = (await mine(page)).find((p) => p.title === 'The Open Door');
    expect(row?.fileName).toBe('Dropped.txt');
  });

  test('a file dropped on the editor opens as its own script and is not pasted into the open one', async ({
    page,
  }) => {
    await start(page);
    const open = (await stored(page)).find((p) => p.sample);
    expect(open).toBeTruthy();
    const shown = await editor(page).textContent();

    await dropOnEditor(page, 'Dropped.fountain', `${SCRIPT}DROPPEDFILEMARKER\n`);
    await expect(editor(page)).toContainText('DROPPEDFILEMARKER');
    await expect.poll(async () => (await mine(page)).length).toBe(1);
    // CodeMirror reads a dropped file asynchronously: give a late paste time to land.
    await page.waitForTimeout(1000);

    const rows = await stored(page);
    // The script that was open still holds exactly what it did.
    expect(rows.find((p) => p.id === open?.id)?.source).toBe(open?.source);
    expect(rows.find((p) => p.id === open?.id)?.source).not.toContain('DROPPEDFILEMARKER');
    // The file is its own script, once over.
    const created = rows.filter((p) => !p.sample);
    expect(created.map((p) => p.fileName)).toEqual(['Dropped.fountain']);
    expect(created[0]?.source).toBe(`${SCRIPT}DROPPEDFILEMARKER\n`);
    expect(await editor(page).textContent()).not.toBe(shown);
    await expect(editor(page)).toContainText('A door opens.');
    expect((await editor(page).textContent())?.split('DROPPEDFILEMARKER').length).toBe(2);
    // Unsaved changes would mean text was inserted after the file opened.
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
  });

  test('a refused file dropped on the editor inserts nothing', async ({ page }) => {
    await start(page);
    const before = await stored(page);
    const shown = await editor(page).textContent();

    await dropOnEditor(page, 'Cafe.txt', [0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await expect(alert(page)).toContainText('isn’t UTF-8 text');
    await page.waitForTimeout(1000);
    expect(await editor(page).textContent()).toBe(shown);
    const after = await stored(page);
    expect(after.map((p) => [p.id, p.source])).toEqual(before.map((p) => [p.id, p.source]));
  });

  test('text dragged onto the editor is still dropped in', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the editor is not on screen on a phone to drop on');
    await start(page);
    await editor(page).click();
    const box = await editor(page).boundingBox();
    await page.evaluate(
      ({ x, y }) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'DRAGGEDWORDS');
        const target = document.querySelector('.cm-content') as Element;
        for (const type of ['dragenter', 'dragover', 'drop']) {
          target.dispatchEvent(
            new DragEvent(type, {
              dataTransfer: dt,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
          );
        }
      },
      { x: (box?.x ?? 0) + 40, y: (box?.y ?? 0) + 40 },
    );
    await expect(editor(page)).toContainText('DRAGGEDWORDS');
  });

  test('leaves text dragged inside the page alone', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'just text');
      document.body.dispatchEvent(
        new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect(zone(page)).toHaveCount(0);
  });

  test('asks before replacing a script with the same title', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the dialog is checked on a phone by the axe test');
    const other = 'Title: The Open Door\n\nINT. YARD - DAY\n\nDifferent words.\n';
    await start(page);
    await chooseWithInput(page, 'Door.fountain', SCRIPT);
    await expect(editor(page)).toContainText('A door opens.');
    await expect.poll(async () => (await mine(page)).length).toBe(1);

    // Cancel changes nothing.
    await chooseWithInput(page, 'Door2.fountain', other);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('“The Open Door” is already in this browser');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toContainText('A door opens.');
    expect((await mine(page)).length).toBe(1);

    // Escape is Cancel.
    await chooseWithInput(page, 'Door2.fountain', other);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    expect((await mine(page)).length).toBe(1);
    await expect(editor(page)).toContainText('A door opens.');

    // Open beside it makes a second script.
    await chooseWithInput(page, 'Door2.fountain', other);
    await dialog(page).getByRole('button', { name: 'Open beside it' }).click();
    await expect(editor(page)).toContainText('Different words.');
    await expect.poll(async () => (await mine(page)).length).toBe(2);

    // Replace that script puts the new text in the existing one, and undo brings the old back.
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'New screenplay' }).click();
    await chooseWithInput(
      page,
      'Door3.fountain',
      'Title: The Open Door\n\nINT. SEA - DAY\n\nWaves.\n',
    );
    await dialog(page).getByRole('button', { name: 'Replace that script' }).click();
    await expect(editor(page)).toContainText('Waves.');
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    await expect.poll(async () => (await mine(page)).length).toBe(3);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('Waves.');
    await expect(editor(page)).toContainText(/A door opens\.|Different words\./);
    await expect(status(page)).toContainText('Unsaved changes');
  });

  test('refuses a file that isn’t text', async ({ page }) => {
    await start(page);
    const before = (await stored(page)).length;
    await chooseWithInput(page, 'Picture.png', [0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
    await expect(alert(page)).toContainText('isn’t a script');
    expect((await stored(page)).length).toBe(before);
    await expect(editor(page)).toContainText('INT.');

    // Latin-1 text is refused too: saving would change its characters.
    await chooseWithInput(page, 'Cafe.txt', [0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await expect(alert(page)).toContainText('isn’t UTF-8 text');
    expect((await stored(page)).length).toBe(before);
    if (process.env.A11Y) expect(await violations(page)).toEqual([]);

    // The next good file clears the message.
    await chooseWithInput(page, 'Door.fountain', SCRIPT);
    await expect(editor(page)).toContainText('A door opens.');
    await expect(alert(page)).toHaveCount(0);
  });

  test('dropping a .rtf says it is an RTF document and opens nothing', async ({ page }) => {
    await start(page);
    const before = (await stored(page)).length;
    await dragFile(page, 'Letter.rtf', '{\\rtf1\\ansi INT. POST OFFICE - DAY\\par}', true);
    await expect(zone(page)).toHaveCount(0);
    await expect(alert(page)).toContainText(
      'Drafter can’t open an RTF document (Letter.rtf). Save it as plain text or Fountain in the app that made it, then open that.',
    );
    expect((await stored(page)).length).toBe(before);
    await expect(editor(page)).not.toContainText('rtf1');
    await expect(editor(page)).toContainText('INT.');
  });

  test('refuses a web page, an exported one or one named as a script, and opens nothing', async ({
    page,
  }) => {
    await start(page);
    const before = (await stored(page)).length;
    const PAGE = '<!DOCTYPE html>\n<html lang="en"><head><title>The Call</title></head></html>\n';
    await chooseWithInput(page, 'The Call.html', PAGE);
    await expect(alert(page)).toContainText(
      'Drafter can’t open a web page (The Call.html). Open the script it was made from instead.',
    );
    // Named as a script, it is still known by its first text.
    await chooseWithInput(page, 'The Call.fountain', PAGE);
    await expect(alert(page)).toContainText(
      'Drafter can’t open a web page (The Call.fountain). Open the script it was made from instead.',
    );
    expect((await stored(page)).length).toBe(before);
    await expect(editor(page)).not.toContainText('DOCTYPE');
    await expect(editor(page)).toContainText('INT.');
  });

  test('refuses an e-book, an exported one or one named as a script, and opens nothing', async ({
    page,
  }) => {
    await start(page);
    const before = (await stored(page)).length;
    // An EPUB, as Drafter's own export writes one: its first entry is the mimetype, stored.
    const BOOK = [
      ...zipStored([
        { name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') },
        { name: 'EPUB/package.opf', data: new TextEncoder().encode('<package/>') },
      ]),
    ];
    await chooseWithInput(page, 'The Call.epub', BOOK);
    await expect(alert(page)).toContainText(
      'Drafter can’t open an e-book (The Call.epub). Open the script it was made from instead.',
    );
    // Named as a script, it is still known by its mimetype entry.
    await chooseWithInput(page, 'The Call.fountain', BOOK);
    await expect(alert(page)).toContainText(
      'Drafter can’t open an e-book (The Call.fountain). Open the script it was made from instead.',
    );
    expect((await stored(page)).length).toBe(before);
    await expect(editor(page)).not.toContainText('epub');
    await expect(editor(page)).toContainText('INT.');
  });

  test('announces a refusal again when the same file is refused twice', async ({ page }) => {
    await watchAlerts(page);
    await start(page);
    const heard = async () =>
      (await alertsHeard(page)).filter((text) => text.includes('isn’t UTF-8'));
    await chooseWithInput(page, 'Cafe.txt', [0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await expect(alert(page)).toContainText('isn’t UTF-8 text');
    await expect.poll(heard).toHaveLength(1);
    // The same message again is a new alert, or a screen reader says nothing the second time.
    await chooseWithInput(page, 'Cafe.txt', [0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await expect.poll(heard).toHaveLength(2);
    await expect(alert(page)).toContainText('isn’t UTF-8 text');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations with the drop zone and the dialog showing (${theme})`, async ({
      page,
      browserName,
    }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('nuxt-color-mode', t);
        } catch {
          // The page falls back to its default.
        }
      }, theme);
      await start(page);
      await chooseWithInput(page, 'Door.fountain', SCRIPT);
      await expect(editor(page)).toContainText('A door opens.');

      await dragFile(page, 'Next.fountain', SCRIPT, false);
      await expect(zone(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.evaluate(() => window.dispatchEvent(new Event('dragend')));
      await expect(zone(page)).toHaveCount(0);

      await chooseWithInput(page, 'Door2.fountain', SCRIPT);
      await expect(dialog(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
      // The keyboard reaches all three answers (WebKit's Tab skips buttons).
      await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
      if (browserName !== 'webkit') {
        await page.keyboard.press('Tab');
        await expect(dialog(page).getByRole('button', { name: 'Open beside it' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
          dialog(page).getByRole('button', { name: 'Replace that script' }),
        ).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    });
  }
});
