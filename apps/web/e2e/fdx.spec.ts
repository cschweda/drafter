import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { bytesOf, nextFileName, picks, putFile, removePickers, stubPickers } from './fs-stub';

// Final Draft files (Phase 2 Plan FD): a .fdx opens as a new Fountain script that is not the
// file's (Save asks for a .fountain, and the .fdx is never written), and a Fountain script exports
// as one. The files here are hand-made, with text of the tests' own.

const LAMP = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>EXT. LIGHTHOUSE - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>The lamp turns.</Text></Paragraph>
    <Paragraph Type="Character"><Text>THEO</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Keep it lit.</Text></Paragraph>
    <Paragraph Type="Cast List"><Text>THEO, a keeper</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Action"><Text>The Last Lamp</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`;

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scripts = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const status = (page: Page) => page.locator('[data-tour="status"]');
const alert = (page: Page) => status(page).getByRole('alert');
const toast = (page: Page) => page.locator('.toast [role="status"]');
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });
const exportMenu = (page: Page) => page.getByRole('group', { name: 'Export' });
const fdxItem = (page: Page) =>
  exportMenu(page).getByRole('button', { name: 'Final Draft (.fdx)' });

interface Row {
  title: string;
  source: string;
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
async function imported(page: Page): Promise<Row | undefined> {
  await expect
    .poll(async () => (await mine(page)).map((row) => row.title))
    .toContain('The Last Lamp');
  return (await mine(page)).find((row) => row.title === 'The Last Lamp');
}

async function expectImported(page: Page) {
  await expect(editor(page)).toContainText('EXT. LIGHTHOUSE - NIGHT');
  await expect(editor(page)).toContainText('Keep it lit.');
  await expect(editor(page)).toContainText('[[fdx: Cast List]]');
  await expect(toast(page)).toHaveText(
    'Imported “lamp.fdx”. 1 paragraph came in as a note marked [[fdx: …]].',
  );
  await expect(status(page)).toContainText('Not saved to a file yet');
  const row = await imported(page);
  expect(row?.fileName).toBeUndefined();
  expect(row?.fsHandleId).toBeUndefined();
  expect(row?.savedHash).toBeUndefined();
  expect(row?.importedFrom).toBe('lamp.fdx');
}

/** A file dropped on the window. */
async function drop(page: Page, name: string, text: string) {
  await page.evaluate(
    ({ n, t }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], n, { type: 'application/xml' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    },
    { n: name, t: text },
  );
}

test.describe('importing a Final Draft file (Chromium, with the picker)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the File System Access API');
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone');

  test.beforeEach(async ({ page }) => {
    await stubPickers(page);
  });

  test('opens it as a new, unsaved script, and Save asks for a .fountain', async ({ page }) => {
    await start(page);
    await putFile(page, 'lamp.fdx', LAMP);
    const original = await bytesOf(page, 'lamp.fdx');
    await nextFileName(page, 'lamp.fdx');
    await openButton(page).click();
    await scripts(page).getByRole('button', { name: 'Open a file…' }).click();
    await expectImported(page);
    await expect(page).toHaveTitle(/The Last Lamp/);

    // Save asks where (the picker suggests a .fountain named after the title), never the .fdx.
    await page.keyboard.press('ControlOrMeta+s');
    await expect(status(page)).toContainText('Saved just now');
    expect((await picks(page)).at(-1)).toBe('The Last Lamp.fountain');
    expect(await bytesOf(page, 'lamp.fdx')).toEqual(original);
    const saved = Buffer.from((await bytesOf(page, 'The Last Lamp.fountain')) ?? []).toString();
    expect(saved).toContain('EXT. LIGHTHOUSE - NIGHT');
    expect((await imported(page))?.fileName).toBe('The Last Lamp.fountain');
  });
});

test.describe('importing a Final Draft file where there is no picker', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('opens one from the file input', async ({ page }) => {
    await start(page);
    await openButton(page).click();
    const chooser = page.waitForEvent('filechooser');
    await scripts(page).getByRole('button', { name: 'Open a file…' }).click();
    const input = await chooser;
    expect(await input.element().getAttribute('accept')).toContain('.fdx');
    await input.setFiles({
      name: 'lamp.fdx',
      mimeType: 'application/xml',
      buffer: Buffer.from(LAMP),
    });
    await expectImported(page);
  });

  test('opens a dropped one', async ({ page }) => {
    await start(page);
    await drop(page, 'lamp.fdx', LAMP);
    await expectImported(page);
  });

  test('refuses a file that isn’t Final Draft XML, says why, and opens nothing', async ({
    page,
  }) => {
    await start(page);
    const before = (await mine(page)).length;
    await drop(page, 'broken.fdx', '<FinalDraft><Content></FinalDraft>');
    await expect(alert(page)).toContainText('This isn’t a Final Draft file:');
    await expect(editor(page)).toContainText('The Call');
    expect((await mine(page)).length).toBe(before);
  });
});

test.describe('exporting as Final Draft', () => {
  test.beforeEach(async ({ page }) => {
    await removePickers(page);
  });

  test('downloads a .fdx whose XML parses and holds the scene headings', async ({ page }) => {
    await start(page);
    await exportButton(page).click();
    const download = page.waitForEvent('download');
    await fdxItem(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Call.fdx');
    const xml = await readFile(await file.path(), 'utf8');
    await expect(toast(page)).toHaveText('Exported The Call.fdx.');
    // Parsed by the browser's own XML parser, not Drafter's.
    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      return {
        error: doc.getElementsByTagName('parsererror').length,
        root: doc.documentElement.nodeName,
        headings: Array.from(doc.querySelectorAll('Paragraph[Type="Scene Heading"]')).map(
          (p) => p.textContent?.trim() ?? '',
        ),
      };
    }, xml);
    expect(parsed.error).toBe(0);
    expect(parsed.root).toBe('FinalDraft');
    expect(parsed.headings.length).toBeGreaterThan(0);
    expect(parsed.headings.every((heading) => /^(INT|EXT)/.test(heading))).toBe(true);
  });

  test('is offered for a script, and not for a Markdown document', async ({ page, isMobile }) => {
    await start(page);
    await exportButton(page).click();
    await expect(fdxItem(page)).toBeVisible();
    await page.keyboard.press('Escape');

    const appMenu = page.getByRole('menu', { name: 'Drafter menu' });
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await expect(appMenu.getByRole('menuitem', { name: /^Export as Final Draft/ })).toBeVisible();
    await appMenu.getByRole('menuitem', { name: /^New Markdown document/ }).click();
    await expect(editor(page)).toContainText('# Untitled');

    await exportButton(page).click();
    await expect(exportMenu(page)).toBeVisible();
    await expect(fdxItem(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await expect(appMenu.getByRole('menuitem', { name: /^Export as plain text/ })).toBeVisible();
    await expect(appMenu.getByRole('menuitem', { name: /^Export as Final Draft/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    if (isMobile) return;
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('Final Draft');
    await expect(palette.getByRole('option', { name: /^Export as Final Draft/ })).toHaveCount(0);
  });
});
