import { createHash } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { listZip } from '../../../packages/archive/src/index';
import {
  type CutEntry,
  cutsFile,
  draftFile,
  readCutsFile,
  readDraftFile,
} from '../../../packages/history/src/index';
import {
  filesIn,
  folderPicks,
  nextFileName,
  nextFolder,
  putAt,
  putFile,
  removePickers,
  stubPickers,
  textAt,
} from './fs-stub';
import { palette, runCommand, setText, start, wholeText } from './modules';

// Drafts and cuts beside the work in the browser (drafts-and-cuts design §4.1, §4.2; plan Task 7):
// in Chromium, the script's folder is asked for once, the first time a draft needs writing, and
// must hold the script; then drafts and the cuts file are written beside it, a Save As writes the
// whole set again beside the new file, and what another computer left there is read into the
// lists. Declined, or in a browser with no folder picker, they stay in the browser, said so, with
// Export drafts and cuts. A draft file opened itself says what it is.

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const BOCA =
  'Title: Boca\n\nINT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.\n\nINT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it.\n';
const BOCA_CUT =
  'Title: Boca\n\nINT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.\n';
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const startDialog = (page: Page) => page.getByRole('dialog', { name: 'Start new draft' });
const offer = (page: Page) =>
  page.getByRole('dialog', { name: 'Keep drafts and cuts next to Boca.fountain?' });
const drafts = (page: Page) => page.locator('#panel-drafts');
const cuts = (page: Page) => page.locator('#panel-cuts');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });

/** A palette command, run again if Firefox lets an Enter go by (DEFERRED, as in drafts.spec). */
async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
}

/** `name` (holding `text`) opened with the stand-in picker. */
async function openPicked(page: Page, name: string, text: string) {
  await putFile(page, name, text);
  await nextFileName(page, name);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('button', { name: 'Open a file…' }).click();
  await expect.poll(() => wholeText(page)).toBe(text);
}

async function startDraft(page: Page, note = '') {
  await command(page, 'Start new draft…');
  await expect(startDialog(page)).toBeVisible();
  if (note) await page.keyboard.insertText(note);
  await page.keyboard.press('Enter');
  await expect(startDialog(page)).toBeHidden();
}

async function takeSnapshot(page: Page) {
  await command(page, 'Take snapshot…');
  await expect(history(page).getByRole('textbox', { name: 'Label' })).toBeFocused();
  await page.keyboard.press('Enter');
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

async function openDrafts(page: Page) {
  if (await drafts(page).isVisible()) return;
  await command(page, 'Drafts…');
  await expect(drafts(page)).toBeVisible();
}

async function openCuts(page: Page) {
  if (await cuts(page).isVisible()) return;
  await command(page, 'Cuts…');
  await expect(cuts(page)).toBeVisible();
}

/** Boca.fountain opened from the stand-in file system, its first draft started, the folder offered. */
async function bocaWithOffer(page: Page) {
  await stubPickers(page);
  await start(page);
  await openPicked(page, 'Boca.fountain', BOCA);
  await startDraft(page, 'first pass');
  await expect(offer(page)).toBeVisible();
}

test.describe('in Chromium, beside the script', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Chromium only');

  test('granting the script’s folder writes drafts and cuts beside it', async ({ page }) => {
    await bocaWithOffer(page);
    await expect(offer(page)).toContainText('Choose the folder that holds Boca.fountain.');
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect(offer(page)).toBeHidden();
    const path = 'Boca drafts/Boca – Draft 01.fountain';
    await expect.poll(() => textAt(page, path)).not.toBeNull();
    const read = readDraftFile((await textAt(page, path)) as string, 'fountain');
    expect(read.text).toBe(BOCA);
    expect(read.facts).toMatchObject({ draft: 1, id: sha(BOCA), note: 'first pass' });
    await openDrafts(page);
    await expect(drafts(page)).toContainText('Saved beside Boca.fountain.');
    // A cut: the cellar goes, and is kept at the next snapshot, in the cuts file too.
    await setText(page, BOCA_CUT);
    await takeSnapshot(page);
    await expect
      .poll(async () =>
        readCutsFile((await textAt(page, 'Boca.fountain.cuts.md')) ?? '').entries.map(
          (e) => e.title,
        ),
      )
      .toEqual(['INT. CELLAR - NIGHT']);
    // The next draft is written too, with no question.
    await startDraft(page);
    await expect
      .poll(() => filesIn(page, 'Boca drafts'))
      .toEqual(['Boca – Draft 01.fountain', 'Boca – Draft 02.fountain']);
    expect(await folderPicks(page)).toBe(1);
  });

  /** Makes every write to a file whose name matches `pattern` fail with `name` (a DOMException). */
  function failWritesTo(page: Page, pattern: string, name: string) {
    return page.evaluate(
      ([pattern, name]) => {
        const proto = FileSystemFileHandle.prototype as unknown as Record<string, unknown>;
        const w = window as unknown as { __realCreateWritable?: unknown };
        w.__realCreateWritable ??= proto.createWritable;
        const real = w.__realCreateWritable as (this: FileSystemFileHandle) => Promise<unknown>;
        proto.createWritable = function (this: FileSystemFileHandle) {
          if (new RegExp(pattern as string).test(this.name))
            return Promise.reject(new DOMException('No.', name as string));
          return real.call(this);
        };
      },
      [pattern, name],
    );
  }

  test('a full disk: the lists say so, once, and how to fix it, never “Saved beside”', async ({
    page,
  }) => {
    await bocaWithOffer(page);
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect.poll(() => filesIn(page, 'Boca drafts')).toEqual(['Boca – Draft 01.fountain']);
    await openDrafts(page);
    await expect(drafts(page)).toContainText('Saved beside Boca.fountain.');
    await failWritesTo(page, '\\.cuts\\.md$', 'QuotaExceededError');
    await setText(page, BOCA_CUT);
    await takeSnapshot(page);
    await openDrafts(page);
    await expect(drafts(page)).toContainText(
      'Couldn’t write beside Boca.fountain: the disk is full. Free some space.',
    );
    await expect(drafts(page)).not.toContainText('Saved beside');
    // Room again: Keep next to Boca.fountain… tries again now, and the line comes back.
    await page.evaluate(() => {
      const w = window as unknown as { __realCreateWritable: unknown };
      (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createWritable =
        w.__realCreateWritable;
    });
    await drafts(page).getByRole('button', { name: 'Keep next to Boca.fountain…' }).click();
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect(drafts(page)).toContainText('Saved beside Boca.fountain.');
    await expect
      .poll(async () =>
        readCutsFile((await textAt(page, 'Boca.fountain.cuts.md')) ?? '').entries.map(
          (e) => e.title,
        ),
      )
      .toEqual(['INT. CELLAR - NIGHT']);
  });

  test('a permission taken back: the lists say so, and how to allow it again', async ({ page }) => {
    await bocaWithOffer(page);
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect.poll(() => filesIn(page, 'Boca drafts')).toEqual(['Boca – Draft 01.fountain']);
    await failWritesTo(page, 'Draft 02', 'NotAllowedError');
    await startDraft(page);
    await openDrafts(page);
    await expect(drafts(page)).toContainText(
      'Couldn’t write beside Boca.fountain: Drafter isn’t allowed to write in its folder any more. Not written: Draft 02.',
    );
    await expect(drafts(page)).toContainText('Choose Keep next to Boca.fountain…');
    await expect(drafts(page)).not.toContainText('Saved beside');
  });

  test('picking a folder without the script asks again', async ({ page }) => {
    await bocaWithOffer(page);
    await nextFolder(page, 'Elsewhere');
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect(offer(page).getByRole('alert')).toHaveText(
      'That folder doesn’t hold “Boca.fountain”. Choose the folder it is in.',
    );
    expect(await filesIn(page, 'Elsewhere')).toEqual([]);
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect(offer(page)).toBeHidden();
    await expect.poll(() => filesIn(page, 'Boca drafts')).toEqual(['Boca – Draft 01.fountain']);
  });

  test('declining keeps them in the browser and says so', async ({ page }) => {
    await bocaWithOffer(page);
    await offer(page).getByRole('button', { name: 'Not now' }).click();
    await expect(offer(page)).toBeHidden();
    await openDrafts(page);
    await expect(drafts(page)).toContainText('In this browser only.');
    expect(await filesIn(page, 'Boca drafts')).toEqual([]);
    // Not asked again at the next draft; the list's button asks.
    await startDraft(page);
    await expect(offer(page)).toBeHidden();
    await drafts(page).getByRole('button', { name: 'Keep next to Boca.fountain…' }).click();
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect
      .poll(() => filesIn(page, 'Boca drafts'))
      .toEqual(['Boca – Draft 01.fountain', 'Boca – Draft 02.fountain']);
    await expect(drafts(page)).toContainText('Saved beside Boca.fountain.');
  });

  test('Save As writes the full set beside the new file and leaves the old', async ({ page }) => {
    await bocaWithOffer(page);
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect.poll(() => filesIn(page, 'Boca drafts')).toEqual(['Boca – Draft 01.fountain']);
    await nextFileName(page, 'Ferry.fountain');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect.poll(() => filesIn(page, 'Ferry drafts')).toEqual(['Ferry – Draft 01.fountain']);
    expect(await filesIn(page, 'Boca drafts')).toEqual(['Boca – Draft 01.fountain']);
    const read = readDraftFile(
      (await textAt(page, 'Ferry drafts/Ferry – Draft 01.fountain')) as string,
      'fountain',
    );
    expect(read.facts?.id).toBe(sha(BOCA));
  });

  test('Save As into another folder of the same name writes the drafts there too', async ({
    page,
  }) => {
    await stubPickers(page);
    await start(page);
    await putAt(page, 'one/Scripts/Boca.fountain', BOCA);
    await nextFileName(page, 'one/Scripts/Boca.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await menu(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect.poll(() => wholeText(page)).toBe(BOCA);
    await startDraft(page);
    await nextFolder(page, 'one/Scripts');
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect
      .poll(() => filesIn(page, 'one/Scripts/Boca drafts'))
      .toEqual(['Boca – Draft 01.fountain']);
    await nextFileName(page, 'two/Scripts/Boca.fountain');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect.poll(() => textAt(page, 'two/Scripts/Boca.fountain')).toBe(BOCA);
    // Another folder, though named the same: asked for again, and the drafts written there.
    await openDrafts(page);
    await drafts(page).getByRole('button', { name: 'Keep next to Boca.fountain…' }).click();
    await nextFolder(page, 'two/Scripts');
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect
      .poll(() => filesIn(page, 'two/Scripts/Boca drafts'))
      .toEqual(['Boca – Draft 01.fountain']);
    await expect(drafts(page)).toContainText('Saved beside Boca.fountain.');
  });

  test('another computer’s drafts and cuts beside the work are read into the lists', async ({
    page,
  }) => {
    await stubPickers(page);
    await start(page);
    // What a laptop left in the shared folder: two drafts and a cut.
    const first = 'Title: Boca\n\nINT. HALL - DAY\n\nAn early version.\n';
    await putFile(page, 'Boca.fountain', BOCA);
    await putAt(
      page,
      'Boca drafts/Boca – Draft 01.fountain',
      draftFile(
        first,
        { draft: 1, id: sha(first), frozen: '2026-10-01T09:00:00.000Z', note: 'on the laptop' },
        'fountain',
      ),
    );
    await putAt(
      page,
      'Boca drafts/Boca – Draft 02.fountain',
      draftFile(
        BOCA,
        { draft: 2, id: sha(BOCA), frozen: '2026-10-02T09:00:00.000Z', note: '' },
        'fountain',
      ),
    );
    const theirs: CutEntry = {
      id: sha('A speech the laptop cut, long enough to be kept as a cut.'),
      title: 'FROM THE LAPTOP',
      text: 'A speech the laptop cut, long enough to be kept as a cut.',
      kind: 'fountain',
      cuts: [{ at: '2026-10-02T10:00:00.000Z', draft: 3 }],
      where: { after: 'INT. HALL - DAY', before: null },
    };
    await putAt(page, 'Boca.fountain.cuts.md', cutsFile('Boca.fountain', [theirs]));
    await openPicked(page, 'Boca.fountain', BOCA);
    await openDrafts(page);
    await expect(drafts(page)).toContainText('In this browser only.');
    await drafts(page).getByRole('button', { name: 'Keep next to Boca.fountain…' }).click();
    await offer(page).getByRole('button', { name: 'Choose folder…' }).click();
    await expect(drafts(page).locator('[data-draft]')).toHaveCount(2);
    await expect(drafts(page).locator('[data-draft="1"]')).toContainText('on the laptop');
    await expect(drafts(page).locator('.item.now')).toContainText('Draft 03');
    await openCuts(page);
    await expect(cuts(page)).toContainText('FROM THE LAPTOP');
    // Reopening after the laptop added another cut: it arrives too.
    const later: CutEntry = {
      ...theirs,
      id: sha('Another speech cut later on the laptop, also long enough.'),
      title: 'LATER ON THE LAPTOP',
      text: 'Another speech cut later on the laptop, also long enough.',
      cuts: [{ at: '2026-10-03T10:00:00.000Z', draft: 3 }],
    };
    await putAt(page, 'Boca.fountain.cuts.md', cutsFile('Boca.fountain', [theirs, later]));
    await page.reload();
    await openCuts(page);
    await expect(cuts(page)).toContainText('LATER ON THE LAPTOP');
    await expect(cuts(page)).toContainText('FROM THE LAPTOP');
  });

  test('opening a draft file shows the note bar, and Open Boca instead goes to the work', async ({
    page,
  }) => {
    await stubPickers(page);
    await start(page);
    await openPicked(page, 'Boca.fountain', BOCA);
    const file = draftFile(
      BOCA_CUT,
      { draft: 3, id: sha(BOCA_CUT), frozen: '2026-10-01T09:00:00.000Z', note: 'n' },
      'fountain',
    );
    await putFile(page, 'Boca – Draft 03.fountain', file);
    await nextFileName(page, 'Boca – Draft 03.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await menu(page).getByRole('button', { name: 'Open a file…' }).click();
    const bar = page.getByRole('region', { name: 'Draft file' });
    await expect(bar).toContainText('This is Draft 03 of Boca.');
    // Its draft facts are out of the text.
    await expect.poll(() => wholeText(page)).toBe(BOCA_CUT);
    await bar.getByRole('button', { name: 'Open Boca instead' }).click();
    await expect.poll(() => wholeText(page)).toBe(BOCA);
    await expect(bar).toBeHidden();
  });

  test('a draft file opens read-only, and Open a copy to keep writing never writes over it', async ({
    page,
  }) => {
    await stubPickers(page);
    await start(page);
    const file = draftFile(
      BOCA_CUT,
      { draft: 3, id: sha(BOCA_CUT), frozen: '2026-10-01T09:00:00.000Z', note: 'n' },
      'fountain',
    );
    await putFile(page, 'Boca – Draft 03.fountain', file);
    await nextFileName(page, 'Boca – Draft 03.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await menu(page).getByRole('button', { name: 'Open a file…' }).click();
    const bar = page.getByRole('region', { name: 'Draft file' });
    await expect(bar).toContainText('This is Draft 03 of Boca. It is read-only, as it was frozen.');
    await expect.poll(() => wholeText(page)).toBe(BOCA_CUT);
    // Typing changes nothing.
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('MORE');
    await expect.poll(() => wholeText(page)).toBe(BOCA_CUT);
    await bar.getByRole('button', { name: 'Open a copy to keep writing' }).click();
    await expect(bar).toBeHidden();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nMORE\n');
    await expect.poll(() => wholeText(page)).toContain('MORE');
    await nextFileName(page, 'Boca copy.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => textAt(page, 'Boca copy.fountain')).toContain('MORE');
    // The draft file is as it was, facts and all.
    expect(await textAt(page, 'Boca – Draft 03.fountain')).toBe(file);
  });
});

test('Export drafts and cuts downloads a zip where nothing can be written beside the script', async ({
  page,
}) => {
  await removePickers(page);
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await menu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(menu(page)).toBeHidden();
  await setText(page, BOCA);
  await expect.poll(() => wholeText(page)).toBe(BOCA);
  await startDraft(page);
  await openDrafts(page);
  await expect(drafts(page)).toContainText('In this browser only.');
  await expect(drafts(page).getByRole('button', { name: /^Keep next to/ })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await drafts(page).getByRole('button', { name: 'Export drafts and cuts' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Boca drafts and cuts.zip');
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  const names = listZip(new Uint8Array(readFileSync(path))).map((e) => e.name);
  expect(names).toEqual(['Boca drafts/Boca – Draft 01.fountain', 'Boca.fountain.cuts.md']);
});
