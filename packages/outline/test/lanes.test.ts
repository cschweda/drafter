import { describe, expect, test } from 'vitest';
import { type LaneUnit, lanesOf, scriptUnits } from '../src';
import { indexOf } from './helpers';

const u = (id: string, threads: string[], length = 8): LaneUnit => ({
  id,
  label: id,
  heading: id,
  from: 0,
  length,
  threads,
});

const SCRIPT = `INT. KITCHEN - DAY

[[Thread: Maya, Sam]]
She waits.

INT. HALL - NIGHT #2A#

[[Thread: sam]]
He comes.
`;

describe('lanesOf', () => {
  test('threads in order of first appearance; a unit in two threads is in both', () => {
    const l = lanesOf([u('1', ['B'], 3), u('2', ['A', 'b'], 5), u('3', [], 2)], 'pages');
    expect(l.threads.map((t) => t.label)).toEqual(['B', 'A']);
    expect(l.threads.map((t) => t.key)).toEqual(['b', 'a']);
    expect(l.total).toBe(10);
    expect(l.unit).toBe('pages');
  });
});

describe('scriptUnits', () => {
  test('a script before its pages are made counts words', () => {
    const { index } = indexOf(SCRIPT);
    const r = scriptUnits(index, null);
    expect(r.unit).toBe('words');
    expect(r.units.map((x) => x.length)).toEqual(index.scenes.map((s) => Math.max(1, s.words)));
    expect(r.units[1]?.from).toBe(r.units[0]?.length);
  });
  test('pages: eighths, labels, headings, threads', () => {
    const { index } = indexOf(SCRIPT, { pages: true });
    const r = scriptUnits(index, 55);
    expect(r.unit).toBe('pages');
    expect(r.units.map((x) => x.length)).toEqual(index.scenes.map((s) => s.pages?.eighths));
    expect(r.units.map((x) => x.label)).toEqual(['1', '2A']);
    expect(r.units[1]?.heading).toBe('2A INT. HALL - NIGHT');
    expect(r.units[0]?.threads).toEqual(['Maya', 'Sam']);
    expect(scriptUnits(index, 0).unit).toBe('words');
  });
  test('a script with no scenes has no units', () => {
    const { index } = indexOf('Just a title page.\n');
    expect(scriptUnits(index, 55)).toEqual({ units: [], unit: 'pages' });
  });
});
