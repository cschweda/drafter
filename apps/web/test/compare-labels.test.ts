import type { ChangeStop, GapMark } from '@drafter/compare';
import { describe, expect, test } from 'vitest';
import { gapName, stopLabel } from '../app/compare/labels';

const stop = (more: Partial<ChangeStop> = {}): ChangeStop => ({
  change: 0,
  kind: 'changed',
  page: 12,
  block: 4,
  lines: 2,
  ...more,
});

const gap = (more: Partial<GapMark> = {}): GapMark => ({
  page: 5,
  before: { from: 10, to: 20 },
  lines: ['One.', 'Two.', 'Three.'],
  kind: 'removed',
  change: 0,
  ...more,
});

describe('Compare labels', () => {
  test('names a stop by page, scene, and count', () => {
    expect(stopLabel(stop(), 'INT. HALL')).toBe('Page 12, INT. HALL: 2 lines changed');
    expect(stopLabel(stop({ kind: 'removed', page: 5, lines: 3 }), 'INT. HALL')).toBe(
      'Page 5, INT. HALL: 3 lines removed',
    );
    expect(stopLabel(stop({ kind: 'added', lines: 1 }), 'EXT. ROOF')).toBe(
      'Page 12, EXT. ROOF: 1 line added',
    );
  });

  test('names a stop with no scene by page', () => {
    expect(stopLabel(stop({ kind: 'added', page: 3, lines: 1 }), null)).toBe(
      'Page 3: 1 line added',
    );
    // Title-page lines are block -1, on page 0.
    expect(stopLabel(stop({ page: 0, block: -1, lines: 1 }), null)).toBe(
      'Title page: 1 line changed',
    );
  });

  test('names an unprinted change', () => {
    expect(stopLabel(stop({ kind: 'unprinted', page: 5, lines: 1 }), 'INT. HALL')).toBe(
      'Page 5, INT. HALL: 1 line changed that doesn’t print',
    );
    expect(stopLabel(stop({ kind: 'unprinted', page: 5, lines: 2 }), null)).toBe(
      'Page 5: 2 lines changed that don’t print',
    );
  });

  test('names a Markdown stop by line', () => {
    expect(stopLabel({ change: 0, kind: 'changed', line: 40, lines: 2 }, null)).toBe(
      'Line 40: 2 lines changed',
    );
    expect(stopLabel({ change: 1, kind: 'removed', line: 7, lines: 1 }, 'ignored')).toBe(
      'Line 7: 1 line removed',
    );
  });

  test('names a gap', () => {
    expect(gapName(gap())).toBe('3 lines removed');
    expect(gapName(gap({ lines: ['One.'] }))).toBe('1 line removed');
    expect(gapName(gap({ kind: 'unprinted', lines: ['[[A note.]]'] }))).toBe(
      '1 line changed that doesn’t print',
    );
  });
});
