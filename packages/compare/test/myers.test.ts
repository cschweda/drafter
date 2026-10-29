import { describe, expect, test } from 'vitest';
import { diffLines, splitLines } from '../src';

describe('diffLines', () => {
  test('two equal texts are one same run', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([
      { kind: 'same', old: [0, 3], new: [0, 3] },
    ]);
    expect(diffLines([], [])).toEqual([]);
  });

  test('finds a line added, removed, and changed', () => {
    expect(diffLines(['a', 'c'], ['a', 'b', 'c'])).toEqual([
      { kind: 'same', old: [0, 1], new: [0, 1] },
      { kind: 'added', old: [1, 1], new: [1, 2] },
      { kind: 'same', old: [1, 2], new: [2, 3] },
    ]);
    expect(diffLines(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { kind: 'same', old: [0, 1], new: [0, 1] },
      { kind: 'removed', old: [1, 2], new: [1, 1] },
      { kind: 'same', old: [2, 3], new: [1, 2] },
    ]);
    expect(diffLines(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual([
      { kind: 'same', old: [0, 1], new: [0, 1] },
      { kind: 'removed', old: [1, 2], new: [1, 1] },
      { kind: 'added', old: [2, 2], new: [1, 2] },
      { kind: 'same', old: [2, 3], new: [2, 3] },
    ]);
  });

  test('an empty side is all added or all removed', () => {
    expect(diffLines([], ['a', 'b'])).toEqual([{ kind: 'added', old: [0, 0], new: [0, 2] }]);
    expect(diffLines(['a', 'b'], [])).toEqual([{ kind: 'removed', old: [0, 2], new: [0, 0] }]);
  });

  test('prefers the removal before the addition', () => {
    expect(diffLines(['x'], ['y']).map((run) => run.kind)).toEqual(['removed', 'added']);
    const kinds = diffLines(['a', 'b', 'c', 'd', 'e'], ['a', 'B', 'C', 'd', 'E']).map(
      (run) => run.kind,
    );
    expect(kinds).toEqual(['same', 'removed', 'added', 'same', 'removed', 'added']);
  });
});

describe('splitLines', () => {
  test('CRLF and LF lines compare equal', () => {
    const lf = splitLines('INT. HALL - DAY\n\nSam waits.\n');
    const crlf = splitLines('INT. HALL - DAY\r\n\r\nSam waits.\r\n');
    expect(lf.lines).toEqual(['INT. HALL - DAY', '', 'Sam waits.', '']);
    expect(crlf.lines).toEqual(lf.lines);
    expect(lf.starts).toEqual([0, 16, 17, 28]);
    expect(crlf.starts).toEqual([0, 17, 19, 31]);
    expect(diffLines(lf.lines, crlf.lines)).toEqual([{ kind: 'same', old: [0, 4], new: [0, 4] }]);
  });

  test('an empty text is one empty line, and a lone CR stays in its line', () => {
    expect(splitLines('')).toEqual({ lines: [''], starts: [0] });
    expect(splitLines('a\rb\nc')).toEqual({ lines: ['a\rb', 'c'], starts: [0, 4] });
  });
});
