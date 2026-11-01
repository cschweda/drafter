import type { WorkKind } from '@drafter/history';
import { shallowRef } from 'vue';
import { listDrafts } from '../drafts/store';
import { useHistoryClient } from '../history/client';
import { db } from '../storage/db';
import { canDecompress, gunzip } from '../storage/gzip';
import { hashText } from '../storage/hash';
import { kindOf } from '../storage/projects';
import { type CutRecorder, createCutRecorder, type RecorderDeps } from './recorder';
import { cutsPointKey, type FoundCutAt, recordCuts } from './store';

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

/**
 * What a point is kept as: the hash of its text, found again in the snapshots (a kept snapshot's
 * text is one), or with the text itself when it is in no snapshot (a replacement, the backfill's).
 */
export interface StoredPoint {
  hash: string;
  text?: string;
}

const isPoint = (value: unknown): value is StoredPoint =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as StoredPoint).hash === 'string' &&
  /^[0-9a-f]{64}$/.test((value as StoredPoint).hash) &&
  ((value as StoredPoint).text === undefined || typeof (value as StoredPoint).text === 'string');

/** The stored point's text, or null when there is none or it can't be found. */
export async function storedPoint(projectId: string): Promise<string | null> {
  const value = (await db.settings.get(cutsPointKey(projectId)))?.value;
  if (!isPoint(value)) return null;
  if (value.text !== undefined && (await hashText(value.text)) === value.hash) return value.text;
  return textWithHash(projectId, value.hash);
}

/** Stores the point: its hash, and its text too unless a snapshot (`kept`) holds it. */
export async function storePoint(projectId: string, text: string, kept: boolean): Promise<void> {
  const value: StoredPoint = { hash: await hashText(text), ...(kept ? {} : { text }) };
  // Not for a script removed meanwhile: nothing of it is left behind.
  await db.transaction('rw', db.projects, db.settings, async () => {
    if (await db.projects.get(projectId))
      await db.settings.put({ key: cutsPointKey(projectId), value });
  });
}

/** The text with this hash, from a snapshot of the script that has it, or the script's own text. */
async function textWithHash(projectId: string, hash: string): Promise<string | null> {
  const row = await db.snapshots
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.hash === hash)
    .first();
  if (row) {
    try {
      if (row.gz) return canDecompress() ? await gunzip(row.gz) : null;
      if (typeof row.source === 'string') return row.source;
    } catch {
      // Unreadable: try the script's own text.
    }
  }
  const project = await db.projects.get(projectId);
  if (project && (await hashText(project.source)) === hash) return project.source;
  return null;
}

/** The recorder's storage, the draft being written, and the script's kind, from the database. */
export function storageDeps(): Omit<RecorderDeps, 'find'> {
  return {
    async kindOf(projectId) {
      const project = await db.projects.get(projectId);
      return project ? kindOf(project) : null;
    },
    async draftOf(projectId) {
      return ((await listDrafts(projectId))[0]?.n ?? 0) + 1;
    },
    async record(projectId, kind, cuts, draft, at) {
      await recordCuts(projectId, kind, cuts, draft, at);
    },
    readPoint: storedPoint,
    writePoint: storePoint,
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
