import type { WorkKind } from '@drafter/history';
import type { SnapshotReason } from '../storage/snapshots';
import type { FoundCutAt } from './store';

// Recording cuts as they happen (drafts-and-cuts design §3.1, Calls 8 and 19). Cuts are found
// between kept snapshots, never between keystrokes: each time a snapshot is kept (every 10 minutes
// of writing, on save and open, on Take snapshot, before a bulk change), its text is compared with
// the comparison point, the text kept before it, and what left is recorded with the draft being
// written. So a burst of edits between two snapshots is one comparison, and text typed and taken
// out again between them is never a cut. The comparison runs in the history worker.
//
// A whole-text replacement makes no cuts: a snapshot of a text that arrived whole (`opened`,
// `imported`) only moves the point, and so does `replaced()`, called just after the text is
// replaced (Restore as a new draft, Restore from a snapshot, reload, Revert to Saved). The snapshot
// taken just before such a replacement (`before-restore`, `before-reload`, `before-revert`) is of
// the writer's own text, so it is compared as any other: what the writer cut before restoring is
// kept, and the replacement itself is not compared. One undo after a replacement brings the old
// text back; the first comparison after a replacement is made with whichever of the two texts (the
// point, or the text replaced) is nearer, so an undone restore doesn't flood Cuts either.

/** Snapshot reasons whose text arrived whole: they move the point and look for no cuts. */
export const WHOLE_TEXT: ReadonlySet<SnapshotReason> = new Set(['opened', 'imported']);

export interface RecorderDeps {
  /** What left `before` in `after` (the history worker). */
  find(before: string, after: string, kind: WorkKind): Promise<FoundCutAt[]>;
  /** The script's kind; null when it is gone. */
  kindOf(projectId: string): Promise<WorkKind | null>;
  /** The draft being written: the last frozen number + 1, or 1. */
  draftOf(projectId: string): Promise<number>;
  record(
    projectId: string,
    kind: WorkKind,
    cuts: readonly FoundCutAt[],
    draft: number,
    at: number,
  ): Promise<void>;
  /** The comparison point stored for the script (so a reload resumes), or null. */
  readPoint(projectId: string): Promise<string | null>;
  /** `kept`: a snapshot holds the text; else it is a replacement's, which none does. */
  writePoint(projectId: string, text: string, kept: boolean): Promise<void>;
  now(): number;
  /** Cuts were recorded for the script. */
  recorded?(projectId: string, count: number): void;
}

export interface CutRecorder {
  /** A snapshot of `text` was kept as `reason`: compares it with the point, then moves the point. */
  kept(projectId: string, text: string, reason: SnapshotReason): Promise<void>;
  /** The script's text was just replaced whole by `text`: the point moves there, with no cuts. */
  replaced(projectId: string, text: string): Promise<void>;
  /** Resolves once everything asked so far is done. */
  idle(): Promise<void>;
}

interface Point {
  /** The text kept last; null when none is known. */
  text: string | null;
  /** The text a replacement took away, until the next comparison. */
  prior: string | null;
}

/** How much text a list of cuts holds. */
const size = (cuts: readonly FoundCutAt[]) => cuts.reduce((n, c) => n + c.text.length, 0);

export function createCutRecorder(deps: RecorderDeps): CutRecorder {
  const points = new Map<string, Point>();
  /** One thing at a time, in the order asked: a replacement after a snapshot moves the point last. */
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (run: () => Promise<void>) => {
    const next = queue.then(run).catch(() => undefined);
    queue = next;
    return next;
  };

  async function pointOf(projectId: string): Promise<Point> {
    let point = points.get(projectId);
    if (!point) {
      let text: string | null = null;
      try {
        text = await deps.readPoint(projectId);
      } catch {
        text = null;
      }
      point = { text, prior: null };
      points.set(projectId, point);
    }
    return point;
  }

  async function compare(projectId: string, point: Point, text: string): Promise<boolean> {
    if (point.text === null || point.text === text) return true;
    const kind = await deps.kindOf(projectId);
    if (kind === null) return false;
    let cuts = await deps.find(point.text, text, kind);
    if (point.prior !== null && cuts.length > 0) {
      const other = point.prior === text ? [] : await deps.find(point.prior, text, kind);
      if (size(other) < size(cuts)) cuts = other;
    }
    if (cuts.length === 0) return true;
    await deps.record(projectId, kind, cuts, await deps.draftOf(projectId), deps.now());
    deps.recorded?.(projectId, cuts.length);
    return true;
  }

  async function move(projectId: string, point: Point, text: string, kept: boolean) {
    point.text = text;
    try {
      await deps.writePoint(projectId, text, kept);
    } catch {
      // The point in memory still moved; a reload without it compares nothing the first time.
    }
  }

  return {
    kept(projectId, text, reason) {
      return enqueue(async () => {
        const point = await pointOf(projectId);
        // A failed comparison (the worker, or storage full) leaves the point: the next snapshot
        // compares from it again, so nothing is lost.
        if (!WHOLE_TEXT.has(reason) && !(await compare(projectId, point, text).catch(() => false)))
          return;
        point.prior = null;
        await move(projectId, point, text, true);
      });
    },
    replaced(projectId, text) {
      return enqueue(async () => {
        const point = await pointOf(projectId);
        if (point.text !== text) point.prior = point.text;
        await move(projectId, point, text, false);
      });
    },
    idle: () => queue,
  };
}
