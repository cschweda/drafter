import { snapshotTime } from '../snapshots/history';
import type { DraftFrom, DraftRow } from './store';

// What the drafts say (drafts-and-cuts design §2): the interface word is Draft; an ID shows as its
// first 7 characters; a draft's marker says what it builds on, so the major shifts stand out.

/** How many characters of an ID are shown (Call 3). */
export const SHORT_ID = 7;

export const shortId = (id: string): string => id.slice(0, SHORT_ID);

export const draftName = (n: number): string => `Draft ${n}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct 2026", in the writer's time zone. */
export function draftDay(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Oct 2026, 10:42". */
export const draftWhen = (at: number): string => `${draftDay(at)}, ${snapshotTime(at)}`;

/** "1 word", "12,034 words". */
export const wordsOf = (n: number): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'word' : 'words'}`;

/** "Draft 3 · a3f9c2e — from Sam’s notes": a draft as a milestone among the snapshots. */
export function milestoneLabel(row: Pick<DraftRow, 'n' | 'id' | 'note'>): string {
  const head = `${draftName(row.n)} · ${shortId(row.id)}`;
  return row.note ? `${head} — ${row.note}` : head;
}

/**
 * The marker that heads Draft `n` (§2.1): "Draft 2 begins — builds on Draft 1 (a3f9c2e)", or
 * "— from Draft 3 (…)" when it was restored from one. `rows` are the frozen drafts.
 */
export function markerLine(
  n: number,
  from: DraftFrom | undefined | null,
  rows: readonly Pick<DraftRow, 'n' | 'id'>[],
): string {
  if (from) return `${draftName(n)} begins — from ${draftName(from.n)} (${shortId(from.id)})`;
  const before = rows.find((row) => row.n === n - 1);
  if (!before) return `${draftName(n)} begins`;
  return `${draftName(n)} begins — builds on ${draftName(before.n)} (${shortId(before.id)})`;
}

/** The question before freezing a text that is the same as the last draft (Call 2). */
export const sameQuestion = (n: number): string =>
  `This text is the same as ${draftName(n)}. Start ${draftName(n + 1)} anyway?`;

/** The first Start new draft dialog's one line (§2.5). */
export const EXPLAINER =
  'A draft is a version you name: Drafter keeps it exactly as it is, for good.';

/** "Draft 2 · a3f9c2e · 12 Oct 2026", and the script's title when it isn't the one open. */
export function paletteLabel(row: Pick<DraftRow, 'n' | 'id' | 'frozenAt'>, title?: string): string {
  const label = `${draftName(row.n)} · ${shortId(row.id)} · ${draftDay(row.frozenAt)}`;
  return title ? `${label} · ${title}` : label;
}

/** The reader's header (§2.3): "Draft 2 · a3f9c2e · read-only". */
export const readerHeader = (row: Pick<DraftRow, 'n' | 'id'>): string =>
  `${draftName(row.n)} · ${shortId(row.id)} · read-only`;

/** What a version of a draft is called in Compare's slim bar. */
export const compareLabel = (row: Pick<DraftRow, 'n' | 'id'>): string =>
  `${draftName(row.n)} · ${shortId(row.id)}`;

/** What Start new draft says when it has frozen Draft `n`. */
export const startedLine = (n: number): string =>
  `${draftName(n)} is kept. You’re writing ${draftName(n + 1)} now.`;

/** What Restore as a new draft says when Draft `n`'s text is the current draft, `m`. */
export const restoredLine = (n: number, m: number): string =>
  `${draftName(n)}’s text is now ${draftName(m)}. Undo brings back what it replaced.`;

/** The note of the draft frozen before a restore (§2.3, Call 4). */
export const beforeRestoreNote = (n: number): string => `before restoring ${draftName(n)}`;

/** Where the drafts are kept, until files beside the work (Task 7). */
export const KEPT_HERE = 'Kept in this browser.';

export const NOT_KEPT_SAMPLE =
  'Drafts aren’t kept for a sample. Save it to a file, and it becomes a script of your own that keeps them.';
export const NO_SCRIPT = 'No script is open yet.';
export const DRAFT_GONE = 'That draft can’t be read, so nothing was changed.';
