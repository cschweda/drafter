import { expect, type Page, test } from '@playwright/test';
import { nextFileName, putFile, stubPickers, textOf } from './fs-stub';
import { editor, textOf as shownText, showSource, start } from './modules';

// Taking snapshots (Phase 2 design §11.1): every 10 minutes of active writing, on every save to a
// file, and on opening one; none for a sample; and a snapshot that can't be stored never stops a save.

const status = (page: Page) => page.locator('[data-tour="status"]');
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const PROBLEM =
  'Couldn’t keep a snapshot: this browser’s storage is full. Your script is safe, and saving still works.';

interface Project {
  id: string;
  title: string;
  source: string;
  sample?: string;
  savedHash?: string;
}
interface SnapshotRow {
  id: string;
  projectId: string;
  reason?: string;
  hash?: string;
  detail?: string;
}

/** Every row of a store, as kept in this browser (a snapshot's text left out). */
function rows<T>(page: Page, store: 'projects' | 'snapshots'): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(
              (all.result as Array<Record<string, unknown>>).map(({ gz, source, ...rest }) =>
                name === 'projects' ? { ...rest, source } : rest,
              ) as T[],
            );
          };
          all.onerror = () => resolve([]);
        };
      }),
    store,
  );
}

/** The history snapshots (never the `saved:` rows) of the script with `projectId`. */
const history = async (page: Page, projectId: string) =>
  (await rows<SnapshotRow>(page, 'snapshots')).filter(
    (row) => row.projectId === projectId && !row.id.startsWith('saved:'),
  );
const mine = async (page: Page) =>
  (await rows<Project>(page, 'projects')).find((p) => !p.sample) as Project;

async function newScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await menu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(menu(page)).toBeHidden();
  await showSource(page);
  await expect(editor(page)).toContainText('Title:');
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/** A key every 30 seconds for `minutes`, on the page's clock. */
async function writeFor(page: Page, minutes: number) {
  for (let step = 0; step < minutes * 2; step++) {
    await page.keyboard.insertText('x');
    await page.clock.runFor(30_000);
  }
}

test.describe('taking snapshots', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the same on a phone');

  test('takes a snapshot after 10 minutes of writing', async ({ page }) => {
    await page.clock.install();
    await start(page);
    await newScreenplay(page);
    const { id } = await mine(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY\n\n');
    await writeFor(page, 9);
    // Nine and a half minutes of writing: nothing yet.
    await page.clock.runFor(1000);
    expect(await history(page, id)).toEqual([]);
    await writeFor(page, 1.5);
    await expect
      .poll(async () => (await history(page, id)).map((s) => s.reason))
      .toEqual(['timed']);
    // Ten minutes of the clock with no writing is no second one.
    await page.clock.runFor(10 * 60_000);
    await page.keyboard.insertText('y');
    await page.clock.runFor(1000);
    expect(await history(page, id)).toHaveLength(1);
  });

  test('keeps no snapshots for a sample', async ({ page }) => {
    await page.clock.install();
    await start(page);
    await showSource(page);
    const sample = (await rows<Project>(page, 'projects')).find((p) => p.sample) as Project;
    expect(sample).toBeTruthy();
    await typeAtEnd(page, '\n\n');
    await writeFor(page, 12);
    await page.clock.runFor(1000);
    expect(await history(page, sample.id)).toEqual([]);
    expect(await rows<SnapshotRow>(page, 'snapshots')).toEqual([]);
  });
});

test.describe('snapshots and saving (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('takes a snapshot on save, and none when nothing changed', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY\n\nShe waits.');
    await nextFileName(page, 'Hall.fountain');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    const script = await mine(page);
    await expect.poll(async () => (await history(page, script.id)).length).toBe(1);
    const [saved] = await history(page, script.id);
    expect(saved?.reason).toBe('saved');
    // The snapshot of the save is of the text saved: retention keeps it by the script's savedHash.
    expect(saved?.hash).toBe(script.savedHash);

    // Saved again, unchanged: nothing new.
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await page.waitForTimeout(300);
    expect(await history(page, script.id)).toHaveLength(1);

    // Changed and saved: another, matching the new savedHash.
    await typeAtEnd(page, ' Then she leaves.');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    await expect.poll(async () => (await history(page, script.id)).length).toBe(2);
    const after = await mine(page);
    expect((await history(page, script.id)).map((s) => s.hash)).toContain(after.savedHash);
  });

  test('saving a sample makes a script whose first snapshot is the save, and the sample keeps none', async ({
    page,
  }) => {
    await start(page);
    await showSource(page);
    const sample = (await rows<Project>(page, 'projects')).find((p) => p.sample) as Project;
    await typeAtEnd(page, '\n\nMine now.');
    await nextFileName(page, 'Mine.fountain');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    const script = await mine(page);
    await expect
      .poll(async () => (await history(page, script.id)).map((s) => s.reason))
      .toEqual(['saved']);
    expect((await history(page, script.id))[0]?.hash).toBe(script.savedHash);
    expect(await history(page, sample.id)).toEqual([]);
  });

  test('opening a file takes an Opened snapshot of it', async ({ page }) => {
    await start(page);
    const text = 'Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n';
    await putFile(page, 'Door.fountain', text);
    await nextFileName(page, 'Door.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await menu(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect(editor(page)).toContainText('A door opens.');
    const script = await mine(page);
    await expect
      .poll(async () => await history(page, script.id))
      .toEqual([
        expect.objectContaining({
          reason: 'opened',
          detail: 'Door.fountain',
          hash: script.savedHash,
        }),
      ]);
  });

  test('saves while snapshots can’t be stored', async ({ page }) => {
    // Every history snapshot's write fails as a full disk would; the saved text's row still writes.
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const id = (value as { id?: unknown } | null)?.id;
        if (this.name === 'snapshots' && typeof id === 'string' && !id.startsWith('saved:')) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return key === undefined ? put.call(this, value) : put.call(this, value, key);
      };
    });
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY\n\nShe waits.');
    await nextFileName(page, 'Hall.fountain');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    expect(await textOf(page, 'Hall.fountain')).toMatch(/She waits\.$/);
    await expect(status(page).getByRole('alert')).toHaveText(PROBLEM);

    // Saved again with a change: the file has it, and the line is said once, not twice.
    await typeAtEnd(page, ' Then she leaves.');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect(await textOf(page, 'Hall.fountain')).toMatch(/Then she leaves\.$/);
    await expect(status(page).getByText(PROBLEM)).toHaveCount(1);
    expect(await history(page, (await mine(page)).id)).toEqual([]);
  });

  test('a saved file holds the script’s text and nothing about its snapshots', async ({ page }) => {
    await start(page);
    await newScreenplay(page);
    await typeAtEnd(page, '\n\nINT. HALL - DAY\n\nShe waits.');
    await nextFileName(page, 'Hall.fountain');
    await saveButton(page).click();
    await expect(status(page)).toContainText('Saved just now');
    await typeAtEnd(page, ' Then she leaves.');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    const script = await mine(page);
    await expect.poll(async () => (await history(page, script.id)).length).toBe(2);
    const file = await textOf(page, 'Hall.fountain');
    const shown = await shownText(page);
    expect(file).toBe(shown);
    expect(file).toBe(script.source);
    expect(file).not.toMatch(/snapshot/i);
  });
});
