import { describe, expect, test } from 'vitest';
import { changesOf } from '../src';

describe('changesOf', () => {
  test('pairs a removed run and an added run into one changed', () => {
    expect(changesOf('a\nb\nc\nd', 'a\nB\nC\nd')).toEqual([
      { kind: 'changed', old: [1, 3], new: [1, 3], span: { from: 2, to: 5 }, removed: ['b', 'c'] },
    ]);
  });

  test('a removal sits before the line that follows it', () => {
    expect(changesOf('a\nb\nc', 'a\nc')).toEqual([
      { kind: 'removed', old: [1, 2], new: [1, 1], span: { from: 2, to: 2 }, removed: ['b'] },
    ]);
    // Removed from the end: it sits at the end of the newer text.
    expect(changesOf('a\nb', 'a')).toEqual([
      { kind: 'removed', old: [1, 2], new: [1, 1], span: { from: 1, to: 1 }, removed: ['b'] },
    ]);
  });

  test('spans are the newer text’s offsets', () => {
    const newer = 'one\r\ntwo\r\nthree\r\n';
    const [change] = changesOf('one\nthree\n', newer);
    expect(change).toEqual({
      kind: 'added',
      old: [1, 1],
      new: [1, 2],
      span: { from: 5, to: 8 },
      removed: [],
    });
    expect(newer.slice(change.span.from, change.span.to)).toBe('two');
  });

  test('a moved scene is one removed and one added change', () => {
    const scene = (n: number, place: string) =>
      `INT. ${place} - DAY\n\nScene ${n} begins.\n\nSAM\nLine ${n}.\n`;
    const one = scene(1, 'KITCHEN');
    const two = scene(2, 'GARDEN');
    const three = scene(3, 'ATTIC');
    const older = [one, two, three].join('\n');
    const newer = [three, one, two].join('\n');
    const changes = changesOf(older, newer);
    expect(changes.map((change) => change.kind)).toEqual(['added', 'removed']);
    const [added, removed] = changes;
    expect(newer.slice(added.span.from, added.span.to)).toContain('INT. ATTIC - DAY');
    expect(newer.slice(added.span.from, added.span.to)).toContain('Line 3.');
    expect(removed.removed).toContain('INT. ATTIC - DAY');
    expect(removed.removed).toContain('Line 3.');
    for (const line of ['INT. KITCHEN - DAY', 'Line 1.', 'INT. GARDEN - DAY', 'Line 2.']) {
      expect(removed.removed).not.toContain(line);
      expect(newer.slice(added.span.from, added.span.to)).not.toContain(line);
    }
  });

  test('an unrelated text is one changed run', () => {
    expect(changesOf('Sam waits.\nAnn leaves.', 'EXT. ROOF - NIGHT\nRain.\nThunder.')).toEqual([
      {
        kind: 'changed',
        old: [0, 2],
        new: [0, 3],
        span: { from: 0, to: 32 },
        removed: ['Sam waits.', 'Ann leaves.'],
      },
    ]);
  });
});
