import type { WorkKind } from '@drafter/history';
import type { HistoryReply, HistoryRequest } from '../history/protocol';
import { db } from '../storage/db';
import { kindOf } from '../storage/projects';
import { cutsBackfillKey, type FoundCutAt, recordCuts } from './store';
import { storedPoint, storePoint } from './use-recorder';

// The first-run backfill (drafts-and-cuts design §3.1, Call 18): nothing cut before v0.24.0 is
// lost. Once per script, the history worker compares each two consecutive snapshots taken before
// v0.24.0's first run (`since`), oldest first, and the newest of them with the comparison point
// (the text the recorder carries on from), and every cut found is kept "cut before drafts" (no
// draft number), dated when the later of the two was taken. The page only writes what the worker
// finds, a pair at a time, each pair's cuts in one transaction with the progress, so a tab closed
// part way resumes after the last pair written, and a pair recorded twice is the same dates again.
// After that, the recorder (`recorder.ts`) records cuts as they happen.

/** When v0.24.0 first ran here: snapshots before it are the backfill's, after it the recorder's. */
export const CUTS_SINCE_KEY = 'cuts-since';

export type BackfillProgress = { done: true } | { upTo: number };

const isProgress = (value: unknown): value is BackfillProgress =>
  typeof value === 'object' &&
  value !== null &&
  ((value as { done?: unknown }).done === true ||
    typeof (value as { upTo?: unknown }).upTo === 'number');

export interface BackfillDeps {
  /** The scripts to backfill: every one of the writer's own (not the samples). */
  scripts(): Promise<{ id: string; kind: WorkKind }[]>;
  since(): Promise<number>;
  progress(projectId: string): Promise<BackfillProgress | null>;
  /**
   * The text the last pair ends at: the recorder's point, else the script's text (then made the
   * point); null when the script has no snapshot from before `since`, so nothing to carry on from.
   */
  end(projectId: string, since: number): Promise<string | null>;
  /** Runs the request in the history worker, calling `on` with each reply until the last. */
  run(
    request: Omit<Extract<HistoryRequest, { kind: 'backfill' }>, 'seq'>,
    on: (reply: HistoryReply) => void,
  ): void;
  /** Writes one pair's cuts with the progress, in one transaction. */
  write(
    projectId: string,
    kind: WorkKind,
    cuts: readonly FoundCutAt[],
    at: number,
    progress: BackfillProgress,
  ): Promise<void>;
  /** Cuts were written for the script. */
  recorded?(projectId: string): void;
}

/**
 * Backfills every script not done yet, one at a time; resolves when all are, or the first that
 * fails (the worker stopped) is left for the next visit. Never throws.
 */
export async function runBackfill(deps: BackfillDeps): Promise<void> {
  try {
    const since = await deps.since();
    for (const script of await deps.scripts()) {
      const progress = await deps.progress(script.id);
      if (progress && 'done' in progress) continue;
      if (!(await backfillOne(deps, script, since, progress?.upTo ?? null))) return;
    }
  } catch {
    // Left for the next visit.
  }
}

/** One script's backfill; true when it finished. */
async function backfillOne(
  deps: BackfillDeps,
  script: { id: string; kind: WorkKind },
  since: number,
  upTo: number | null,
): Promise<boolean> {
  const end = await deps.end(script.id, since);
  // Each pair's write waits for the one before, so progress is stored in order.
  let writes: Promise<unknown> = Promise.resolve();
  let failed = false;
  const finished = await new Promise<boolean>((resolve) => {
    deps.run(
      { kind: 'backfill', projectId: script.id, docKind: script.kind, since, upTo, end },
      (reply) => {
        if (reply.kind === 'error') {
          resolve(false);
          return;
        }
        if (reply.kind !== 'backfill') return;
        const progress: BackfillProgress = reply.done ? { done: true } : { upTo: reply.at };
        const { cuts, at, done } = reply;
        writes = writes.then(async () => {
          if (failed) return;
          try {
            await deps.write(script.id, script.kind, cuts, at, progress);
            if (cuts.length > 0) deps.recorded?.(script.id);
          } catch {
            failed = true;
          }
        });
        if (done) void writes.then(() => resolve(!failed));
      },
    );
  });
  await writes;
  return finished && !failed;
}

/** The backfill's storage: the `drafter` database. */
export function storageBackfill(): Omit<BackfillDeps, 'run' | 'recorded'> {
  return {
    async scripts() {
      const all = await db.projects.toArray();
      return all.filter((p) => !p.sample).map((p) => ({ id: p.id, kind: kindOf(p) }));
    },
    async since() {
      return db.transaction('rw', db.settings, async () => {
        const had = (await db.settings.get(CUTS_SINCE_KEY))?.value;
        if (typeof had === 'number') return had;
        const now = Date.now();
        await db.settings.put({ key: CUTS_SINCE_KEY, value: now });
        return now;
      });
    },
    async progress(projectId) {
      const value = (await db.settings.get(cutsBackfillKey(projectId)))?.value;
      return isProgress(value) ? value : null;
    },
    async end(projectId, since) {
      const old = await db.snapshots
        .where('projectId')
        .equals(projectId)
        .filter((row) => row.createdAt < since && !row.id.startsWith('saved:'))
        .first();
      if (!old) return null;
      const point = await storedPoint(projectId);
      if (point !== null) return point;
      const project = await db.projects.get(projectId);
      if (!project) return null;
      // The recorder carries on from the script's text as it is now.
      await storePoint(projectId, project.source, false);
      return project.source;
    },
    async write(projectId, kind, cuts, at, progress) {
      const row = { key: cutsBackfillKey(projectId), value: progress };
      if (cuts.length > 0) {
        await recordCuts(projectId, kind, cuts, null, at, row);
        return;
      }
      // No cuts in this pair: the progress alone, not for a script removed meanwhile.
      await db.transaction('rw', db.projects, db.settings, async () => {
        if (await db.projects.get(projectId)) await db.settings.put(row);
      });
    },
  };
}
