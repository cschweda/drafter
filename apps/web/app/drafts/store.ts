// Drafts in the browser's storage (drafts-and-cuts design §2, §5): the writer's own milestones,
// numbered from 1 per script, only ever up, never reused, never thinned, and with no Delete. Each is
// the exact editor text, gzip-compressed as snapshots are, with its SHA-256 (`hashText`) as its ID.
// They go only with the script (`removeProject`).
import { wordsIn } from '../markdown/words';
import { db } from '../storage/db';
import { canCompress, canDecompress, gunzip, gzip } from '../storage/gzip';
import { hashText } from '../storage/hash';

/** Where a draft came from when it isn't simply the one before it: Restore as a new draft. */
export interface DraftFrom {
  n: number;
  id: string;
}

export interface DraftRow {
  /** `${projectId}:${n}`. */
  key: string;
  projectId: string;
  /** The draft's number: 1, 2, 3 … */
  n: number;
  /** `hashText` of the text: 64 lower-case hex. */
  id: string;
  frozenAt: number;
  /** One line, the writer's; may be empty. */
  note: string;
  words: number;
  from?: DraftFrom;
  /** The text, gzip-compressed. */
  gz?: Uint8Array;
  /** The text, where the browser can't compress. */
  source?: string;
  /** Where its file was written beside the work (Task 7), or undefined. */
  written?: string;
}

export type FreezeResult = { result: 'frozen'; row: DraftRow } | { result: 'failed'; why: string };

export const draftKey = (projectId: string, n: number): string => `${projectId}:${n}`;

/** The settings row holding where the draft being written came from (Restore as a new draft). */
export const draftFromKey = (projectId: string): string => `draft-from:${projectId}`;

/** The longest note kept. */
export const NOTE_MAX = 200;

/** A note as kept: one line, its spaces tidied, at most `NOTE_MAX` characters. */
export function cleanNote(note: string): string {
  return note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim();
}

export const FULL_WHY =
  'Couldn’t start the draft: this browser’s storage is full. Your script is unchanged.';
export const FAILED_WHY = 'Couldn’t start the draft in this browser. Your script is unchanged.';
export const GONE_WHY = 'Couldn’t start the draft: this script isn’t in this browser any more.';

function isQuotaError(error: unknown): boolean {
  const named = (e: unknown) =>
    typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError';
  return named(error) || named((error as { inner?: unknown } | null)?.inner);
}

const isFrom = (value: unknown): value is DraftFrom =>
  typeof value === 'object' &&
  value !== null &&
  Number.isInteger((value as DraftFrom).n) &&
  (value as DraftFrom).n >= 1 &&
  typeof (value as DraftFrom).id === 'string' &&
  /^[0-9a-f]{64}$/.test((value as DraftFrom).id);

/** Where the draft being written came from, or null when it builds on the one before. */
export async function draftFrom(projectId: string): Promise<DraftFrom | null> {
  const value = (await db.settings.get(draftFromKey(projectId)))?.value;
  return isFrom(value) ? { n: value.n, id: value.id } : null;
}

/** Sets (or, with null, clears) where the draft being written came from. */
export async function setDraftFrom(projectId: string, from: DraftFrom | null): Promise<void> {
  if (from === null) await db.settings.delete(draftFromKey(projectId));
  else await db.settings.put({ key: draftFromKey(projectId), value: { n: from.n, id: from.id } });
}

/** The project's drafts in number order. */
const draftsOf = (projectId: string) =>
  db.drafts.where('[projectId+n]').between([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);

/**
 * Freezes `text` as the script's next draft (the last number + 1, or 1). Where it came from is
 * `from`, else the one remembered by `setDraftFrom`, which this uses up. All in one transaction:
 * a failure (storage full) leaves no row, and says why; never throws.
 */
export async function freezeDraft(
  projectId: string,
  text: string,
  note: string,
  from?: DraftFrom,
): Promise<FreezeResult> {
  try {
    const id = await hashText(text);
    const body: Pick<DraftRow, 'gz' | 'source'> = canCompress()
      ? { gz: await gzip(text) }
      : { source: text };
    const words = wordsIn(text);
    const kept = cleanNote(note);
    const row = await db.transaction('rw', db.drafts, db.projects, db.settings, async () => {
      if (!(await db.projects.get(projectId))) return null;
      const last = await draftsOf(projectId).last();
      const n = (last?.n ?? 0) + 1;
      const came = from ?? (await draftFrom(projectId));
      const made: DraftRow = {
        key: draftKey(projectId, n),
        projectId,
        n,
        id,
        frozenAt: Date.now(),
        note: kept,
        words,
        ...(came ? { from: { n: came.n, id: came.id } } : {}),
        ...body,
      };
      // `add`, never `put`: a draft is never written over.
      await db.drafts.add(made);
      await db.settings.delete(draftFromKey(projectId));
      return made;
    });
    if (!row) return { result: 'failed', why: GONE_WHY };
    return { result: 'frozen', row: withoutText(row) };
  } catch (error) {
    return { result: 'failed', why: isQuotaError(error) ? FULL_WHY : FAILED_WHY };
  }
}

function withoutText(row: DraftRow): DraftRow {
  const { gz: _gz, source: _source, ...rest } = row;
  return rest;
}

/** The script's drafts, newest first, without their text. */
export async function listDrafts(projectId: string): Promise<DraftRow[]> {
  const rows = await draftsOf(projectId).toArray();
  return rows.reverse().map(withoutText);
}

/** This script's Draft `n`, without its text, or null. */
export async function draftRow(projectId: string, n: number): Promise<DraftRow | null> {
  const row = await db.drafts.get(draftKey(projectId, n));
  return row && row.projectId === projectId ? withoutText(row) : null;
}

/** Draft `n`'s text, or null when there is no such draft or it can't be read. */
export async function draftText(projectId: string, n: number): Promise<string | null> {
  try {
    const row = await db.drafts.get(draftKey(projectId, n));
    if (!row) return null;
    if (row.gz) return canDecompress() ? await gunzip(row.gz) : null;
    return typeof row.source === 'string' ? row.source : null;
  } catch {
    return null;
  }
}

/** Changes draft `n`'s note (one line; '' takes it off). A draft that isn't there is left alone. */
export async function setDraftNote(projectId: string, n: number, note: string): Promise<void> {
  await db.drafts.update(draftKey(projectId, n), { note: cleanNote(note) });
}

/** Whether `prefix` can find drafts by their ID: 4 to 64 hex characters, any case. */
export const isIdPrefix = (prefix: string): boolean => /^[0-9a-fA-F]{4,64}$/.test(prefix);

/** Every draft, of any script, whose ID begins with `prefix` (4+ hex characters); none for less. */
export async function draftsByPrefix(
  prefix: string,
): Promise<{ projectId: string; row: DraftRow }[]> {
  const typed = prefix.trim();
  if (!isIdPrefix(typed)) return [];
  const rows = await db.drafts.where('id').startsWith(typed.toLowerCase()).toArray();
  rows.sort((a, b) => b.frozenAt - a.frozenAt || (a.key < b.key ? -1 : 1));
  return rows.map((row) => ({ projectId: row.projectId, row: withoutText(row) }));
}
