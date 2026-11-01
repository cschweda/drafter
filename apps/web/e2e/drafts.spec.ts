import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import {
  editor,
  palette,
  paletteInput,
  runCommand,
  setText,
  showSource,
  start,
  wholeText,
} from './modules';
import { drafterDatabaseV1, sampleSeenRows } from './seed';

// Drafts (drafts-and-cuts design §2): Start new draft keeps the text as Draft N, for good, and the
// writer carries on in Draft N+1; the Drafts list, newest first, with Read beside the Source,
// Compare, and Restore as a new draft (one undo); open a draft by its ID from the palette; drafts
// as milestones in History and its Compare with…; the status bar's quiet "Draft N", never in focus
// mode; a database from v0.23.1 upgraded with nothing lost; and axe in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const startDialog = (page: Page) => page.getByRole('dialog', { name: 'Start new draft' });
const list = (page: Page) => page.locator('#panel-drafts');
const reader = (page: Page) => page.locator('#panel-draft');
const draftItem = (page: Page, n: number) => list(page).locator(`[data-draft="${n}"]`);
const statusDraft = (page: Page) => page.locator('[data-tour="status"] [data-item="draft"]');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const short = (text: string) => sha(text).slice(0, 7);

const ONE = 'Title: Boca\n\nINT. FERRY - DAWN\n\nThe gulls follow the wake.\n';
const TWO =
  'Title: Boca\n\nINT. FERRY - DAWN\n\nThe gulls follow the wake, crying.\n\nEXT. PIER - DAY\n\nRopes.\n';

async function newScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** A screenplay of the writer's own holding `text`. */
async function scriptWith(page: Page, text: string) {
  await start(page);
  await newScreenplay(page);
  await setText(page, text);
  await expect.poll(() => wholeText(page)).toBe(text);
}

/** Start new draft…, with `note`, from the palette; the dialog closes. */
async function startDraft(page: Page, note = '') {
  await runCommand(page, 'Start new draft…');
  await expect(startDialog(page)).toBeVisible();
  const field = startDialog(page).getByRole('textbox', { name: /^Note for Draft/ });
  await expect(field).toBeFocused();
  if (note) await page.keyboard.insertText(note);
  await page.keyboard.press('Enter');
  await expect(startDialog(page)).toBeHidden();
}

/** Opens the Drafts list, unless it shows already (its command is Close Drafts then). */
async function openDrafts(page: Page) {
  if (await list(page).isVisible()) return;
  await runCommand(page, 'Drafts…');
  await expect(list(page)).toBeVisible();
}

test.describe('drafts', () => {
  test('Start new draft with a note shows Draft 1 in the list and Draft 2 in the status bar', async ({
    page,
    isMobile,
  }) => {
    await scriptWith(page, ONE);
    if (!isMobile) await expect(statusDraft(page)).toHaveText('Draft 1');
    await runCommand(page, 'Start new draft…');
    // The first time, it says what a draft is.
    await expect(startDialog(page)).toContainText(
      'A draft is a version you name: Drafter keeps it exactly as it is, for good.',
    );
    await expect(startDialog(page)).toContainText(
      'The text as it is now is kept as Draft 1, and you carry on writing in Draft 2.',
    );
    await page.keyboard.insertText('sent to Sam for notes');
    await page.keyboard.press('Enter');
    await expect(startDialog(page)).toBeHidden();
    if (!isMobile) {
      await expect(statusDraft(page)).toHaveText('Draft 2');
      await statusDraft(page).click();
    } else {
      await runCommand(page, 'Drafts…');
    }
    await expect(list(page)).toBeVisible();
    await expect(list(page).locator('.item.now')).toContainText('Draft 2');
    await expect(list(page).locator('.item.now')).toContainText(
      `Draft 2 begins — builds on Draft 1 (${short(ONE)})`,
    );
    await expect(draftItem(page, 1)).toContainText(short(ONE));
    await expect(draftItem(page, 1)).toContainText('sent to Sam for notes');
    // The text is untouched.
    expect(await wholeText(page)).toBe(ONE);
  });

  test('the same text asks before a new number', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await runCommand(page, 'Start new draft…');
    await expect(startDialog(page)).toContainText(
      'This text is the same as Draft 1. Start Draft 2 anyway?',
    );
    await expect(startDialog(page).getByRole('button', { name: 'Start anyway' })).toBeVisible();
    // Escape cancels, and nothing changes.
    await page.keyboard.press('Escape');
    await expect(startDialog(page)).toBeHidden();
    await openDrafts(page);
    await expect(list(page).locator('[data-draft]')).toHaveCount(1);
  });

  test('a work in progress opened from a file starts at Draft 1', async ({ page, isMobile }) => {
    await removePickers(page);
    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    await (await chooser).setFiles({
      name: 'Boca.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(TWO),
    });
    await showSource(page);
    await expect(editor(page)).toContainText('Ropes.');
    if (!isMobile) await expect(statusDraft(page)).toHaveText('Draft 1');
    await openDrafts(page);
    await expect(list(page).locator('.item.now')).toContainText('Draft 1');
    await expect(list(page)).toContainText('No drafts yet.');
    await startDraft(page, 'as it came');
    await expect(draftItem(page, 1)).toContainText(short(TWO));
    await expect(list(page).locator('.item.now')).toContainText('Draft 2');
  });

  test('the palette opens a draft by its short ID', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await setText(page, TWO);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText(sha(ONE).slice(0, 5));
    const option = palette(page).getByRole('option', {
      name: new RegExp(`^Draft 1 · ${short(ONE)} · `),
    });
    await expect(option).toBeVisible();
    await option.click();
    await expect(palette(page)).toBeHidden();
    await expect(reader(page)).toBeVisible();
    await expect(
      reader(page).getByRole('heading', { name: `Draft 1 · ${short(ONE)} · read-only` }),
    ).toBeVisible();
    await expect(reader(page).locator('[data-draft-text]')).toHaveText(ONE.replace(/\n$/, ''), {
      useInnerText: false,
    });
  });

  test('Read shows the draft read-only beside the Source and a line can be copied across', async ({
    page,
    isMobile,
  }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await setText(page, TWO);
    await openDrafts(page);
    await draftItem(page, 1).getByRole('button', { name: 'Read Draft 1' }).click();
    await expect(reader(page)).toBeVisible();
    const text = reader(page).getByRole('textbox', { name: 'Text of Draft 1, read-only' });
    await expect(text).toHaveAttribute('aria-readonly', 'true');
    await expect(text).toContainText('The gulls follow the wake.');
    // Beside the Source on a wide screen.
    if (!isMobile) await expect(editor(page)).toBeVisible();
    // A line is selected in the draft and typed into the script, as a copy and paste would.
    const line = await text.evaluate((pre) => {
      const node = pre.firstChild as Text;
      const at = node.data.indexOf('The gulls follow the wake.');
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 'The gulls follow the wake.'.length);
      const selection = window.getSelection() as Selection;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
    expect(line).toBe('The gulls follow the wake.');
    expect(await text.evaluate((pre) => getComputedStyle(pre).userSelect)).not.toBe('none');
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(`\n${line}\n`);
    await expect.poll(() => wholeText(page)).toContain(`\n${line}\n`);
    // The draft itself never changes; on a wide screen it is still there beside the Source.
    if (!isMobile) await expect(text).toHaveText(ONE.replace(/\n$/, ''));
  });

  test('Compare two drafts opens the Changes view', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await setText(page, TWO);
    await startDraft(page);
    await openDrafts(page);
    await draftItem(page, 2).getByRole('button', { name: 'More for Draft 2' }).click();
    await page.getByRole('menuitem', { name: 'Compare with another draft' }).click();
    await page.getByRole('menuitem', { name: new RegExp(`^Draft 1 · ${short(ONE)}`) }).click();
    const compare = page.locator('#panel-compare');
    await expect(compare).toBeVisible();
    await expect(compare).toContainText('Ropes.');
  });

  test('Compare with now from the list', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await setText(page, TWO);
    await openDrafts(page);
    await draftItem(page, 1).getByRole('button', { name: 'Compare Draft 1 with now' }).click();
    await expect(page.locator('#panel-compare')).toContainText('EXT. PIER - DAY');
  });

  test('History and Compare’s picker show drafts as milestones', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page, 'from Sam’s notes');
    await setText(page, TWO);
    await runCommand(page, 'Take snapshot…');
    await expect(history(page)).toBeVisible();
    await expect(history(page).getByRole('textbox', { name: 'Label' })).toBeFocused();
    await page.keyboard.press('Enter');
    const options = history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
    await expect(options.first()).toBeVisible();
    const milestones = history(page).getByRole('region', { name: 'Drafts' });
    const milestone = milestones.getByRole('button', {
      name: `Compare Draft 1 · ${short(ONE)} — from Sam’s notes with now`,
    });
    await expect(milestone).toBeVisible();
    // Compare with… on a snapshot offers the drafts too.
    await options.first().focus();
    await page.keyboard.press('c');
    const choice = history(page).getByRole('button', {
      name: `Draft 1 · ${short(ONE)} — from Sam’s notes`,
    });
    await expect(choice).toBeVisible();
    await choice.click();
    await expect(history(page)).toBeHidden();
    await expect(page.locator('#panel-compare')).toContainText('EXT. PIER - DAY');
  });

  test('Restore as a new draft, then undo', async ({ page, isMobile }) => {
    await scriptWith(page, ONE);
    await startDraft(page, 'first');
    await setText(page, TWO);
    await openDrafts(page);
    await draftItem(page, 1)
      .getByRole('button', { name: 'Restore Draft 1 as a new draft' })
      .click();
    await expect.poll(() => wholeText(page)).toBe(ONE);
    await openDrafts(page);
    await expect(draftItem(page, 2)).toContainText('before restoring Draft 1');
    await expect(list(page).locator('.item.now')).toContainText(
      `Draft 3 begins — from Draft 1 (${short(ONE)})`,
    );
    if (!isMobile) await expect(statusDraft(page)).toHaveText('Draft 3');
    // One undo brings back what it replaced.
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(TWO);
  });

  test('the status bar label is gone in Zen', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone has no status bar');
    await scriptWith(page, ONE);
    await expect(statusDraft(page)).toHaveText('Draft 1');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(statusDraft(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(statusDraft(page)).toHaveText('Draft 1');
  });

  test('Close takes the tabs away', async ({ page }) => {
    await scriptWith(page, ONE);
    await startDraft(page);
    await openDrafts(page);
    await draftItem(page, 1).getByRole('button', { name: 'Read Draft 1' }).click();
    await expect(reader(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close Draft 1' }).click();
    await expect(reader(page)).toHaveCount(0);
    await openDrafts(page);
    await page.getByRole('button', { name: 'Close Drafts' }).click();
    await expect(list(page)).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`Drafts list and Start new draft have no accessibility violations (${theme})`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await scriptWith(page, ONE);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await startDraft(page, 'sent to Sam');
      await setText(page, TWO);
      await openDrafts(page);
      await expect(draftItem(page, 1)).toBeVisible();
      const check = async () => {
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await check()).toEqual([]);
      await draftItem(page, 1).getByRole('button', { name: 'Read Draft 1' }).click();
      await expect(reader(page)).toBeVisible();
      expect(await check()).toEqual([]);
      await runCommand(page, 'Start new draft…');
      await expect(startDialog(page)).toBeVisible();
      expect(await check()).toEqual([]);
    });
  }
});

test.describe('a database from v0.23.1', () => {
  const PROJECT = {
    id: 'old-script',
    title: 'The Weir',
    kind: 'fountain',
    templateId: 'us-screenplay',
    source: 'Title: The Weir\n\nINT. MILL - NIGHT\n\nThe wheel turns.\n',
    lineBreak: '\n',
    meta: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_900_000_000_000,
  };
  const SNAPSHOT = {
    id: 'old-snapshot',
    projectId: 'old-script',
    createdAt: 1_700_000_100_000,
    source: 'Title: The Weir\n\nINT. MILL - NIGHT\n\nThe wheel stops.\n',
    reason: 'manual',
    label: 'Before the flood',
    words: 9,
  };
  const old = drafterDatabaseV1(sampleSeenRows);
  for (const store of old.stores) {
    if (store.name === 'projects') store.records.push({ value: PROJECT });
    if (store.name === 'snapshots') store.records.push({ value: SNAPSHOT });
  }
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}`,
          localStorage: [
            { name: 'drafter-tour-v1', value: 'true' },
            { name: 'drafter-storage-toast-v1', value: 'true' },
            { name: 'nuxt-color-mode', value: 'dark' },
          ],
          indexedDB: [old],
        },
      ],
    },
  });

  test('upgrades with its scripts and snapshots kept, and drafts work', async ({ page }) => {
    await start(page);
    await showSource(page);
    await expect(editor(page)).toContainText('The wheel turns.');
    const shape = await page.evaluate(
      () =>
        new Promise<{ version: number; stores: string[] }>((resolve) => {
          const open = indexedDB.open('drafter');
          open.onsuccess = () => {
            const db = open.result;
            resolve({ version: db.version, stores: [...db.objectStoreNames].sort() });
            db.close();
          };
        }),
    );
    expect(shape).toEqual({
      version: 20,
      stores: ['cuts', 'drafts', 'handles', 'projects', 'settings', 'snapshots', 'templates'],
    });
    await runCommand(page, 'History…');
    await expect(history(page).getByRole('option', { name: /Before the flood/ })).toBeVisible();
    await history(page).getByRole('button', { name: 'Close' }).click();
    await startDraft(page, 'after the upgrade');
    await openDrafts(page);
    await expect(draftItem(page, 1)).toContainText(short(PROJECT.source));
  });
});
