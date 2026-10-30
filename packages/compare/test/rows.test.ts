import { describe, expect, test } from 'vitest';
import {
  type Anchor,
  CONTEXT,
  type DiffRow,
  diffRows,
  FOLD_STEP,
  foldRows,
  groupRows,
  markdownAnchors,
  openFold,
  PAIR_MIN,
  pairRows,
} from '../src';

/** Scene headings of a test script: its lines that start with INT. or EXT. */
const anchors = (text: string): Anchor[] =>
  text
    .split(/\r?\n/)
    .flatMap((line, i) => (/^(INT|EXT)\. /.test(line) ? [{ line: i, title: line }] : []));

const groupsOf = (older: string, newer: string) => {
  const { rows } = diffRows(older, newer);
  return { rows, groups: groupRows(rows, anchors(older), anchors(newer)) };
};

/** `n` unchanged lines of invented words. */
const filler = (n: number, tag = 'plin') =>
  Array.from({ length: n }, (_, i) => `${tag} vorra ${i}`);

describe('diffRows', () => {
  test('numbers rows on both sides', () => {
    const { rows, changes } = diffRows('a\nb\nc\nd', 'a\nc\nx\nd');
    expect(rows).toEqual<DiffRow[]>([
      { kind: 'same', old: 0, new: 0, text: 'a', change: null, pair: null },
      { kind: 'removed', old: 1, new: null, text: 'b', change: 0, pair: null },
      { kind: 'same', old: 2, new: 1, text: 'c', change: null, pair: null },
      { kind: 'added', old: null, new: 2, text: 'x', change: 1, pair: null },
      { kind: 'same', old: 3, new: 3, text: 'd', change: null, pair: null },
    ]);
    expect(changes.map((c) => c.kind)).toEqual(['removed', 'added']);
  });

  test('pairs a changed line with its replacement when similar', () => {
    expect(PAIR_MIN).toBe(0.4);
    const { rows } = diffRows(
      'INT. HALL - DAY\nAnn waits by the door.\nSam leaves.',
      'INT. HALL - DAY\nAnn waits by the gate.\nSam leaves.',
    );
    expect(rows.map((r) => [r.kind, r.change, r.pair])).toEqual([
      ['same', null, null],
      ['removed', 0, 2],
      ['added', 0, 1],
      ['same', null, null],
    ]);
  });

  test('leaves dissimilar lines unpaired', () => {
    const { rows } = diffRows(
      'Ann waits by the door.\nRain falls.\nEnd.',
      'Sam runs for the bus.\nRain falls hard.\nEnd.',
    );
    // Line 0: only "the" is shared (Dice 2/10), so it is unpaired; line 1 is paired.
    expect(rows.map((r) => [r.kind, r.text, r.pair])).toEqual([
      ['removed', 'Ann waits by the door.', null],
      ['removed', 'Rain falls.', 3],
      ['added', 'Sam runs for the bus.', null],
      ['added', 'Rain falls hard.', 1],
      ['same', 'End.', null],
    ]);
  });

  test('CRLF and LF read the same', () => {
    const { rows, changes } = diffRows('a\r\nb\r\nc\r\n', 'a\nb\nc\n');
    expect(changes).toEqual([]);
    expect(rows.map((r) => r.text)).toEqual(['a', 'b', 'c', '']);
    expect(rows.every((r) => r.kind === 'same')).toBe(true);
  });
});

describe('foldRows', () => {
  test('folds unchanged stretches longer than 2 × CONTEXT', () => {
    expect(CONTEXT).toBe(3);
    const older = [...filler(10, 'top'), 'old', ...filler(20, 'mid'), 'old2', ...filler(6, 'end')];
    const newer = [...filler(10, 'top'), 'new', ...filler(20, 'mid'), 'new2', ...filler(6, 'end')];
    const { rows } = diffRows(older.join('\n'), newer.join('\n'));
    // Rows: 10 same (0–9), a change (10, 11), 20 same (12–31), a change (32, 33), 6 same (34–39).
    expect(foldRows(rows, 0, rows.length)).toEqual([
      { kind: 'fold', from: 0, to: 7 },
      { kind: 'rows', from: 7, to: 15 },
      { kind: 'fold', from: 15, to: 29 },
      { kind: 'rows', from: 29, to: 40 },
    ]);
    // The last stretch is 2 × CONTEXT lines, so it stays open; so does one between two changes.
    const short = diffRows(
      ['x', ...filler(6), 'y'].join('\n'),
      ['X', ...filler(6), 'Y'].join('\n'),
    );
    expect(foldRows(short.rows, 0, short.rows.length)).toEqual([
      { kind: 'rows', from: 0, to: short.rows.length },
    ]);
    // A range with no change in it folds whole when long enough.
    expect(foldRows(rows, 12, 32)).toEqual([{ kind: 'fold', from: 12, to: 32 }]);
    expect(foldRows(rows, 12, 18)).toEqual([{ kind: 'rows', from: 12, to: 18 }]);
    expect(foldRows(rows, 5, 5)).toEqual([]);
  });

  test('a fold over 200 lines opens 200 at a time', () => {
    expect(FOLD_STEP).toBe(200);
    const older = ['a', ...filler(500), 'b'];
    const newer = ['A', ...filler(500), 'B'];
    const { rows } = diffRows(older.join('\n'), newer.join('\n'));
    // Rows: a, A (0, 1); 500 same (2–501); b, B (502, 503).
    const pieces = foldRows(rows, 0, rows.length);
    expect(pieces).toEqual([
      { kind: 'rows', from: 0, to: 5 },
      { kind: 'fold', from: 5, to: 499 },
      { kind: 'rows', from: 499, to: 504 },
    ]);
    const first = openFold(pieces[1]);
    expect(first).toEqual([
      { kind: 'rows', from: 5, to: 205 },
      { kind: 'fold', from: 205, to: 499 },
    ]);
    const second = openFold(first[1]);
    expect(second).toEqual([
      { kind: 'rows', from: 205, to: 405 },
      { kind: 'fold', from: 405, to: 499 },
    ]);
    // 94 left: it opens whole.
    expect(openFold(second[1])).toEqual([{ kind: 'rows', from: 405, to: 499 }]);
  });
});

describe('groupRows', () => {
  const OLDER = [
    'Title: Rain Check',
    '',
    'INT. HALL - DAY',
    '',
    'Ann waits.',
    '',
    'EXT. ROOF - NIGHT',
    '',
    'Wind.',
    '',
    'INT. CAR - NIGHT',
    '',
    'Sam drives.',
  ].join('\n');

  test('groups by scene heading anchors', () => {
    const newer = OLDER.replace('Wind.', 'Wind howls.');
    const { rows, groups } = groupsOf(OLDER, newer);
    expect(
      groups.map((g) => [g.from, g.to, g.title, g.tag, g.added, g.removed, g.changes]),
    ).toEqual([
      [0, 2, '', 'opening', 0, 0, []],
      [2, 6, 'INT. HALL - DAY', 'same', 0, 0, []],
      [6, 11, 'EXT. ROOF - NIGHT', 'same', 1, 1, [0]],
      [11, rows.length, 'INT. CAR - NIGHT', 'same', 0, 0, []],
    ]);
    expect(groups.every((g) => g.renamedFrom === null)).toBe(true);
  });

  test('a scene only in the older text is a deleted group', () => {
    const newer = OLDER.replace('EXT. ROOF - NIGHT\n\nWind.\n\n', '');
    const { rows, groups } = groupsOf(OLDER, newer);
    const roof = groups.find((g) => g.title === 'EXT. ROOF - NIGHT');
    expect(roof).toMatchObject({ tag: 'deleted', added: 0, removed: 4, changes: [0] });
    expect(rows[roof?.from ?? -1]).toMatchObject({ kind: 'removed', old: 6 });
    expect(groups.map((g) => g.tag)).toEqual(['opening', 'same', 'deleted', 'same']);
    // And the other way round, a new one.
    expect(groupsOf(newer, OLDER).groups.map((g) => g.tag)).toEqual([
      'opening',
      'same',
      'new',
      'same',
    ]);
  });

  test('a renamed heading is one renamed group', () => {
    const newer = OLDER.replace('INT. HALL - DAY', 'INT. HALLWAY - DAY');
    const { groups } = groupsOf(OLDER, newer);
    expect(groups.map((g) => [g.title, g.tag, g.renamedFrom, g.added, g.removed])).toEqual([
      ['', 'opening', null, 0, 0],
      ['INT. HALLWAY - DAY', 'renamed', 'INT. HALL - DAY', 1, 1],
      ['EXT. ROOF - NIGHT', 'same', null, 0, 0],
      ['INT. CAR - NIGHT', 'same', null, 0, 0],
    ]);
  });

  test('rows before the first anchor are the opening group', () => {
    const newer = OLDER.replace('Title: Rain Check', 'Title: Rain Check Two');
    const { groups } = groupsOf(OLDER, newer);
    expect(groups[0]).toMatchObject({ from: 0, to: 3, tag: 'opening', title: '', changes: [0] });
    // No rows before the first anchor: no opening group.
    const bare = OLDER.split('\n').slice(2).join('\n');
    expect(groupsOf(bare, bare).groups[0]).toMatchObject({ from: 0, tag: 'same' });
    expect(groupRows([], [], [])).toEqual([]);
  });
});

describe('markdownAnchors', () => {
  test('markdownAnchors skips headings inside fenced code and takes levels 1–3 only', () => {
    const text = [
      '# Act One',
      'Text.',
      '## The plan ##',
      '```',
      '# not a heading',
      '```',
      '#### Too deep',
      '   ### Indented three',
      '    # Indented four is code',
      '#NoSpace',
      '~~~~',
      '## also code',
      '~~~',
      'still code',
      '~~~~',
      '### Three',
    ].join('\r\n');
    expect(markdownAnchors(text)).toEqual([
      { line: 0, title: 'Act One' },
      { line: 2, title: 'The plan' },
      { line: 7, title: 'Indented three' },
      { line: 15, title: 'Three' },
    ]);
  });
});

describe('pairRows', () => {
  test('pairRows aligns removed left and added right with blanks', () => {
    const { rows } = diffRows('a\nb\nc\nd\ne', 'a\nB\nd\nx\ny\ne');
    // a | b c → B | d | + x y | e
    expect(rows.map((r) => r.kind)).toEqual([
      'same',
      'removed',
      'removed',
      'added',
      'same',
      'added',
      'added',
      'same',
    ]);
    expect(pairRows(rows, 0, rows.length)).toEqual([
      { left: 0, right: 0 },
      { left: 1, right: 3 },
      { left: 2, right: null },
      { left: 4, right: 4 },
      { left: null, right: 5 },
      { left: null, right: 6 },
      { left: 7, right: 7 },
    ]);
    expect(pairRows(rows, 1, 3)).toEqual([
      { left: 1, right: null },
      { left: 2, right: null },
    ]);
  });
});
