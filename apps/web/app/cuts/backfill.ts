import type { WorkKind } from '@drafter/history';
import type { HistoryReply, HistoryRequest } from '../history/protocol';
import { db } from '../storage/db';
import { kindOf } from '../storage/projects';
import { cutsBackfillKey, type FoundCutAt, recordCuts } from './store';
import { firstPoint, storedPoint, storePoint } from './use-recorder';

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

/**
 * How far a script's backfill got: the later snapshot of the last pair written (`upTo`), and how
 * many runs failed (`tries`); or done (`gaveUp` after `MAX_TRIES` failures).
 */
export type BackfillProgress = { done: true; gaveUp?: true } | { upTo?: number; tries?: number };

/** A script whose backfill fails this many times is given up (a known limit, in DEFERRED). */
export const MAX_TRIES = 3;

const isProgress = (value: unknown): value is BackfillProgress => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { done?: unknown; upTo?: unknown; tries?: unknown };
  if (v.done === true) return true;
  return (
    (v.upTo === undefined || typeof v.upTo === 'number') &&
    (v.tries === undefined || (typeof v.tries === 'number' && Number.isInteger(v.tries)))
  );
};

export interface BackfillDeps {
  /** The scripts to backfill: every one of the writer's own (not the samples). */
  scripts(): Promise<{ id: string; kind: WorkKind }[]>;
  since(): Promise<number>;
  progress(projectId: string): Promise<BackfillProgress | null>;
  /**
   * The text the last pair ends at: the recorder's first point, else the script's text (then
   * made the point); null when the script has no snapshot from before `since`, so nothing to carry on from.
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
 * Backfills every script not done yet, one at a time. A script whose run fails (the worker
 * stopped, a write failed) keeps its progress where it was, counts a try, and the next script is
 * done; after `MAX_TRIES` failures it is given up. Never throws.
 */
export async function runBackfill(deps: BackfillDeps): Promise<void> {
  let since: number;
  let scripts: { id: string; kind: WorkKind }[];
  try {
    since = await deps.since();
    scripts = await deps.scripts();
  } catch {
    return; // Left for the next visit.
  }
  for (const script of scripts) {
    try {
      const progress = await deps.progress(script.id);
      if (progress && 'done' in progress) continue;
      const upTo = progress?.upTo ?? null;
      const tries = progress?.tries ?? 0;
      if (tries >= MAX_TRIES) {
        console.warn(
          `Drafter: gave up finding the cuts in the old snapshots of script ${script.id}.`,
        );
        await deps.write(script.id, script.kind, [], since, { done: true, gaveUp: true });
        continue;
      }
      if (await backfillOne(deps, script, since, upTo, tries)) continue;
      // Failed: one more try counted, the progress as it was.
      const now = await deps.progress(script.id);
      const at = now && !('done' in now) ? now.upTo : upTo;
      await deps.write(script.id, script.kind, [], since, {
        ...(at == null ? {} : { upTo: at }),
        tries: tries + 1,
      });
    } catch {
      // This script is left for the next visit; the others go on.
    }
  }
}

/** One script's backfill; true when it finished. */
async function backfillOne(
  deps: BackfillDeps,
  script: { id: string; kind: WorkKind },
  since: number,
  upTo: number | null,
  tries: number,
): Promise<boolean> {
  const end = await deps.end(script.id, since);
  // Each pair's write waits for the one before, so progress is stored in order; after a failed
  // write nothing more is written, so the progress never passes a pair that wasn't kept.
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
        const progress: BackfillProgress = reply.done
          ? { done: true }
          : { upTo: reply.at, ...(tries > 0 ? { tries } : {}) };
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
      // Where the recorder took over, not where it is now: a run resumed weeks later never
      // compares with today's text, so it never dates the recorder's cuts "before drafts".
      const first = (await firstPoint(projectId)) ?? (await storedPoint(projectId));
      if (first !== null) return first;
      const project = await db.projects.get(projectId);
      if (!project) return null;
      // The recorder carries on from the script's text as it is now.
      await storePoint(projectId, project.source);
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
