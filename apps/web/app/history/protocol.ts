import type { DeletedScene, VersionRow } from '@drafter/history';

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
  | { seq: number; kind: 'versions'; rows: VersionRow[]; done: boolean }
  | { seq: number; kind: 'error'; message: string };

/** The newest snapshots a scan reads, at most (Call 10). */
export const MAX_SNAPSHOTS = 1000;
/** A scan's updates come at most this often, in milliseconds. */
export const STREAM_MS = 100;
