import { fountainDecorations } from '@drafter/cm-fountain';
import { describe, expect, it } from 'vitest';
import { stateOf } from './helpers';

// Inputs shaped to make careless editor code super-linear: each is a hostile script that must
// still be decorated well inside a second, and a hostile edit that must still be applied as
// fast. (The editor does both on the main thread, on every keystroke.) The state is built before
// the clock starts, so the parse at creation isn't timed. The parse after a change is, since
// that is what a keystroke costs, and so is the parser's lazy reading of the lines.
const line = (text: string, count: number) => `${text}\n`.repeat(count);

const scripts: Array<[string, () => string]> = [
  ['a line of fifty thousand emphasis runs', () => '*a* '.repeat(50_000)],
  ['a line of fifty thousand escapes', () => 'a\\* '.repeat(50_000)],
  ['a line of two hundred thousand backslashes', () => '\\'.repeat(200_000)],
  ['a line of fifty thousand notes', () => '[[n]]x'.repeat(50_000)],
  ['a line of deeply nested emphasis', () => `${'**a '.repeat(25_000)}x${' a**'.repeat(25_000)}`],
  ['a line of unclosed notes', () => '[[ '.repeat(60_000)],
  ['a boneyard of a hundred thousand lines', () => `/*\n${line('x', 100_000)}*/`],
  ['a hundred thousand blocks', () => line('Line.\n', 100_000)],
  ['a hundred thousand scene headings in one paragraph', () => line('INT. A - DAY', 100_000)],
  ['a title page of fifty thousand fields', () => `Title: x\n${line('Key: **v**', 50_000)}`],
  ['a title field of fifty thousand lines', () => `Title: x\n${line('   *more*', 50_000)}`],
  ['fifty thousand notes, a block each', () => line('[[n]]\n', 50_000)],
  ['fifty thousand forced markers', () => line('!A\n', 50_000)],
  ['a hundred thousand lines of two spaces', () => `MARGARET\n${line('  ', 100_000)}`],
];

describe('hostile scripts', () => {
  for (const [label, make] of scripts) {
    it(`decorates ${label} in under a second`, () => {
      const state = stateOf(make());
      const start = performance.now();
      const set = fountainDecorations(state, [{ from: 0, to: state.doc.length }]);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(set.size).toBeGreaterThan(0);
    }, 60_000);
  }

  it('decorates a window of a big script, over and over, in under a second', () => {
    const state = stateOf(line('Line.\n', 150_000));
    const windows = Array.from({ length: 3_000 }, (_, i) => {
      const from = state.doc.line(1 + ((i * 97) % 290_000)).from;
      return [{ from, to: from + 400 }];
    });
    const start = performance.now();
    for (const ranges of windows) fountainDecorations(state, ranges);
    expect(performance.now() - start).toBeLessThan(1000);
  }, 60_000);

  it('decorates ten thousand ranges in under a second', () => {
    const state = stateOf(line('Line.\n', 50_000));
    const ranges = Array.from({ length: 10_000 }, (_, i) => {
      const from = state.doc.line(1 + ((i * 7919) % 100_000)).from;
      return { from, to: from + 3 };
    });
    const start = performance.now();
    fountainDecorations(state, ranges);
    expect(performance.now() - start).toBeLessThan(1000);
  }, 60_000);
});

describe('hostile edits', () => {
  const script = line('MARGARET\nHello, **you**.\n', 4_000);

  it('applies a change to every line at once in under a second', () => {
    const state = stateOf(script);
    const changes = Array.from({ length: state.doc.lines }, (_, i) => ({
      from: state.doc.line(1 + i).from,
      insert: '[[n]] ',
    }));
    const start = performance.now();
    const next = state.update({ changes }).state;
    expect(performance.now() - start).toBeLessThan(1000);
    expect(next.doc.lines).toBe(state.doc.lines);
  }, 60_000);

  it('applies a change to every character, as touching ranges, in under a second', () => {
    const state = stateOf(script.slice(0, 60_000));
    const changes = Array.from({ length: state.doc.length }, (_, from) => ({
      from,
      to: from + 1,
      insert: 'x',
    }));
    const start = performance.now();
    state.update({ changes });
    expect(performance.now() - start).toBeLessThan(1000);
  }, 60_000);

  it('applies a hundred keystrokes to a script of 100 KB in under a second', () => {
    let state = stateOf(script);
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      state = state.update({ changes: { from: 100 + i * 7, insert: 'x' } }).state;
    }
    expect(performance.now() - start).toBeLessThan(1000);
  }, 60_000);
});
