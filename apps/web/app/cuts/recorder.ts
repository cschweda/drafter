import type { WorkKind } from '@drafter/history';
import type { SnapshotReason } from '../storage/snapshots';
import type { FoundCutAt } from './store';

// Recording cuts as they happen (drafts-and-cuts design §3.1, Calls 8 and 19). Cuts are found
// between kept snapshots, never between keystrokes: each time a snapshot is kept (every 10 minutes
// of writing, on save and open, on Take snapshot, before a bulk change, before a draft starts), its
// text is compared with the comparison point, the text kept before it, and what left is recorded
// with the draft being written when the snapshot was taken. So a burst of edits between two
// snapshots is one comparison, and text typed and taken out again between them is never a cut.
// The comparison runs in the history worker.
//
// The point is stored with its own text (`writePoint`), so it never depends on a snapshot still
// being there (one deleted in History, one that failed to write), and it is read again at each
// comparison, so a tab handed the editing never compares with a point another tab moved past.
//
// A whole-text replacement makes no cuts: a snapshot of a text that arrived whole (`opened`,
// `imported`) only moves the point, and so does `replaced()`, called just after the text is
// replaced (Restore as a new draft, Restore from a snapshot, reload, Revert to Saved). The snapshot
// taken just before such a replacement (`before-restore`, `before-reload`, `before-revert`) is of
// the writer's own text, so it is compared as any other. An undo can bring the replaced text back
// at any time, also after a save: for the next few comparisons after a replacement, the text it
// replaced is compared too, and the smaller of the two results is kept.

/** Snapshot reasons whose text arrived whole: they move the point and look for no cuts. */
export const WHOLE_TEXT: ReadonlySet<SnapshotReason> = new Set(['opened', 'imported']);

/** How many comparisons after a replacement also try the text it replaced. */
export const PRIOR_COMPARISONS = 5;

export interface RecorderDeps {
  /** What left `before` in `after` (the history worker). */
  find(before: string, after: string, kind: WorkKind): Promise<FoundCutAt[]>;
  /** The script's kind; null when it is gone. */
  kindOf(projectId: string): Promise<WorkKind | null>;
  /**
   * The draft being written now, read when a snapshot is taken (before a draft starts and the
   * number moves on); null when it isn't known at once.
   */
  draftNow(projectId: string): number | null;
  /** The draft being written: the last frozen number + 1, or 1 (when `draftNow` didn't know). */
  draftOf(projectId: string): Promise<number>;
  record(
    projectId: string,
    kind: WorkKind,
    cuts: readonly FoundCutAt[],
    draft: number,
    at: number,
  ): Promise<void>;
  /** The comparison point stored for the script, or null. */
  readPoint(projectId: string): Promise<string | null>;
  /** Stores the point, with its text. */
  writePoint(projectId: string, text: string): Promise<void>;
  /** Takes the "put back" mark off the script's cuts that aren't in `text` any more (an undone Put back). */
  checkMarks?(projectId: string, text: string): Promise<void>;
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

/** How much text a list of cuts holds. */
const size = (cuts: readonly FoundCutAt[]) => cuts.reduce((n, c) => n + c.text.length, 0);

export function createCutRecorder(deps: RecorderDeps): CutRecorder {
  /** Per script, the text a replacement took away, and how many comparisons it is still tried. */
  const priors = new Map<string, { text: string; left: number }>();
  /** One thing at a time, in the order asked: a replacement after a snapshot moves the point last. */
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (run: () => Promise<void>) => {
    const next = queue.then(run).catch(() => undefined);
    queue = next;
    return next;
  };

  const readPoint = (projectId: string) => deps.readPoint(projectId).catch(() => null);

  /** Compares and records; false when it couldn't (the point then stays). */
  async function compare(
    projectId: string,
    point: string,
    text: string,
    draftThen: number | null,
    at: number,
  ): Promise<boolean> {
    const kind = await deps.kindOf(projectId);
    if (kind === null) return false;
    let cuts = await deps.find(point, text, kind);
    const prior = priors.get(projectId);
    if (prior && cuts.length > 0) {
      const other = prior.text === text ? [] : await deps.find(prior.text, text, kind);
      // Back to the text replaced (an undo): the comparison is with it, and the replacement is over.
      if (size(other) < size(cuts)) {
        cuts = other;
        priors.delete(projectId);
      }
    }
    if (prior && priors.get(projectId) === prior && --prior.left <= 0) priors.delete(projectId);
    if (cuts.length === 0) return true;
    const draft = draftThen ?? (await deps.draftOf(projectId));
    await deps.record(projectId, kind, cuts, draft, at);
    deps.recorded?.(projectId, cuts.length);
    return true;
  }

  async function move(projectId: string, text: string) {
    try {
      await deps.writePoint(projectId, text);
    } catch {
      // Not stored: the next comparison is with the point before, so nothing is lost.
    }
  }

  return {
    kept(projectId, text, reason) {
      // The draft and the moment are the snapshot's, not the comparison's (which waits its turn).
      const draftThen = deps.draftNow(projectId);
      const at = deps.now();
      return enqueue(async () => {
        if (!WHOLE_TEXT.has(reason)) {
          const point = await readPoint(projectId);
          if (point !== null && point !== text) {
            const done = await compare(projectId, point, text, draftThen, at).catch(() => false);
            // A failed comparison (the worker, or storage full) leaves the point: the next
            // snapshot compares from it again.
            if (!done) return;
          }
        } else {
          priors.delete(projectId);
        }
        await deps.checkMarks?.(projectId, text).catch(() => undefined);
        await move(projectId, text);
      });
    },
    replaced(projectId, text) {
      return enqueue(async () => {
        const point = await readPoint(projectId);
        if (point !== null && point !== text)
          priors.set(projectId, { text: point, left: PRIOR_COMPARISONS });
        await move(projectId, text);
      });
    },
    idle: () => queue,
  };
}
