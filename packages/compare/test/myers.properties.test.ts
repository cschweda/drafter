import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { changesOf, type DiffRun, diffLines } from '../src';

/** Lines from a 4-line alphabet, so they repeat and the diff has choices to make. */
const lines = (maxLength: number) =>
  fc.array(fc.constantFrom('INT. HALL - DAY', '', 'Sam waits.', 'SAM'), { maxLength });

/** Plays the runs over `a`, checking that they tile both sides in order; gives the new lines. */
function apply(a: readonly string[], b: readonly string[], runs: DiffRun[]): string[] {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  for (const run of runs) {
    expect(run.old[0]).toBe(i);
    expect(run.new[0]).toBe(j);
    if (run.kind === 'same') {
      expect(run.old[1] - run.old[0]).toBe(run.new[1] - run.new[0]);
      out.push(...a.slice(run.old[0], run.old[1]));
    } else if (run.kind === 'added') {
      expect(run.old[1]).toBe(run.old[0]);
      out.push(...b.slice(run.new[0], run.new[1]));
    } else {
      expect(run.new[1]).toBe(run.new[0]);
    }
    expect(Math.max(run.old[1] - run.old[0], run.new[1] - run.new[0])).toBeGreaterThan(0);
    i = run.old[1];
    j = run.new[1];
  }
  expect(i).toBe(a.length);
  expect(j).toBe(b.length);
  return out;
}

/** The length of a longest common subsequence, by the textbook table. */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const line of a) {
    const next = [0];
    for (let j = 0; j < b.length; j++) {
      next.push(line === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
    }
    row = next;
  }
  return row[b.length];
}

describe('diffLines properties', () => {
  test('applying the runs to a gives b', () => {
    fc.assert(
      fc.property(lines(60), lines(60), (a, b) => {
        expect(apply(a, b, diffLines(a, b))).toEqual(b);
      }),
    );
  });

  test('the same lines are a longest common subsequence', () => {
    fc.assert(
      fc.property(lines(40), lines(40), (a, b) => {
        const same = diffLines(a, b)
          .filter((run) => run.kind === 'same')
          .reduce((sum, run) => sum + run.old[1] - run.old[0], 0);
        expect(same).toBe(lcsLength(a, b));
      }),
    );
  });

  test('adjacent runs are never of one kind', () => {
    fc.assert(
      fc.property(lines(40), lines(40), (a, b) => {
        const runs = diffLines(a, b);
        for (let k = 1; k < runs.length; k++) expect(runs[k].kind).not.toBe(runs[k - 1].kind);
      }),
    );
  });

  test('diffing never throws', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), fc.array(fc.string()), (a, b) => {
        expect(apply(a, b, diffLines(a, b))).toEqual(b);
      }),
    );
  });

  test('a text and itself, with either line break, have no changes', () => {
    fc.assert(
      fc.property(lines(40), (text) => {
        const lf = text.join('\n');
        expect(changesOf(lf, lf)).toEqual([]);
        expect(changesOf(lf, text.join('\r\n'))).toEqual([]);
      }),
    );
  });
});
