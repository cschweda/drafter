import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  bytesOf,
  cancelNextPick,
  failWrites,
  files,
  nextFileName,
  picks,
  removePickers,
  stubPickers,
  textOf,
} from './fs-stub';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts' });
const status = (page: Page) => page.locator('[data-tour="status"]');

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
  fileName?: string;
  savedHash?: string;
  savedAt?: number;
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

async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeAttached();
}

async function chooseNew(page: Page, name: string) {
  await openButton(page).click();
  await menu(page).getByRole('button', { name }).click();
  await expect(menu(page)).toBeHidden();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/** The script that is not a sample, as stored. */
const mine = async (page: Page) => (await stored(page)).find((p) => !p.sample);

test.describe('saving to a file (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('saves a new script to a file and then saves in place', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await nextFileName(page, 'my-script.fountain');
    await saveButton(page).click();

    await expect(status(page)).toContainText('Saved just now');
    const first = await textOf(page, 'my-script.fountain');
    expect(first).toContain('Title: Untitled Screenplay');
    expect(first).toMatch(/FADE IN:$/);
    expect(await picks(page)).toEqual(['my-script.fountain']);
    const row = await mine(page);
    expect(row?.fileName).toBe('my-script.fountain');
    expect(row?.savedHash).toBeTruthy();
    expect(row?.fsHandleId).toBeTruthy();

    // Typing makes it changed, and the next save writes the same file without asking.
    await typeAtEnd(page, ' SECOND');
    await expect(status(page)).toContainText('Unsaved changes');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect(await textOf(page, 'my-script.fountain')).toMatch(/FADE IN: SECOND$/);
    expect(await picks(page)).toHaveLength(1);
    expect(await files(page)).toEqual(['my-script.fountain']);

    // The file is remembered across a reload, and the script still counts as saved.
    await page.reload();
    await expect(editor(page)).toContainText('SECOND');
    await expect(status(page)).toContainText(/Saved (just now|\d+ min ago)/);
    await typeAtEnd(page, ' THIRD');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect(await picks(page)).toHaveLength(0);
    expect(await textOf(page, 'my-script.fountain')).toMatch(/FADE IN: SECOND THIRD$/);
  });

  test('stays saved after typing resumes and the recovery copy writes', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('ONE');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    const saved = await mine(page);
    await page.keyboard.insertText(' TWO');
    await expect.poll(async () => (await mine(page))?.source).toContain('ONE TWO');
    const after = await mine(page);
    expect(after?.savedHash).toBe(saved?.savedHash);
    expect(after?.savedAt).toBe(saved?.savedAt);
    expect(after?.fileName).toBe(saved?.fileName);
    expect(after?.fsHandleId).toBe(saved?.fsHandleId);
    await expect(status(page)).toContainText('Unsaved changes');
    // Typed back to what was saved, it is saved again.
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(status(page)).toContainText('Saved');
  });

  test('saves as a new file', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('ALPHA');
    await nextFileName(page, 'one.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');

    await page.keyboard.insertText(' BETA');
    await nextFileName(page, 'two.fountain');
    await openButton(page).click();
    await menu(page).getByRole('button', { name: 'Save As…' }).click();
    await expect(menu(page)).toBeHidden();
    await expect(status(page)).toContainText('Saved just now');
    expect(await files(page)).toEqual(['one.fountain', 'two.fountain']);
    expect(await textOf(page, 'two.fountain')).toMatch(/ALPHA BETA$/);
    // The first file keeps what it had, and the script follows the second.
    expect(await textOf(page, 'one.fountain')).toMatch(/ALPHA$/);
    expect((await mine(page))?.fileName).toBe('two.fountain');
    await page.keyboard.insertText(' GAMMA');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect(await textOf(page, 'two.fountain')).toMatch(/ALPHA BETA GAMMA$/);
    expect(await textOf(page, 'one.fountain')).toMatch(/ALPHA$/);

    // Save As with the key.
    await nextFileName(page, 'three.fountain');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect.poll(() => files(page)).toContain('three.fountain');
  });

  test('turns a saved sample into the writer’s own script', async ({ page }) => {
    await start(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nMY EDIT');
    await nextFileName(page, 'mine.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');

    expect(await picks(page)).toEqual(['mine.fountain']);
    expect(await textOf(page, 'mine.fountain')).toContain('MY EDIT');
    await expect.poll(async () => (await stored(page)).length).toBe(2);
    const rows = await stored(page);
    const sample = rows.find((p) => p.sample);
    const own = rows.find((p) => !p.sample);
    expect(own?.fileName).toBe('mine.fountain');
    expect(own?.savedHash).toBeTruthy();
    expect(sample?.fileName).toBeUndefined();
    expect(sample?.savedHash).toBeUndefined();
    expect(sample?.fsHandleId).toBeUndefined();
    // The editor is on the new script and goes on writing into it.
    await expect(editor(page)).toContainText('MY EDIT');
    await page.keyboard.insertText(' AND MORE');
    await expect
      .poll(async () => (await stored(page)).find((p) => !p.sample)?.source)
      .toContain('AND MORE');
    expect((await stored(page)).find((p) => p.sample)?.source).not.toContain('AND MORE');
    // It is listed among the writer's scripts.
    await openButton(page).click();
    await expect(menu(page).locator('li .title')).toHaveText(['The Call']);
    // Undo history survived the move.
    await page.keyboard.press('Escape');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('AND MORE');
  });

  test('does nothing when the picker is cancelled', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('UNSAVED');
    await cancelNextPick(page);
    await saveButton(page).click();
    await expect(status(page)).toContainText('Not saved to a file yet');
    expect(await files(page)).toEqual([]);
    const row = await mine(page);
    expect(row?.savedHash).toBeUndefined();
    expect(row?.fileName).toBeUndefined();
    await expect(page.getByRole('alert').filter({ hasText: /save/i })).toHaveCount(0);
    // Nothing changed, so saving still works afterwards.
    await nextFileName(page, 'later.fountain');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
  });

  test('says so when the file can’t be written, and keeps the text', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('KEEP');
    await failWrites(page);
    await saveButton(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Drafter isn’t allowed' }),
    ).toBeVisible();
    await expect(status(page)).toContainText('Not saved to a file yet');
    expect((await mine(page))?.savedHash).toBeUndefined();
    await expect(editor(page)).toContainText('KEEP');
    expect(await violations(page)).toEqual([]);
  });

  test('saves in a read-only tab, writing the text it shows', async ({ context }) => {
    const first = await context.newPage();
    await stubPickers(first);
    await start(first);
    await chooseNew(first, 'New screenplay');
    await first.keyboard.insertText('HELD');
    await expect.poll(async () => (await mine(first))?.source).toContain('HELD');

    const second = await context.newPage();
    await stubPickers(second);
    await start(second);
    await expect(second.getByText('This script is open for editing in another tab')).toBeVisible();
    await expect(editor(second)).toContainText('HELD');
    await nextFileName(second, 'readonly.fountain');
    await second.keyboard.press('ControlOrMeta+s');
    await expect(status(second)).toContainText('Saved just now');
    expect(await textOf(second, 'readonly.fountain')).toContain('HELD');
    expect((await mine(second))?.fileName).toBe('readonly.fountain');
    // It is still the other tab's to edit.
    await expect(second.getByText('This script is open for editing in another tab')).toBeVisible();
    expect(await editor(second).getAttribute('contenteditable')).toBe('false');
    // And the holder's next recovery write doesn't undo the record of the save.
    await first.keyboard.insertText(' MORE');
    await expect.poll(async () => (await mine(first))?.source).toContain('HELD MORE');
    expect((await mine(first))?.fileName).toBe('readonly.fountain');
  });
});

test.describe('saving where the browser can’t save in place', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('downloads the script when the browser can’t save in place', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the menu path is covered on the desktop; see the axe test for phones');
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('FADE IN:');
    await expect.poll(async () => (await mine(page))?.source).toContain('FADE IN:');

    const download = page.waitForEvent('download');
    await saveButton(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Untitled Screenplay.fountain');
    const path = await file.path();
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(path, 'utf8');
    expect(text).toContain('Title: Untitled Screenplay');
    expect(text).toMatch(/FADE IN:$/);
    // It is the editor's text, whole.
    await expect.poll(async () => (await mine(page))?.source).toBe(text);
    await expect(status(page)).toContainText('Saved just now');
    expect((await mine(page))?.fileName).toBe('Untitled Screenplay.fountain');

    // Save As downloads again, under the same name.
    await page.keyboard.insertText(' MORE');
    const again = page.waitForEvent('download');
    await openButton(page).click();
    await menu(page).getByRole('button', { name: 'Save As…' }).click();
    expect((await again).suggestedFilename()).toBe('Untitled Screenplay.fountain');
  });

  test('announces every save to a screen reader, and not a reload', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'same on a phone');
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.evaluate(() => {
      const w = window as unknown as { __heard: string[] };
      w.__heard = [];
      const region = document.querySelector('[data-tour="status"] [role="status"]');
      new MutationObserver(() => {
        if (region?.textContent) w.__heard.push(region.textContent);
      }).observe(region as Node, { childList: true, characterData: true, subtree: true });
    });
    const heard = () =>
      page.evaluate(() => (window as unknown as { __heard: string[] }).__heard.length);
    await page.keyboard.insertText('ONE');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(heard).toBe(1);
    await page.keyboard.insertText(' TWO');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(heard).toBe(2);
    await page.reload();
    await expect(editor(page)).toContainText('TWO');
    await expect(status(page).locator('[role="status"]')).toHaveText('');
  });

  test('downloads a sample under its title and makes it the writer’s own', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'same on a phone');
    await start(page);
    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    expect((await download).suggestedFilename()).toBe('The Call.fountain');
    await expect(status(page)).toContainText('Saved just now');
    await expect.poll(async () => (await stored(page)).length).toBe(2);
    expect((await mine(page))?.fileName).toBe('The Call.fountain');
  });

  test('shows the save state in the status bar and the tab title', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'same on a phone');
    await page.clock.install();
    await start(page);
    await chooseNew(page, 'New screenplay');
    await expect(status(page)).toContainText('Not saved to a file yet');
    await expect(page).toHaveTitle('Untitled Screenplay — Drafter');
    await page.keyboard.insertText('X');
    await expect(page).toHaveTitle('• Untitled Screenplay — Drafter');

    const download = page.waitForEvent('download');
    await saveButton(page).click();
    await download;
    await expect(status(page)).toContainText('Saved just now');
    await expect(page).toHaveTitle('Untitled Screenplay — Drafter');

    await page.clock.fastForward('05:00');
    await expect(status(page)).toContainText('Saved 5 min ago', { timeout: 35_000 });
    await page.clock.fastForward('01:10:00');
    await expect(status(page)).toContainText(/Saved at \d{1,2}:\d{2}/, { timeout: 35_000 });

    await typeAtEnd(page, 'Y');
    await expect(status(page)).toContainText('Unsaved changes');
    await expect(page).toHaveTitle('• Untitled Screenplay — Drafter');
  });

  test('saves with Mod+S from anywhere', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no keyboard on a phone');
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('KEYS');
    // After the app's own handler has run, was the key's default (Save Page) prevented?
    await page.evaluate(() => {
      const w = window as unknown as { __prevented: boolean[] };
      w.__prevented = [];
      // Added after the app's own capture listener, on the same target, so it runs after it.
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.key.toLowerCase() === 's') w.__prevented.push(e.defaultPrevented);
        },
        true,
      );
    });
    const prevented = () =>
      page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented);

    // From the editor.
    let download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    await download;
    // From a toolbar button.
    await openButton(page).focus();
    download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    await download;
    // From the status bar's button, and as Save As.
    await page.getByRole('button', { name: /Recovery copy/ }).focus();
    download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await download;
    expect(await prevented()).toEqual([true, true, true]);
  });

  test('has no accessibility violations after saving', async ({ page }) => {
    await start(page);
    await chooseNew(page, 'New screenplay');
    await page.keyboard.insertText('A');
    const download = page.waitForEvent('download');
    await saveButton(page).click();
    await download;
    await expect(status(page)).toContainText('Saved just now');
    expect(await violations(page)).toEqual([]);
    await typeAtEnd(page, 'B');
    await expect(status(page)).toContainText('Unsaved changes');
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await violations(page)).toEqual([]);
  });
});

test('reads back the bytes of a saved file', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !!isMobile, 'the File System Access API');
  await stubPickers(page);
  await start(page);
  await chooseNew(page, 'New screenplay');
  await nextFileName(page, 'bytes.fountain');
  await saveButton(page).click();
  await expect(status(page)).toContainText('Saved just now');
  const bytes = await bytesOf(page, 'bytes.fountain');
  // No byte-order mark on a script that came from no file, and `\n` line breaks.
  expect(bytes?.slice(0, 3)).not.toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes).not.toContain(13);
});
