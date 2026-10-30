import { expect, type Page, test } from '@playwright/test';
import { makeZip } from '../../../packages/archive/test/make-zip';
import { bytesOf, nextFileName, picks, putFile, removePickers, stubPickers } from './fs-stub';

// Highland and Fade In files (Imports and Markdown out): each is a zip, opened as a new Fountain
// script that is not the file's (Save asks for a .fountain, and the file is never written). The
// archives are made here by makeZip, with text of the tests' own.

const FERRY = 'Title: The Night Ferry\n\nINT. FERRY CABIN - NIGHT\n\nThe engine knocks twice.\n';
const HIGHLAND = Array.from(
  makeZip([
    { name: 'text.fountain', data: FERRY },
    { name: 'info.json', data: '{"type":"tests"}' },
  ]),
);

const para = (style: string, text: string) =>
  `<para><style basestyle="${style}"/><text>${text}</text></para>`;
const FADE_IN = Array.from(
  makeZip([
    {
      name: 'document.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <paragraphs>
    ${para('Scene Heading', 'INT. FERRY CABIN - NIGHT')}
    ${para('Action', 'The engine knocks twice.')}
    ${para('Cast List', 'ABEL, a deckhand')}
  </paragraphs>
</document>
`,
    },
  ]),
);

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scripts = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const status = (page: Page) => page.locator('[data-tour="status"]');
const alert = (page: Page) => status(page).getByRole('alert');
const toast = (page: Page) => page.locator('.toast [role="status"]');

interface Row {
  title: string;
  sample?: string;
  fileName?: string;
  fsHandleId?: string;
  savedHash?: string;
  importedFrom?: string;
}

function mine(page: Page): Promise<Row[]> {
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
            resolve((request.result as Row[]).filter((row) => !row.sample));
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
  await expect(editor(page)).toContainText('The Call');
}

/** The imported script, once it is stored. */
async function imported(page: Page, title: string): Promise<Row | undefined> {
  await expect.poll(async () => (await mine(page)).map((row) => row.title)).toContain(title);
  return (await mine(page)).find((row) => row.title === title);
}

/** Not the file's: no name, no handle, nothing saved, and named after the file it came from. */
async function expectNew(page: Page, title: string, from: string) {
  await expect(status(page)).toContainText('Not saved to a file yet');
  const row = await imported(page, title);
  expect(row?.fileName).toBeUndefined();
  expect(row?.fsHandleId).toBeUndefined();
  expect(row?.savedHash).toBeUndefined();
  expect(row?.importedFrom).toBe(from);
}

/** A file dropped on the window. */
async function drop(page: Page, name: string, bytes: number[]) {
  await page.evaluate(
    ({ n, b }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], n, { type: 'application/zip' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    },
    { n: name, b: bytes },
  );
}

test.describe('importing a Highland file (Chromium, with the picker)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('opens a Highland file from the picker as a new, unsaved script, and Save asks for a .fountain', async ({
    page,
  }) => {
    await start(page);
    await putFile(page, 'Ferry.highland', HIGHLAND);
    await nextFileName(page, 'Ferry.highland');
    await openButton(page).click();
    await scripts(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
    await expect(toast(page)).toHaveText('Imported “Ferry.highland”.');
    await expectNew(page, 'The Night Ferry', 'Ferry.highland');
    await expect(page).toHaveTitle(/The Night Ferry/);

    // Save asks where (the picker suggests a .fountain named after the title), never the .highland.
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect((await picks(page)).at(-1)).toBe('The Night Ferry.fountain');
    expect(await bytesOf(page, 'Ferry.highland')).toEqual(HIGHLAND);
    const saved = Buffer.from((await bytesOf(page, 'The Night Ferry.fountain')) ?? []).toString();
    expect(saved).toBe(FERRY);
    expect((await imported(page, 'The Night Ferry'))?.fileName).toBe('The Night Ferry.fountain');
  });
  test('opens a Fade In file from the picker as a new, unsaved script', async ({ page }) => {
    await start(page);
    await putFile(page, 'Cabin.fadein', FADE_IN);
    await nextFileName(page, 'Cabin.fadein');
    await openButton(page).click();
    await scripts(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
    await expect(toast(page)).toHaveText(
      'Imported “Cabin.fadein”. 1 item came in as a note; Problems lists it.',
    );
    await expectNew(page, 'Cabin', 'Cabin.fadein');
    expect(await bytesOf(page, 'Cabin.fadein')).toEqual(FADE_IN);
  });
});

test.describe('importing a Highland or Fade In file where there is no picker', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('opens a dropped Fade In file, and Problems lists what came in as a note', async ({
    page,
  }) => {
    await start(page);
    await drop(page, 'Cabin.fadein', FADE_IN);
    await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
    await expect(editor(page)).toContainText('ABEL, a deckhand [[osf: Cast List]]');
    await expect(toast(page)).toHaveText(
      'Imported “Cabin.fadein”. 1 item came in as a note; Problems lists it.',
    );
    await expectNew(page, 'Cabin', 'Cabin.fadein');
    await page
      .getByRole('tab', { name: /^Problems/ })
      .last()
      .click();
    const problems = page.getByRole('tabpanel', { name: /^Problems/ });
    await expect(
      problems.getByText('This came in from Fade In as “Cast List”', { exact: false }),
    ).toHaveCount(1);
  });

  test('opens a dropped Highland file as a new, unsaved script', async ({ page }) => {
    await start(page);
    await drop(page, 'Ferry.highland', HIGHLAND);
    await expect(editor(page)).toContainText('The engine knocks twice.');
    await expect(toast(page)).toHaveText('Imported “Ferry.highland”.');
    await expectNew(page, 'The Night Ferry', 'Ferry.highland');
  });

  test('opens one from the file input', async ({ page }) => {
    await start(page);
    await openButton(page).click();
    const chooser = page.waitForEvent('filechooser');
    await scripts(page).getByRole('button', { name: 'Open a file…' }).click();
    const input = await chooser;
    const accept = (await input.element().getAttribute('accept')) ?? '';
    expect(accept.split(',')).toEqual(expect.arrayContaining(['.highland', '.fadein']));
    await input.setFiles({
      name: 'Ferry.highland',
      mimeType: 'application/zip',
      buffer: Buffer.from(HIGHLAND),
    });
    await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
    await expect(toast(page)).toHaveText('Imported “Ferry.highland”.');
    await expectNew(page, 'The Night Ferry', 'Ferry.highland');
  });

  test('refuses a text file named .highland, says why, and opens nothing', async ({ page }) => {
    await start(page);
    const before = (await mine(page)).length;
    await drop(page, 'Notes.highland', Array.from(Buffer.from(FERRY)));
    await expect(alert(page)).toContainText(
      'This isn’t a Highland file Drafter can read: it isn’t a zip archive.',
    );
    await expect(editor(page)).toContainText('The Call');
    expect((await mine(page)).length).toBe(before);
  });

  test('refuses a Highland archive named .fadein', async ({ page }) => {
    await start(page);
    const before = (await mine(page)).length;
    await drop(page, 'Ferry.fadein', HIGHLAND);
    await expect(alert(page)).toContainText(
      'This isn’t a Fade In file Drafter can read: it holds no script.',
    );
    await expect(editor(page)).toContainText('The Call');
    expect((await mine(page)).length).toBe(before);
  });
});
