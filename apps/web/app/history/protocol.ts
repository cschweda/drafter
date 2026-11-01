import type { DeletedScene, Place, VersionRow, WorkKind } from '@drafter/history';
import type { FoundCutAt } from '../cuts/store';
import type { StepCounts } from '../drafts/steps';

// What the page and the history worker say to each other (version-history design §3.4).

/**
 * A scan, numbered. `now` is the script's text now. A newer request of the same kind stops the
 * older at its next snapshot; a cancel stops the request whose number it carries.
 */
export type HistoryRequest =
  | { seq: number; kind: 'deleted'; projectId: string; now: string }
  | {
      seq: number;
      kind: 'versions';
      projectId: string;
      now: string;
      /** The scene: by its span in `now`, or by its place (`slot`, an index) in a snapshot. */
      scene: { from: number; to: number } | { snapshot: string; slot: number };
    }
  /**
   * Where the scene at index `slot` of snapshot `snapshot` goes back in `now` (Put back, design
   * §3.5): answered once, from what the worker has read. It runs beside the scans, stopping none.
   */
  | { seq: number; kind: 'place'; projectId: string; now: string; snapshot: string; slot: number }
  /**
   * What left `before` in `after` (drafts-and-cuts design §3.1): the cuts recorder's question at
   * each kept snapshot, answered once, beside the scans.
   */
  | { seq: number; kind: 'cuts'; before: string; after: string; docKind: WorkKind }
  /**
   * What changed in one step of Draft by draft (§2.4): `stepCounts` of two drafts' texts (or the
   * last and now), answered once, beside the scans.
   */
  | { seq: number; kind: 'step'; before: string; after: string; docKind: WorkKind }
  /**
   * The first-run backfill (§3.1, Call 18): the cuts between each two consecutive snapshots taken
   * before `since` (v0.24.0's first run), oldest first, skipping pairs whose later snapshot is at
   * or before `upTo` (done before the tab closed); then, if `end` is given, between the newest of
   * them and `end`. One pair's cuts per reply, so the page writes them as they come.
   */
  | {
      seq: number;
      kind: 'backfill';
      projectId: string;
      docKind: WorkKind;
      since: number;
      upTo: number | null;
      end: string | null;
    }
  | { seq: number; kind: 'cancel' };

/**
 * Replies carry their request's number. While a scan reads, each update is a progress reply and
 * then the list as it stands; the last list has `done`.
 */
export type HistoryReply =
  | {
      seq: number;
      kind: 'progress';
      /** Snapshots looked at so far, the unreadable ones included. */
      read: number;
      /** Snapshots this scan reads: at most `MAX_SNAPSHOTS`. */
      total: number;
      unreadable: number;
      /** The script has more snapshots than `MAX_SNAPSHOTS`, and the older ones aren't read. */
      capped: boolean;
    }
  | { seq: number; kind: 'deleted'; scenes: DeletedScene[]; done: boolean }
  /** `start`: the hash of the version followed (the scene now's, or the slot's); null when none. */
  | { seq: number; kind: 'versions'; rows: VersionRow[]; start: string | null; done: boolean }
  /** Where Put back puts the scene; null when the snapshot is gone or can't be read. */
  | { seq: number; kind: 'place'; place: Place | null }
  | { seq: number; kind: 'cuts'; cuts: FoundCutAt[] }
  | { seq: number; kind: 'step'; counts: StepCounts }
  /**
   * One pair of a backfill: its cuts, and `at`, when the later version of the pair was taken (the
   * cuts' date, and the progress to store). `read` of `total` pairs are done.
   */
  | {
      seq: number;
      kind: 'backfill';
      at: number;
      cuts: FoundCutAt[];
      read: number;
      total: number;
      done: boolean;
    }
  | { seq: number; kind: 'error'; message: string };

/** The newest snapshots a scan reads, at most (Call 10). */
export const MAX_SNAPSHOTS = 1000;
/** A scan's updates come at most this often, in milliseconds. */
export const STREAM_MS = 100;
