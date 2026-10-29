import { signed } from '../stats/history';
import type { SnapshotInfo, SnapshotReason } from '../storage/snapshots';

// What History says of a snapshot (Phase 2 design §11.1): why it was taken, and the change in words.

const REASONS: Record<SnapshotReason, string> = {
  saved: 'Saved',
  timed: 'Every 10 minutes',
  opened: 'Opened',
  imported: 'Imported from',
  manual: 'Taken by you',
  'before-expand': 'Before expand',
  'before-fix-all': 'Before Fix all',
  'before-revert': 'Before Revert to Saved',
  'before-restore': 'Before restoring a snapshot',
  'before-reload': 'Before reloading the file',
};

/** The writer's label, or why it was taken: "Saved", "Opened The Call.fountain", "Before expand". */
export function reasonLabel(info: Pick<SnapshotInfo, 'reason' | 'label' | 'detail'>): string {
  if (info.label) return info.label;
  const name = REASONS[info.reason] ?? REASONS.manual;
  if (info.reason === 'opened' || info.reason === 'imported') {
    return `${name} ${info.detail || 'a file'}`;
  }
  return name;
}

const words = (n: number) => (Math.abs(n) === 1 ? 'word' : 'words');

/**
 * The change in words against the next older snapshot (Call 11): "+120 words", "−3 words", "No
 * change in words"; the oldest (`older` null) shows its count, "1,204 words".
 */
export function wordsChange(count: number, older: number | null): string {
  if (older === null) {
    return count === 0 ? 'No words' : `${count.toLocaleString('en-US')} ${words(count)}`;
  }
  const change = count - older;
  return change === 0 ? 'No change in words' : `${signed(change)} ${words(change)}`;
}
