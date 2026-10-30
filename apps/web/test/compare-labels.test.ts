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
    expect(stopLabel({ change: 1, kind: 'removed', line: 7, lines: 1 }, null)).toBe(
      'Line 7: 1 line removed',
    );
  });

  test('names a stop in the Changes view by its heading, which has no page', () => {
    expect(stopLabel({ change: 1, kind: 'removed', line: 7, lines: 1 }, 'INT. HALL')).toBe(
      'INT. HALL: 1 line removed',
    );
  });

  test('names a gap', () => {
    expect(gapName(gap())).toBe('3 lines removed');
    expect(gapName(gap({ lines: ['One.'] }))).toBe('1 line removed');
    expect(gapName(gap({ kind: 'unprinted', lines: ['[[A note.]]'] }))).toBe(
      '1 line changed that doesn’t print',
    );
  });

  test('a gap counts the lines with text, and says so when it holds only blank lines', () => {
    expect(gapName(gap({ lines: ['', 'Nobody answers it.', ''] }))).toBe('1 line removed');
    expect(gapName(gap({ lines: ['One.', '', 'Two.'] }))).toBe('2 lines removed');
    expect(gapName(gap({ lines: [''] }))).toBe('a blank line removed');
    expect(gapName(gap({ lines: ['', '  '] }))).toBe('2 blank lines removed');
    expect(gapName(gap({ kind: 'unprinted', lines: [''] }))).toBe('a blank line added');
  });

  test('a stop of blank lines only is named as its marker is', () => {
    // The Changes list, Next change, and the marker's button say the same words.
    const one = stop({ kind: 'removed', page: 5, lines: 1, blank: true });
    expect(stopLabel(one, 'INT. HALL')).toBe('Page 5, INT. HALL: a blank line removed');
    expect(stopLabel(one, 'INT. HALL')).toContain(gapName(gap({ lines: [''] })));
    const two = stop({ kind: 'unprinted', page: 1, lines: 2, blank: true });
    expect(stopLabel(two, null)).toBe('Page 1: 2 blank lines added');
    expect(stopLabel(two, null)).toContain(gapName(gap({ kind: 'unprinted', lines: ['', ''] })));
  });
});
