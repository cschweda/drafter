import { expect, type Page } from '@playwright/test';
import { runCommand, showSource } from './modules';

// Shared by the specs that check a snapshot before a bulk operation (Phase 2 design §11.1): a
// script of the writer's own to work on, and History's newest row compared with the text now.

const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });

/** A new screenplay, which (unlike a sample) keeps snapshots, with the Source showing. */
export async function newScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
  await expect(page.locator('.cm-content')).toContainText('Title:');
}

/**
 * Opens History, checks that row `row` (0 is the newest) says `reason`, and compares it with now: Compare
 * opens and lists at least one change. Returns the number of snapshots History listed.
 */
export async function expectNewestThenCompare(
  page: Page,
  reason: string | RegExp,
  row = 0,
): Promise<number> {
  await runCommand(page, 'History…');
  await expect(history(page)).toBeVisible();
  await expect(options(page).nth(row)).toContainText(reason);
  const count = await options(page).count();
  await options(page).nth(row).focus();
  await page.keyboard.press('Enter');
  await expect(history(page)).toBeHidden();
  await expect(
    page.getByRole('tab', { name: 'Compare', exact: true, selected: true }),
  ).toBeVisible();
  await expect(page.locator('#panel-compare .changes .change').first()).toBeAttached();
  return count;
}

/** Opens History and returns the reasons it lists, newest first, then closes it. */
export async function listedReasons(page: Page): Promise<string[]> {
  await runCommand(page, 'History…');
  await expect(history(page)).toBeVisible();
  await expect(options(page).first()).toBeVisible();
  const rows = await options(page).allInnerTexts();
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
  return rows;
}

// A long history for the history worker's specs (e2e/history-scan.spec.ts): a script of invented
// words, and many snapshots of it written straight into the database, as the app keeps them.

const SYLLABLES = [
  'ka',
  'lo',
  'mire',
  'tun',
  'vesh',
  'ol',
  'brin',
  'dau',
  'sek',
  'pim',
  'ra',
  'zol',
];
const PLACES = ['GRANARY', 'TIDE MILL', 'ASH COURT', 'LANTERN DOCK', 'VELL HOUSE', 'COPPER STAIR'];
const TIMES = ['DAY', 'NIGHT', 'DAWN', 'DUSK'];
const NAMES = ['ODRIN', 'MAVETH', 'SULA', 'KERRIC'];

/** An invented word, the same for the same `n`. */
function word(n: number): string {
  let out = '';
  for (let k = n; ; k = Math.floor(k / SYLLABLES.length) - 1) {
    out += SYLLABLES[k % SYLLABLES.length];
    if (k < SYLLABLES.length) break;
  }
  return out;
}

/** `count` words of invented text from `seed`, as sentences. */
function sentences(seed: number, count: number): string {
  const words = Array.from({ length: count }, (_, i) => word((seed * 7919 + i * 104_729) % 5000));
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 9) {
    const s = words.slice(i, i + 9).join(' ');
    out.push(`${s.charAt(0).toUpperCase()}${s.slice(1)}.`);
  }
  return out.join(' ');
}

/** Scene `n` of the long script: a heading, action, and some speeches. */
function longScene(n: number): string {
  const heading = `${n % 3 ? 'INT' : 'EXT'}. ${PLACES[n % PLACES.length]} ${n + 1} - ${TIMES[n % TIMES.length]}`;
  const parts = [heading, sentences(n * 11, 30)];
  for (let s = 0; s < 4; s++) {
    parts.push(`${NAMES[(n + s) % NAMES.length]}\n${sentences(n * 11 + s + 1, 14)}`);
    if (s === 1) parts.push(sentences(n * 11 + 7, 20));
  }
  return parts.join('\n\n');
}

/** The scenes of a script of about 120 pages (150 scenes), each its own text. */
export const LONG_SCENES: readonly string[] = Array.from({ length: 150 }, (_, n) => longScene(n));

/** A script of `scenes`, with a title page. */
export const longScript = (scenes: readonly string[]) =>
  `Title: The Tide Mill\nAuthor: Drafter's tests\n\n${scenes.join('\n\n')}\n`;

/**
 * Writes `count` history snapshots of `LONG_SCENES` for `projectId`, newest first a minute apart and
 * all within the last day (so retention keeps them), each with a word added to one scene, so every
 * snapshot is a version of its own, gzip-compressed in the page as the app does it.
 */
export async function seedLongHistory(page: Page, projectId: string, count: number) {
  await page.evaluate(
    async ({ projectId, count, scenes }) => {
      const gzip = async (text: string) =>
        new Uint8Array(
          await new Response(
            new Blob([new TextEncoder().encode(text)])
              .stream()
              .pipeThrough(new CompressionStream('gzip')),
          ).arrayBuffer(),
        );
      const now = Date.now();
      const rows = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const edited = scenes.map((s, n) => (n === i % scenes.length ? `${s} Varo${i}.` : s));
          const text = `Title: The Tide Mill\nAuthor: Drafter's tests\n\n${edited.join('\n\n')}\n`;
          return {
            id: `seeded-${String(i).padStart(4, '0')}`,
            projectId,
            createdAt: now - (i + 1) * 60_000,
            gz: await gzip(text),
            reason: 'timed',
            hash: `seeded-${i}`,
            words: 0,
          };
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('snapshots', 'readwrite');
          for (const row of rows) tx.objectStore('snapshots').put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { projectId, count, scenes: LONG_SCENES as string[] },
  );
}
