import { type LaneUnit, lanesOf, type ThreadInfo } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import {
  andList,
  blockName,
  cardLines,
  laneMarks,
  laneRowViews,
  noThreadsYet,
} from '../app/threads/lane-labels';

// What the Lanes say (threads design §7.3, §7.5): names a screen reader hears, cards, the table's
// cells, and the ruler.

const scene = (n: number, from: number, length: number, threads: string[]): LaneUnit => ({
  id: `scene:${n}`,
  label: String(n),
  heading: `${n} INT. ROOM ${n} - DAY`,
  from,
  length,
  threads,
});

const info = (key: string, label: string, name: string | null, units: number): ThreadInfo => ({
  key,
  label,
  name,
  color: 'teal',
  chosen: true,
  units,
});

describe('names', () => {
  test('andList', () => {
    expect(andList(['A'])).toBe('A');
    expect(andList(['A', 'C'])).toBe('A and C');
    expect(andList(['A', 'B', 'C'])).toBe('A, B, and C');
  });

  test('a block is named with its scene, length, and threads', () => {
    const lanes = lanesOf([scene(14, 0, 16, ['A', 'C'])], 'pages');
    expect(blockName(lanes.units[0] as LaneUnit, lanes, 'scene')).toBe(
      'Scene 14, INT. ROOM 14 - DAY, 2 pages, threads A and C',
    );
    const words = lanesOf([scene(3, 0, 1200, [])], 'words');
    expect(blockName(words.units[0] as LaneUnit, words, 'scene')).toBe(
      'Scene 3, INT. ROOM 3 - DAY, 1,200 words, no thread',
    );
  });

  test('a passage with its chapter’s threads says so', () => {
    const u: LaneUnit = {
      id: 'section:x',
      label: 'The Pier',
      heading: 'The Pier',
      from: 0,
      length: 1,
      threads: ['A'],
      inherited: true,
    };
    const lanes = lanesOf([u], 'words');
    expect(blockName(u, lanes, 'passage')).toBe('The Pier, 1 word, thread A, from its chapter');
    expect(cardLines(u, lanes, 'passage')).toEqual([
      'The Pier',
      '1 word',
      'Thread: A (from its chapter)',
    ]);
  });

  test('the card: title, length, every thread', () => {
    const lanes = lanesOf([scene(2, 0, 11, ['A', 'B'])], 'pages');
    expect(cardLines(lanes.units[0] as LaneUnit, lanes, 'scene')).toEqual([
      'Scene 2, INT. ROOM 2 - DAY',
      '1 3/8 pp',
      'Threads: A · B',
    ]);
  });

  test('the empty state', () => {
    expect(noThreadsYet('scene')).toBe('No threads yet. Add one from a scene’s menu: Threads…');
    expect(noThreadsYet('passage')).toContain('from a chapter’s or section’s menu');
  });
});

describe('laneRowViews', () => {
  const lanes = lanesOf(
    [
      scene(1, 0, 8, ['A']),
      scene(2, 8, 8, ['A', 'B']),
      scene(3, 16, 8, ['A']),
      scene(4, 24, 8, []),
      scene(5, 32, 8, ['A']),
    ],
    'pages',
  );
  const rows = laneRowViews(
    lanes,
    [info('a', 'A', 'The heist', 4), info('b', 'B', null, 1)],
    'scene',
  );

  test('headers, lists, lengths, and shares', () => {
    expect(rows.map((r) => r.header)).toEqual([
      'Thread A, The heist, 4 scenes',
      'Thread B, 1 scene',
      'No thread, 1 scene',
    ]);
    expect(rows.map((r) => r.list)).toEqual(['1 to 3, 5', '2', '4']);
    expect(rows.map((r) => r.length)).toEqual(['4 pp', '1 p', '1 p']);
    expect(rows.map((r) => r.share)).toEqual(['80%', '20%', '20%']);
    expect(rows[0]?.swatch).toMatch(/^#/);
    expect(rows[2]?.swatch).toBeNull();
  });
});

describe('laneMarks', () => {
  test('pages: numbered by the strip’s steps, wider set', () => {
    const lanes = lanesOf([scene(1, 0, 80, ['A'])], 'pages');
    const marks = laneMarks(lanes, 400);
    expect(marks[0]).toEqual({ at: 0, text: '1' });
    expect(marks.filter((m) => m.text).map((m) => m.text)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
  });

  test('words: thousands, about 56 px apart, none at the start', () => {
    const lanes = lanesOf([scene(1, 0, 100_000, ['A'])], 'words');
    const marks = laneMarks(lanes, 560);
    expect(marks[0]).toEqual({ at: 0.1, text: '10k' });
    expect(marks).toHaveLength(9);
  });

  test('no number within 20 px of the right end, where it would be cut off', () => {
    // 40 pages over 400 px: page 40's top is at 390 px.
    const lanes = lanesOf([scene(1, 0, 320, ['A'])], 'pages');
    const numbered = laneMarks(lanes, 400).filter((m) => m.text);
    expect(numbered.at(-1)?.text).not.toBe('40');
    for (const m of numbered) expect((1 - m.at) * 400).toBeGreaterThanOrEqual(20);
    const words = lanesOf([scene(1, 0, 10_100, ['A'])], 'words');
    for (const m of laneMarks(words, 560).filter((m) => m.text))
      expect((1 - m.at) * 560).toBeGreaterThanOrEqual(20);
  });

  test('nothing to measure: no marks', () => {
    expect(laneMarks(lanesOf([], 'words'), 500)).toEqual([]);
    expect(laneMarks(lanesOf([scene(1, 0, 8, [])], 'pages'), 0)).toEqual([]);
  });
});
