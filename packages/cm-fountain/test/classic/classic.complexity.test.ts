import type { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { setStored } from '../../src/classic/line';
import { classicEditor, type } from './harness';

// A keystroke in Classic Mode asks the parser about the run of lines around the cursor. These are
// the lines shaped to make that dear. Past the cap the question isn't asked at all.
const BUDGET = 1000;

function withinBudget(work: () => void) {
  const start = performance.now();
  work();
  expect(performance.now() - start).toBeLessThan(BUDGET);
}

const choose = (state: EditorState, kind: 'action' | 'lyric') =>
  state.update({ effects: setStored.of({ kind, chosen: true }) }).state;

describe('a keystroke on hostile lines', () => {
  it('a keystroke on a 100,000-character line stays cheap', () => {
    const middle = classicEditor(`She waits.\n\n${'x'.repeat(100_000)}|`);
    const first = classicEditor(`${'x'.repeat(50_000)}: ${'y'.repeat(50_000)}|`);
    withinBudget(() => {
      for (const state of [middle, first]) {
        expect(type(state, 'abc').doc.length).toBe(state.doc.length + 3);
      }
    });
  }, 60_000);

  it('one paragraph of 50,000 lines stays cheap', () => {
    const lines = 'She waits.\n'.repeat(50_000);
    const state = classicEditor(
      `${lines.slice(0, 25_000 * 11 - 1)}|${lines.slice(25_000 * 11 - 1)}`,
    );
    withinBudget(() => {
      expect(type(state, '.4').doc.length).toBe(state.doc.length + 2);
    });
  }, 60_000);

  it('a line of 50,000 spaces', () => {
    const state = choose(classicEditor(`She waits.\n\n${' '.repeat(50_000)}|`), 'lyric');
    const firm = choose(classicEditor(`She waits.\n\n${' '.repeat(50_000)}|\nmore`), 'action');
    withinBudget(() => {
      expect(type(state, ' ').doc.length).toBe(state.doc.length + 1);
      expect(type(firm, 'x').doc.length).toBeGreaterThan(firm.doc.length);
    });
  }, 60_000);
});
