import { describe, expect, test } from 'vitest';
import { reasonLabel, wordsChange } from '../app/snapshots/labels';
import type { SnapshotReason } from '../app/storage/snapshots';

describe('snapshot labels', () => {
  test('names every reason', () => {
    const names: Record<SnapshotReason, string> = {
      saved: 'Saved',
      timed: 'Every 10 minutes',
      opened: 'Opened The Call.fountain',
      imported: 'Imported from The Call.fdx',
      manual: 'Taken by you',
      'before-expand': 'Before expand',
      'before-fix-all': 'Before Fix all',
      'before-revert': 'Before Revert to Saved',
      'before-restore': 'Before restoring a snapshot',
      'before-reload': 'Before reloading the file',
    };
    const detail: Partial<Record<SnapshotReason, string>> = {
      opened: 'The Call.fountain',
      imported: 'The Call.fdx',
    };
    for (const [reason, name] of Object.entries(names) as Array<[SnapshotReason, string]>) {
      const info = { reason, ...(detail[reason] ? { detail: detail[reason] } : {}) };
      expect(reasonLabel(info)).toBe(name);
    }
    // A file's name that wasn't kept.
    expect(reasonLabel({ reason: 'opened' })).toBe('Opened a file');
    expect(reasonLabel({ reason: 'imported' })).toBe('Imported from a file');
  });

  test('a label wins over the reason', () => {
    expect(reasonLabel({ reason: 'timed', label: 'Draft for Sam' })).toBe('Draft for Sam');
    expect(reasonLabel({ reason: 'opened', label: 'First pass', detail: 'a.fountain' })).toBe(
      'First pass',
    );
    // An empty label is none.
    expect(reasonLabel({ reason: 'saved', label: '' })).toBe('Saved');
  });

  test('words change with a sign, and the oldest shows its count', () => {
    expect(wordsChange(1324, 1204)).toBe('+120 words');
    expect(wordsChange(1201, 1204)).toBe('−3 words');
    expect(wordsChange(1205, 1204)).toBe('+1 word');
    expect(wordsChange(1203, 1204)).toBe('−1 word');
    expect(wordsChange(1204, 1204)).toBe('No change in words');
    expect(wordsChange(13204, 1204)).toBe('+12,000 words');
    expect(wordsChange(1204, null)).toBe('1,204 words');
    expect(wordsChange(1, null)).toBe('1 word');
    expect(wordsChange(0, null)).toBe('No words');
  });
});
