import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { expectNewestThenCompare } from './bulk-snapshot';
import { nextFileName, putFile, stubPickers, textOf } from './fs-stub';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const status = (page: Page) => page.locator('[data-tour="status"]');
const dialog = (page: Page) => page.getByRole('dialog');
const bar = (page: Page) => page.locator('[data-file-bar]');

interface Row {
  id: string;
  lineBreak?: string;
  title: string;
  source: string;
  sample?: string;
  fileName?: string;
  savedHash?: string;
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
const byTitle = async (page: Page, title: string) =>
  (await mine(page)).find((p) => p.title === title);

/** CodeMirror keeps its view on the content element's tile, which a test can reach to type as a keystroke already on its way would. */
interface EditorTile {
  root?: { view?: EditorViewLike };
  view?: EditorViewLike;
}
interface EditorViewLike {
  dispatch(spec: unknown): void;
  state: { doc: { length: number; toString(): string } };
}
const INSERT_AT_END = `(text) => {
  const tile = document.querySelector('.cm-content').cmTile;
  const view = (tile.root && tile.root.view) || tile.view;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}`;

const NAME = 'The Call.fountain';
const V1 = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
const V2 = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n\nNobody answers.\n';

/** The file is changed somewhere else, and the window is focused again. */
async function changeFile(page: Page, content: string | number[]) {
  await putFile(page, NAME, content);
  await focusWindow(page);
}

function focusWindow(page: Page) {
  return page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeAttached();
}

/** Opens `The Call.fountain` with the stand-in picker, so the script is bound to the private file. */
async function openTheCall(page: Page) {
  await putFile(page, NAME, V1);
  await nextFileName(page, NAME);
  await openButton(page).click();
  await menu(page).getByRole('button', { name: 'Open a file…' }).click();
  await expect(editor(page)).toContainText('A phone rings.');
  await expect(status(page)).toContainText('Saved just now');
  await expect(menu(page)).toBeHidden();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/** The page's file permission, which the stand-in file system can't say: kept in `sessionStorage`, so a reload keeps it. */
async function stubPermission(page: Page) {
  await page.addInitScript(() => {
    const proto = FileSystemFileHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => sessionStorage.getItem('permission') ?? 'granted';
    proto.requestPermission = async () => {
      sessionStorage.setItem('asked', String(Number(sessionStorage.getItem('asked') ?? 0) + 1));
      sessionStorage.setItem('permission', 'granted');
      return 'granted';
    };
  });
}

function setPermission(page: Page, state: 'granted' | 'prompt') {
  return page.evaluate((s) => sessionStorage.setItem('permission', s), state);
}

const timesAsked = (page: Page) =>
  page.evaluate(() => Number(sessionStorage.getItem('asked') ?? 0));

function removeFile(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(n);
  }, name);
}

test.describe('a file changed somewhere else (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('loads the file when only the file changed', async ({ page }) => {
    await start(page);
    await openTheCall(page);

    await changeFile(page, V2);
    await expect(editor(page)).toContainText('Nobody answers.');
    // The toast, which is also a live region.
    const notice = bar(page).getByRole('status').filter({ hasText: 'Updated from' });
    await expect(notice).toHaveText('Updated from The Call.fountain.');
    // The file is now what was saved, so nothing is unsaved.
    await expect(status(page)).toContainText('Saved just now');
    await expect.poll(async () => (await byTitle(page, 'The Call'))?.source).toBe(V2);

    // It was one change: undo brings the previous text back.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('Nobody answers.');
    await expect(editor(page)).toContainText('A phone rings.');
    await expect(status(page)).toContainText('Unsaved changes');
    // The file itself was not touched by any of it.
    expect(await textOf(page, NAME)).toBe(V2);
  });

  test('takes a snapshot before reloading a changed file', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    // Text the browser has that no snapshot holds yet, when the file is opened over it.
    await typeAtEnd(page, 'Mine.');
    await changeFile(page, V2);
    await dialog(page).getByRole('button', { name: 'Open the file' }).click();
    await expect(editor(page)).toContainText('Nobody answers.');
    await expect(editor(page)).not.toContainText('Mine.');
    // The reload itself was saved after it, so the snapshot is the second row.
    await expectNewestThenCompare(page, 'Before reloading the file', 1);
  });

  test('keeps the loaded file an undo step of its own, apart from typing just after it', async ({
    page,
  }) => {
    await start(page);
    await openTheCall(page);

    await changeFile(page, V2);
    // A key typed the moment the file's text arrives: typing that close is joined to the change
    // before it unless that change stands alone.
    await page.evaluate(`(async () => {
      const tile = document.querySelector('.cm-content').cmTile;
      const view = (tile.root && tile.root.view) || tile.view;
      while (!view.state.doc.toString().includes('Nobody answers.')) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      view.dispatch({ changes: { from: 0, insert: 'Z' }, userEvent: 'input.type' });
    })()`);
    const shown = () =>
      page.evaluate(() => {
        const tile = (document.querySelector('.cm-content') as unknown as { cmTile: EditorTile })
          .cmTile;
        return (tile.root?.view ?? tile.view)?.state.doc.toString();
      });
    expect(await shown()).toBe(`Z${V2}`);

    // One undo takes back the typing only; the next, the file's text.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(shown).toBe(V2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(shown).toBe(V1);
  });

  test('keeps working on the browser version when only it changed', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'More.');
    await focusWindow(page);
    // Nothing is asked and nothing is replaced.
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toContainText('More.');
    await expect(bar(page)).not.toContainText('Updated');
  });

  test('keeps both versions when the file and the browser both changed: open the file', async ({
    page,
  }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    await expect(status(page)).toContainText('Unsaved changes');
    await changeFile(page, V2);

    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Open the file' }).click();
    await expect(dialog(page)).toBeHidden();

    await expect(editor(page)).toContainText('Nobody answers.');
    await expect(editor(page)).not.toContainText('Mine.');
    // This browser's text is its own script, named for what it is.
    await expect
      .poll(async () => (await byTitle(page, "The Call (this browser's copy)"))?.source)
      .toContain('Mine.');
    // The file is as the other computer left it.
    expect(await textOf(page, NAME)).toBe(V2);

    // And the copy is in the list of scripts.
    await openButton(page).click();
    await expect(
      menu(page).getByRole('button', { name: /The Call \(this browser's copy\)/ }),
    ).toBeVisible();
  });

  test('keeps both versions when the file and the browser both changed: keep this one', async ({
    page,
  }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    await changeFile(page, V2);

    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: "Keep this browser's version" }).click();
    await expect(dialog(page)).toBeHidden();

    await expect(editor(page)).toContainText('Mine.');
    await expect
      .poll(async () => (await byTitle(page, 'The Call (from the file)'))?.source)
      .toBe(V2.replace('Title: The Call\n', 'Title: The Call (from the file)\n'));
    expect(await textOf(page, NAME)).toBe(V2);
    // Nothing more is asked, and Save now writes this browser's text over the file whose own
    // version is kept.
    await focusWindow(page);
    await expect(dialog(page)).toBeHidden();
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    expect(await textOf(page, NAME)).toContain('Mine.');
    expect(await textOf(page, NAME)).not.toContain('Nobody answers.');
  });

  test("doesn't check while typing", async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    // The file changes, and no window event says so.
    await putFile(page, NAME, V2);
    await page.keyboard.insertText(' And more.');
    // The recovery copy is written (it reassigns the script's record), and still nothing is asked.
    await expect.poll(async () => (await byTitle(page, 'The Call'))?.source).toContain('And more.');
    await page.waitForTimeout(600);
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
    // The next time the window is focused, it is.
    await focusWindow(page);
    await expect(dialog(page)).toBeVisible();
  });

  test('asks again when the text changed while the question was open', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    await changeFile(page, V2);
    await expect(dialog(page)).toBeVisible();
    // A keystroke that was already on its way when the dialog opened.
    await page.evaluate(`(${INSERT_AT_END})(' Late.')`);
    await dialog(page).getByRole('button', { name: 'Open the file' }).click();
    // Nothing was replaced; the question comes back, about the text as it is now.
    await expect(dialog(page)).toBeVisible();
    await expect(editor(page)).toContainText('Late.');
    expect((await mine(page)).length).toBe(1);
    await dialog(page).getByRole('button', { name: 'Open the file' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toContainText('Nobody answers.');
    await expect
      .poll(async () => (await byTitle(page, "The Call (this browser's copy)"))?.source)
      .toContain('Mine. Late.');
  });

  test("keeps the file's line breaks in the copies", async ({ page }) => {
    await start(page);
    await putFile(page, NAME, V1.replaceAll('\n', '\r\n'));
    await nextFileName(page, NAME);
    await openButton(page).click();
    await menu(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect(editor(page)).toContainText('A phone rings.');
    await typeAtEnd(page, 'Mine.');
    await changeFile(page, V2.replaceAll('\n', '\r\n'));
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Open the file' }).click();
    await expect
      .poll(async () => (await byTitle(page, "The Call (this browser's copy)"))?.lineBreak)
      .toBe('\r\n');
  });

  test('says when it could not check the file because the text kept changing', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    // A keystroke lands while the check hashes the two texts, every time, so it can never settle.
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (...args: Parameters<typeof digest>) => {
        const tile = (document.querySelector('.cm-content') as unknown as { cmTile: EditorTile })
          .cmTile;
        const view = tile.root?.view ?? tile.view;
        view?.dispatch({ changes: { from: view.state.doc.length, insert: '.' } });
        return digest(...args);
      };
    });
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'kept changing' })).toBeVisible();
    await expect(dialog(page)).toBeHidden();
  });

  test('leaves everything as it is when the question is dismissed', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    await changeFile(page, V2);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(editor(page)).toContainText('Mine.');
    expect(await textOf(page, NAME)).toBe(V2);
    expect((await mine(page)).length).toBe(1);
  });

  test('stops a save that would overwrite a changed file', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await typeAtEnd(page, 'Mine.');
    await putFile(page, NAME, V2);
    await saveButton(page).click();

    await expect(dialog(page)).toBeVisible();
    // The file kept what the other computer wrote.
    expect(await textOf(page, NAME)).toBe(V2);
    await dialog(page).getByRole('button', { name: "Keep this browser's version" }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await textOf(page, NAME)).toBe(V2);

    // The writer saves again, knowing what is there.
    await saveButton(page).click();
    await expect.poll(() => textOf(page, NAME)).toContain('Mine.');
  });

  test('loads the file instead of saving over it when only the file changed', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await putFile(page, NAME, V2);
    await saveButton(page).click();
    await expect(editor(page)).toContainText('Nobody answers.');
    await expect(bar(page)).toContainText('Updated from The Call.fountain.');
    expect(await textOf(page, NAME)).toBe(V2);
  });

  test('offers Save As when the file is gone', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await removeFile(page, NAME);
    await focusWindow(page);

    await expect(bar(page)).toContainText(
      "Drafter can't find The Call.fountain. It may have been moved or deleted.",
    );
    // Typing still works, and nothing is lost.
    await typeAtEnd(page, 'Still here.');
    await expect(editor(page)).toContainText('Still here.');

    await nextFileName(page, 'Moved.fountain');
    await bar(page).getByRole('button', { name: 'Save As' }).click();
    await expect.poll(() => textOf(page, 'Moved.fountain')).toContain('Still here.');
    await expect(bar(page)).not.toContainText("can't find");
    await expect
      .poll(async () => (await byTitle(page, 'The Call'))?.fileName)
      .toBe('Moved.fountain');
  });

  test("lets the writer edit this browser's copy when the file is gone", async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await removeFile(page, NAME);
    await focusWindow(page);
    await expect(bar(page)).toContainText("Drafter can't find");

    await bar(page).getByRole('button', { name: "Edit this browser's copy" }).click();
    await expect(bar(page)).not.toContainText("can't find");
    await expect.poll(async () => (await byTitle(page, 'The Call'))?.fsHandleId).toBeUndefined();
    // The text is still there, and a focus checks nothing more.
    await expect(editor(page)).toContainText('A phone rings.');
    await focusWindow(page);
    await expect(bar(page)).not.toContainText("can't find");
  });

  test('says when the file is no longer text it can read', async ({ page }) => {
    await start(page);
    await openTheCall(page);
    await changeFile(page, [0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await expect(bar(page)).toContainText("Drafter can't read The Call.fountain as text");
    await expect(editor(page)).toContainText('A phone rings.');
    // Fixed at the other end, the bar goes.
    await changeFile(page, V2);
    await expect(editor(page)).toContainText('Nobody answers.');
    await expect(bar(page)).not.toContainText("can't read");
  });

  test('opens read-only until the file can be checked', async ({ page }) => {
    await stubPermission(page);
    await start(page);
    await openTheCall(page);

    await setPermission(page, 'prompt');
    await putFile(page, NAME, V2);
    await page.reload();
    await expect(bar(page)).toContainText('This script is saved in The Call.fountain.');
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    // The recovery copy is what is shown: the file was not read without permission.
    await expect(editor(page)).toContainText('A phone rings.');
    await expect(editor(page)).not.toContainText('Nobody answers.');

    await bar(page).getByRole('button', { name: 'Check for changes' }).click();
    // One click asks and checks.
    await expect(editor(page)).toContainText('Nobody answers.');
    await expect(bar(page)).not.toContainText('This script is saved in');
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    expect(await timesAsked(page)).toBe(1);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations with the bar and the dialog showing (${theme})`, async ({
      page,
    }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('nuxt-color-mode', t);
        } catch {
          // The page falls back to its default.
        }
      }, theme);
      await stubPermission(page);
      await start(page);
      await openTheCall(page);

      // The dialog.
      await typeAtEnd(page, 'Mine.');
      await changeFile(page, V2);
      await expect(dialog(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
      // The keyboard reaches both answers.
      await expect(dialog(page).getByRole('button', { name: 'Open the file' })).toBeVisible();
      const before = (await byTitle(page, 'The Call'))?.savedHash;
      await dialog(page).getByRole('button', { name: "Keep this browser's version" }).click();
      await expect(dialog(page)).toBeHidden();
      // The file's version is recorded as seen, which takes a moment, before the page goes.
      await expect.poll(async () => (await byTitle(page, 'The Call'))?.savedHash).not.toBe(before);

      // The "saved in" bar.
      await setPermission(page, 'prompt');
      await page.reload();
      await expect(bar(page)).toContainText('This script is saved in');
      expect(await violations(page)).toEqual([]);
      await bar(page).getByRole('button', { name: 'Check for changes' }).focus();
      await page.keyboard.press('Enter');
      await expect(bar(page)).not.toContainText('This script is saved in');

      // The "gone" bar.
      await removeFile(page, NAME);
      await focusWindow(page);
      await expect(bar(page)).toContainText("can't find");
      expect(await violations(page)).toEqual([]);
    });
  }
});
