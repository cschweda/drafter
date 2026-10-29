import { expect, type Locator, type Page, test } from '@playwright/test';
import { textOf as fileText, picks, stubPickers } from './fs-stub';
import { editor, runCommand, showSource, start } from './modules';

// History (Phase 2 design §11.1): the script's snapshots by day, with Take snapshot at the top;
// Restore (one undo, after a snapshot of now), Label…, Save as a file, and Delete; one listbox
// with keys on the focused row; read-only in a tab that only shows the script.

const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const list = (page: Page) => history(page).getByRole('listbox', { name: 'Snapshots' });
const options = (page: Page) => list(page).getByRole('option');
const said = (page: Page) => page.locator('#history-dialog .notice');
const announcer = (page: Page) => page.locator('.outline-announcer');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const takeButton = (page: Page) => history(page).getByRole('button', { name: 'Take snapshot' });
const statusButton = (page: Page) => page.getByRole('button', { name: /^History, / });
const rowMenu = (page: Page) => page.getByRole('menu');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const READ_ONLY = 'This script is open for editing in another tab.';

interface SnapshotRow {
  id: string;
  projectId: string;
  reason?: string;
  label?: string;
}

/** The history snapshots kept in this browser (never the `saved:` rows), without their text. */
function snapshotRows(page: Page): Promise<SnapshotRow[]> {
  return page.evaluate(
    () =>
      new Promise<SnapshotRow[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('snapshots').objectStore('snapshots').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(
              (all.result as Array<SnapshotRow & { gz?: unknown; source?: unknown }>)
                .filter((row) => !row.id.startsWith('saved:'))
                .map(({ gz: _gz, source: _source, ...rest }) => rest),
            );
          };
          all.onerror = () => resolve([]);
        };
      }),
  );
}

/** The id of the script open now (the one that isn't a sample). */
function scriptId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('projects').objectStore('projects').getAll();
          all.onsuccess = () => {
            db.close();
            const mine = (all.result as Array<{ id: string; sample?: string }>).find(
              (p) => !p.sample,
            );
            resolve(mine?.id ?? '');
          };
        };
      }),
  );
}

async function newScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
  await expect(editor(page)).toContainText('Title:');
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

const editorText = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content .cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n'),
  );

async function openHistory(page: Page) {
  await statusButton(page).click();
  await expect(history(page)).toBeVisible();
}

async function closeHistory(page: Page) {
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

/** Take snapshot from History, with `label`; History stays open. */
async function takeSnapshot(page: Page, label = '') {
  await runCommand(page, 'Take snapshot…');
  await expect(history(page)).toBeVisible();
  await expect(labelField(page)).toBeFocused();
  if (label) await page.keyboard.insertText(label);
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
}

async function focusFirstRow(page: Page): Promise<Locator> {
  const row = options(page).first();
  await row.focus();
  await expect(row).toBeFocused();
  return row;
}

test.describe('History', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the same on a phone');

  test('opens History from the app menu, the palette, and the status bar', async ({ page }) => {
    await start(page);
    await newScreenplay(page);

    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await menu.getByRole('menuitem', { name: 'History…' }).click();
    await expect(history(page)).toBeVisible();
    await expect(history(page)).toContainText('No snapshots yet.');
    await page.keyboard.press('Escape');
    await expect(history(page)).toBeHidden();

    await runCommand(page, 'History…');
    await expect(history(page)).toBeVisible();
    await closeHistory(page);

    // The save item is a button named for History and what it says.
    await expect(statusButton(page)).toHaveAccessibleName('History, Not saved to a file yet');
    await statusButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(history(page)).toBeVisible();
    await page.keyboard.press('Escape');
    // Focus goes back to the button that opened it.
    await expect(statusButton(page)).toBeFocused();
  });

  test('takes a labeled snapshot from History', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY\n\nShe waits.');
    await takeSnapshot(page, 'First pass');
    await expect(said(page)).toHaveText('Took a snapshot labeled “First pass”.');
    await expect(labelField(page)).toHaveValue('');
    await expect(list(page).getByRole('group', { name: 'Today' })).toBeVisible();
    await expect(options(page).first()).toHaveAccessibleName(/, First pass, \d[\d,]* words?$/);
    const rows = await snapshotRows(page);
    expect(rows.map((r) => [r.reason, r.label])).toEqual([['manual', 'First pass']]);

    // Nothing changed since: none is taken, and History says so.
    await takeButton(page).click();
    await expect(said(page)).toContainText('Nothing has changed since the snapshot from');
    await expect(options(page)).toHaveCount(1);
  });

  test('labels and unlabels a snapshot', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await takeSnapshot(page);
    await focusFirstRow(page);
    await page.keyboard.press('l');
    const dialog = page.getByRole('dialog', { name: /^Label the snapshot from / });
    await expect(dialog).toBeVisible();
    await page.keyboard.insertText('Draft for Sam');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(said(page)).toContainText('“Draft for Sam”.');
    await expect(options(page).first()).toHaveAccessibleName(/, Draft for Sam, /);
    await expect(options(page).first()).toBeFocused();

    // An empty label takes it off; the reason shows again.
    await page.keyboard.press('L');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Label' }).fill('');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(said(page)).toContainText('Took the label off the snapshot from');
    await expect(options(page).first()).toHaveAccessibleName(/, Taken by you, /);
    expect((await snapshotRows(page))[0]?.label).toBeUndefined();
  });

  test('deletes a snapshot after asking', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await takeSnapshot(page);
    await focusFirstRow(page);
    await page.keyboard.press('Delete');
    const ask = page.getByRole('dialog', { name: /^Delete the snapshot from .+\?$/ });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toBeFocused();

    await page.keyboard.press('Backspace');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Delete' }).click();
    await expect(said(page)).toContainText('Deleted the snapshot from');
    await expect(history(page)).toContainText('No snapshots yet.');
    expect(await snapshotRows(page)).toEqual([]);
  });

  for (const action of ['label', 'delete'] as const) {
    test(`says so when a snapshot can’t be changed (${action})`, async ({ page }) => {
      // Once `__breakSnapshots` is set, changing a snapshot's row fails as broken storage would.
      await page.addInitScript(() => {
        const broken = (store: IDBObjectStore) =>
          store.name === 'snapshots' && (window as { __breakSnapshots?: boolean }).__breakSnapshots;
        const { put, delete: remove } = IDBObjectStore.prototype;
        IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: [unknown]) {
          if (broken(this)) throw new DOMException('The storage broke.', 'UnknownError');
          return put.apply(this, args);
        };
        IDBObjectStore.prototype.delete = function (this: IDBObjectStore, ...args: [IDBValidKey]) {
          if (broken(this)) throw new DOMException('The storage broke.', 'UnknownError');
          return remove.apply(this, args);
        };
      });
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await start(page);
      await newScreenplay(page);
      await takeSnapshot(page);
      await focusFirstRow(page);
      await page.evaluate(() => {
        (window as { __breakSnapshots?: boolean }).__breakSnapshots = true;
      });
      if (action === 'label') {
        await page.keyboard.press('l');
        const dialog = page.getByRole('dialog', { name: /^Label the snapshot from / });
        await expect(dialog).toBeVisible();
        await page.keyboard.insertText('Draft for Sam');
        await page.keyboard.press('Enter');
        await expect(dialog).toBeHidden();
      } else {
        await page.keyboard.press('Delete');
        const ask = page.getByRole('dialog', { name: /^Delete the snapshot from .+\?$/ });
        await expect(ask).toBeVisible();
        await ask.getByRole('button', { name: 'Delete' }).click();
        await expect(ask).toBeHidden();
      }
      await expect(said(page)).toHaveText('Couldn’t change the snapshot.');
      // The list is read again: the snapshot is there, as it was.
      await expect(options(page)).toHaveCount(1);
      await expect(options(page).first()).toHaveAccessibleName(/, Taken by you, /);
      await expect(options(page).first()).toBeFocused();
      expect(errors).toEqual([]);
    });
  }

  test('restores a snapshot in one undo, after a snapshot of now', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nALPHA');
    await takeSnapshot(page);
    await closeHistory(page);
    await typeAtEnd(page, ' BETA');
    const now = await editorText(page);

    await openHistory(page);
    await focusFirstRow(page);
    await page.keyboard.press('r');
    await expect(history(page)).toBeHidden();
    await expect(editor(page)).not.toContainText('BETA');
    await expect(editor(page)).toContainText('ALPHA');
    await expect(announcer(page)).toHaveText(
      /^Restored the snapshot from .+\. Undo brings back what it replaced\.$/,
    );
    await expect(editor(page)).toBeFocused();
    // The text it replaced was kept first.
    await expect
      .poll(async () => (await snapshotRows(page)).map((r) => r.reason).sort())
      .toEqual(['before-restore', 'manual']);

    // One undo brings back what it replaced.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await editorText(page)).toBe(now);
  });

  test("offers only Delete for a snapshot that can't be read", async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    const id = await scriptId(page);
    await page.evaluate(
      (projectId) =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('drafter');
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').put({
              id: 'broken',
              projectId,
              createdAt: Date.now() - 60_000,
              reason: 'timed',
              hash: 'x',
              words: 3,
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
      id,
    );
    await openHistory(page);
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toHaveAccessibleName(/, Every 10 minutes, can’t be read$/);
    await expect(options(page).first()).toContainText('Can’t be read');
    await focusFirstRow(page);
    await page.keyboard.press('Shift+F10');
    await expect(rowMenu(page)).toBeVisible();
    await expect(rowMenu(page).getByRole('menuitem')).toHaveText(['Delete']);
    await page.keyboard.press('Escape');
    await expect(rowMenu(page)).toBeHidden();
    await expect(history(page)).toBeVisible();
    await options(page).first().focus();
    await page.keyboard.press('r');
    await expect(said(page)).toHaveText('This snapshot can’t be read. It can only be deleted.');
    await expect(history(page)).toBeVisible();
  });

  test('lists snapshots in a read-only tab, and offers no Restore, and says why', async ({
    page,
    context,
  }) => {
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nALPHA');
    await takeSnapshot(page, 'Kept');
    await closeHistory(page);

    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(READ_ONLY).first()).toBeVisible();
    const before = await editorText(second);
    await openHistory(second);
    await expect(options(second)).toHaveCount(1);
    await expect(options(second).first()).toHaveAccessibleName(/, Kept, /);
    await expect(history(second)).toContainText(READ_ONLY);
    await expect(takeButton(second)).toHaveAttribute('aria-disabled', 'true');

    await focusFirstRow(second);
    await second.keyboard.press('r');
    await expect(said(second)).toHaveText(READ_ONLY);
    await expect(history(second)).toBeVisible();
    expect(await editorText(second)).toBe(before);

    await second.keyboard.press('Shift+F10');
    await expect(rowMenu(second)).toBeVisible();
    for (const name of ['Restore', 'Label…', 'Delete']) {
      await expect(rowMenu(second).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    await expect(
      rowMenu(second).getByRole('menuitem', { name: 'Save as a file' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    await expect(rowMenu(second)).toContainText(READ_ONLY);
    await second.keyboard.press('Escape');
    expect(await snapshotRows(second)).toHaveLength(1);
  });
});

test.describe('History and files (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the same on a phone');

  test('saves a snapshot as a file', async ({ page }) => {
    await stubPickers(page);
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY');
    const kept = await editorText(page);
    await takeSnapshot(page);
    await closeHistory(page);
    await typeAtEnd(page, '\n\nLATER');

    await openHistory(page);
    await focusFirstRow(page);
    await page.keyboard.press('s');
    await expect(said(page)).toContainText('Saved the snapshot from');
    const [name] = await picks(page);
    expect(name).toMatch(/^.+ \(snapshot \d{4}-\d{2}-\d{2} \d{4}\)\.fountain$/);
    expect(await fileText(page, name as string)).toBe(kept);
    // It never becomes the script's file.
    await closeHistory(page);
    await expect(statusButton(page)).toHaveAccessibleName('History, Not saved to a file yet');
  });
});

test.describe('History on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'a phone');

  test('fills the screen on a phone', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await runCommand(page, 'History…');
    await expect(history(page)).toBeVisible();
    const box = await history(page).boundingBox();
    const size = page.viewportSize();
    expect(box && size).toBeTruthy();
    expect(Math.round(box?.x ?? -1)).toBe(0);
    expect(Math.round(box?.y ?? -1)).toBe(0);
    expect(Math.round(box?.width ?? 0)).toBe(size?.width);
    expect(Math.abs((box?.height ?? 0) - (size?.height ?? 0))).toBeLessThanOrEqual(1);
  });
});
