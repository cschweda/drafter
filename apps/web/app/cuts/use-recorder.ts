import { cutText, type WorkKind } from '@drafter/history';
import { shallowRef } from 'vue';
import { listDrafts } from '../drafts/store';
import { useHistoryClient } from '../history/client';
import { db } from '../storage/db';
import { canCompress, canDecompress, gunzip, gzip } from '../storage/gzip';
import { kindOf } from '../storage/projects';
import { type CutRecorder, createCutRecorder, type RecorderDeps } from './recorder';
import {
  type CutRow,
  cutKey,
  cutsFirstPointKey,
  cutsPointKey,
  type FoundCutAt,
  isPutBack,
  recordCuts,
} from './store';

// The app's cuts recorder (`recorder.ts`): the comparison runs in the history worker, the cuts and
// the point are kept in the `drafter` database, and the Cuts list hears when cuts were recorded.

/** Set after cuts are recorded: the script they were recorded for, and a count that only goes up. */
export const cutsRecorded = shallowRef<{ projectId: string; n: number } | null>(null);
let recordings = 0;

/** Says cuts were recorded for the script (the recorder, the backfill). */
export function sayRecorded(projectId: string): void {
  recordings++;
  cutsRecorded.value = { projectId, n: recordings };
}

/** A comparison point as stored: its own text, gzip-compressed as snapshots are (or plain). */
export interface StoredPoint {
  gz?: Uint8Array;
  source?: string;
}

async function pointValue(text: string): Promise<StoredPoint> {
  return canCompress() ? { gz: await gzip(text) } : { source: text };
}

/** A stored point's text, or null when there is none or it can't be read. */
async function pointText(value: unknown): Promise<string | null> {
  if (typeof value !== 'object' || value === null) return null;
  const { gz, source } = value as StoredPoint;
  try {
    if (gz instanceof Uint8Array) return canDecompress() ? await gunzip(gz) : null;
  } catch {
    return null;
  }
  return typeof source === 'string' ? source : null;
}

/** The recorder's point for the script, or null. */
export async function storedPoint(projectId: string): Promise<string | null> {
  return pointText((await db.settings.get(cutsPointKey(projectId)))?.value);
}

/**
 * The script's first point: where the recorder took over from the snapshots before v0.24.0, so a
 * backfill run later still ends there (and never dates the recorder's cuts "before drafts").
 */
export async function firstPoint(projectId: string): Promise<string | null> {
  return pointText((await db.settings.get(cutsFirstPointKey(projectId)))?.value);
}

/** Stores the point, with its text, and the first point too if there is none yet. */
export async function storePoint(projectId: string, text: string): Promise<void> {
  const value = await pointValue(text);
  // Not for a script removed meanwhile: nothing of it is left behind.
  await db.transaction('rw', db.projects, db.settings, async () => {
    if (!(await db.projects.get(projectId))) return;
    await db.settings.put({ key: cutsPointKey(projectId), value });
    if (!(await db.settings.get(cutsFirstPointKey(projectId))))
      await db.settings.put({ key: cutsFirstPointKey(projectId), value });
  });
}

/** Takes the mark off the script's cuts marked put back that `text` doesn't hold (an undone Put back). */
async function checkMarks(projectId: string, text: string): Promise<void> {
  const rows = (await db.cuts.where('projectId').equals(projectId).toArray()) as CutRow[];
  const marked = rows.filter(isPutBack);
  if (marked.length === 0) return;
  const now = cutText(text);
  for (const row of marked) {
    // Dexie deletes a field updated to `undefined`.
    if (!now.includes(row.text))
      await db.cuts.update(cutKey(projectId, row.id), { putBack: undefined });
  }
}

/** Where the app's draft being written comes from, set by `installCuts` (null until then). */
let draftNow: (projectId: string) => number | null = () => null;
export function setDraftNow(read: (projectId: string) => number | null): void {
  draftNow = read;
}

/** The recorder's storage, the draft being written, and the script's kind, from the database. */
export function storageDeps(): Omit<RecorderDeps, 'find'> {
  return {
    async kindOf(projectId) {
      const project = await db.projects.get(projectId);
      return project ? kindOf(project) : null;
    },
    draftNow: (projectId) => draftNow(projectId),
    async draftOf(projectId) {
      return ((await listDrafts(projectId))[0]?.n ?? 0) + 1;
    },
    async record(projectId, kind, cuts, draft, at) {
      await recordCuts(projectId, kind, cuts, draft, at);
    },
    readPoint: storedPoint,
    writePoint: storePoint,
    checkMarks,
    now: () => Date.now(),
    recorded: (projectId) => sayRecorded(projectId),
  };
}

/** Asks the history worker what left `before` in `after`, with a client of its own for the one question. */
export function workerFind(before: string, after: string, kind: WorkKind): Promise<FoundCutAt[]> {
  return new Promise((resolve, reject) => {
    const client = useHistoryClient();
    client.request({ kind: 'cuts', before, after, docKind: kind }, (reply) => {
      if (reply.kind === 'cuts') {
        client.release();
        resolve(reply.cuts);
      } else if (reply.kind === 'error') {
        client.release();
        reject(new Error(reply.message));
      }
    });
  });
}

let shared: CutRecorder | undefined;

/** The app's cuts recorder: made on first use, kept for the visit. */
export function useCutRecorder(): CutRecorder {
  shared ??= createCutRecorder({ ...storageDeps(), find: workerFind });
  return shared;
}
