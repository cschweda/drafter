// A script's history (Phase 2 design §11.1, technical design §8.4): copies of the whole text in the
// `snapshots` table, beside the saved row (`saved:<projectId>`, `projects.ts`), which stays Phase 1's
// and is neither listed nor thinned here (Call 2). Nothing here throws into the editor or a save.
import { wordsIn } from '../markdown/words';
import { thin } from '../snapshots/retention';
import { db, type Snapshot } from './db';
import { canCompress, canDecompress, gunzip, gzip } from './gzip';
import { hashText } from './hash';

export type SnapshotReason =
  | 'timed'
  | 'saved'
  | 'opened'
  | 'imported'
  | 'manual'
  | 'before-expand'
  | 'before-fix-all'
  | 'before-revert'
  | 'before-restore'
  | 'before-reload'; // 'before-merge' arrives with Plan G

export interface SnapshotInfo {
  id: string;
  createdAt: number;
  reason: SnapshotReason;
  label?: string;
  detail?: string;
  words: number;
  readable: boolean;
}

export type TakeResult = 'taken' | 'same' | 'failed';

const SAVED_PREFIX = 'saved:';
const isHistory = (row: Snapshot) => !row.id.startsWith(SAVED_PREFIX);

/** The script's history snapshots, in no order. */
async function historyOf(projectId: string): Promise<Snapshot[]> {
  return (await db.snapshots.where('projectId').equals(projectId).toArray()).filter(isHistory);
}

function newestOf(rows: readonly Snapshot[]): Snapshot | undefined {
  let newest: Snapshot | undefined;
  for (const row of rows) {
    if (
      !newest ||
      row.createdAt > newest.createdAt ||
      (row.createdAt === newest.createdAt && row.id > newest.id)
    )
      newest = row;
  }
  return newest;
}

function isQuotaError(error: unknown): boolean {
  const named = (e: unknown) =>
    typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError';
  return named(error) || named((error as { inner?: unknown } | null)?.inner);
}

// One take per script at a time, so two at once can't both find the newest different.
const queues = new Map<string, Promise<unknown>>();

function queued<T>(projectId: string, run: () => Promise<T>): Promise<T> {
  const before = queues.get(projectId) ?? Promise.resolve();
  const next = before.then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(projectId, settled);
  void settled.then(() => {
    if (queues.get(projectId) === settled) queues.delete(projectId);
  });
  return next;
}

async function take(
  projectId: string,
  text: string,
  reason: SnapshotReason,
  extra: { label?: string; detail?: string },
): Promise<TakeResult> {
  const hash = await hashText(text);
  if (newestOf(await historyOf(projectId))?.hash === hash) return 'same';
  // Plain text where the browser can't compress (Call 10).
  const body: Pick<Snapshot, 'gz' | 'source'> = canCompress()
    ? { gz: await gzip(text) }
    : { source: text };
  const label = extra.label?.trim();
  // The check again and the write in one transaction, so a take from another tab can't come between,
  // and with the project read, so a script removed meanwhile gets no row back: there is nothing to keep.
  const write = (): Promise<TakeResult> =>
    db.transaction('rw', db.snapshots, db.projects, async () => {
      if (!(await db.projects.get(projectId))) return 'same';
      const newest = newestOf(await historyOf(projectId));
      if (newest?.hash === hash) return 'same';
      const now = Date.now();
      await db.snapshots.put({
        id: crypto.randomUUID(),
        projectId,
        // After the newest, so the newest is always the last taken, even when the clock stood still.
        createdAt: newest && newest.createdAt >= now ? newest.createdAt + 1 : now,
        ...body,
        reason,
        ...(label ? { label } : {}),
        ...(extra.detail ? { detail: extra.detail } : {}),
        hash,
        words: wordsIn(text),
      });
      return 'taken';
    });
  try {
    return await write();
  } catch (error) {
    // Storage full: thin and try once more (Call 24).
    if (!isQuotaError(error)) throw error;
    await thinSnapshots(projectId);
    return await write();
  }
}

/** Adds a history snapshot unless `text` hashes to the newest one's ('same', as for a script that is gone); one take per project at a time; never throws. Thins after a take. */
export async function takeSnapshot(
  projectId: string,
  text: string,
  reason: SnapshotReason,
  extra: { label?: string; detail?: string } = {},
): Promise<TakeResult> {
  try {
    return await queued(projectId, async () => {
      const result = await take(projectId, text, reason, extra);
      if (result === 'taken') await thinSnapshots(projectId).catch(() => undefined);
      return result;
    });
  } catch {
    return 'failed';
  }
}

function readable(row: Snapshot): boolean {
  if (row.gz) return canDecompress();
  return typeof row.source === 'string';
}

/** History rows only (never `saved:` rows), newest first; `readable` false when the row has neither `gz` nor `source`, or `gz` without DecompressionStream. */
export async function listSnapshots(projectId: string): Promise<SnapshotInfo[]> {
  const rows = await historyOf(projectId);
  rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    reason: row.reason ?? 'manual',
    ...(row.label ? { label: row.label } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    words: row.words ?? (typeof row.source === 'string' ? wordsIn(row.source) : 0),
    readable: readable(row),
  }));
}

/** The text, or null when it can't be read (gunzip fails). */
export async function snapshotText(id: string): Promise<string | null> {
  try {
    const row = await db.snapshots.get(id);
    if (!row) return null;
    if (row.gz) return await gunzip(row.gz);
    return typeof row.source === 'string' ? row.source : null;
  } catch {
    return null;
  }
}

/** '' or null takes the label off. The saved row's is not History's to change. */
export async function setSnapshotLabel(id: string, label: string | null): Promise<void> {
  if (id.startsWith(SAVED_PREFIX)) return;
  const text = label?.trim();
  // Dexie deletes a field updated to `undefined`.
  await db.snapshots.update(id, { label: text ? text : undefined });
}

/** Deletes a history snapshot; the saved row stays. */
export async function deleteSnapshot(id: string): Promise<void> {
  if (id.startsWith(SAVED_PREFIX)) return;
  await db.snapshots.delete(id);
}

/** Deletes what `thin` says, keeping the newest snapshot whose hash is the project's `savedHash`. */
export async function thinSnapshots(projectId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.snapshots, db.projects, async () => {
    const rows = await historyOf(projectId);
    const savedHash = (await db.projects.get(projectId))?.savedHash;
    const lastSave =
      savedHash === undefined ? undefined : newestOf(rows.filter((row) => row.hash === savedHash));
    const gone = thin(
      rows.map((row) => ({ id: row.id, createdAt: row.createdAt, labeled: !!row.label })),
      now,
      new Set(lastSave ? [lastSave.id] : []),
    );
    if (gone.length > 0) await db.snapshots.bulkDelete(gone);
  });
}
