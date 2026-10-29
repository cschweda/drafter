import { describe, expect, test } from 'vitest';
import {
  overall,
  PROGRESS_EVERY_MS,
  progressReporter,
  WEIGHTS,
} from '../app/workers/export-progress';

describe('an export’s progress', () => {
  test('weighs each stage by its share of the time an export takes', () => {
    const markdown = WEIGHTS.markdown;
    expect(overall(markdown, 'prepare', 0, 1)).toBe(0);
    expect(overall(markdown, 'layout', 0, 10)).toBeCloseTo(0.05);
    expect(overall(markdown, 'layout', 5, 10)).toBeCloseTo(0.3);
    expect(overall(markdown, 'draw', 0, 4)).toBeCloseTo(0.55);
    expect(overall(markdown, 'draw', 4, 4)).toBeCloseTo(0.95);
    expect(overall(markdown, 'save', 1, 1)).toBe(1);
    // A script is laid out before it is drawn, in the one step that can't say how far it is.
    expect(overall(WEIGHTS.script, 'draw', 0, 100)).toBeCloseTo(0.1);
    expect(overall(WEIGHTS.script, 'draw', 50, 100)).toBeCloseTo(0.45);
    expect(overall(WEIGHTS.script, 'save', 1, 1)).toBe(1);
  });

  test('never leaves 0 to 1, and counts a stage with nothing in it as done', () => {
    expect(overall(WEIGHTS.markdown, 'layout', 0, 0)).toBeCloseTo(0.55);
    expect(overall(WEIGHTS.markdown, 'draw', 9, 4)).toBeCloseTo(0.95);
    expect(overall(WEIGHTS.markdown, 'draw', -3, 4)).toBeCloseTo(0.55);
    // A stage the weights don't have (a script has no layout here) adds nothing.
    expect(overall(WEIGHTS.script, 'layout', 3, 4)).toBeCloseTo(0.1);
  });

  test('sends at most one message per interval, and always the last', () => {
    let clock = 0;
    const sent: Array<number | null> = [];
    const report = progressReporter(WEIGHTS.markdown, (value) => sent.push(value), {
      now: () => clock,
    });
    report.unknown();
    // A thousand blocks in under a tenth of a second: one message for them.
    for (let i = 0; i <= 1000; i++) {
      clock = i * 0.05;
      report.step('layout', i, 1000);
    }
    expect(sent).toEqual([null, 0.05]);
    clock = PROGRESS_EVERY_MS;
    report.step('draw', 1, 2);
    expect(sent.at(-1)).toBeCloseTo(0.75);
    // Within the interval, but the last: sent.
    clock += 1;
    report.done();
    expect(sent).toHaveLength(4);
    expect(sent.at(-1)).toBe(1);
  });

  test('switches to an unknown stage and back at once, but sends the same value only once', () => {
    let clock = 0;
    const sent: Array<number | null> = [];
    const report = progressReporter(WEIGHTS.script, (value) => sent.push(value), {
      now: () => clock,
    });
    report.unknown();
    report.unknown();
    clock = 1;
    report.step('draw', 0, 10);
    clock = 2;
    report.unknown();
    clock = 3;
    report.done();
    report.done();
    expect(sent).toEqual([null, 0.1, null, 1]);
  });

  test('sends nothing more than ten a second, however long the export', () => {
    let clock = 0;
    let count = 0;
    const report = progressReporter(WEIGHTS.markdown, () => count++, { now: () => clock });
    // Ten seconds of drawing, a page a millisecond.
    for (let page = 0; page <= 10_000; page++) {
      clock = page;
      report.step('draw', page, 10_000);
    }
    report.done();
    expect(count).toBeLessThanOrEqual(10 * 10 + 2);
    expect(count).toBeGreaterThan(90);
  });
});
