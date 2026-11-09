// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import {
  provisionalNumbersExtension,
  provisionalShown,
  setProvisionalIssued,
} from '../app/editor/provisional';

const TEXT = [
  'INT. A - DAY #5#',
  '',
  'One.',
  '',
  'INT. NEW - DAY',
  '',
  'Two.',
  '',
  'INT. B - DAY #6#',
  '',
].join('\n');

const stateOf = (doc = TEXT) =>
  EditorState.create({ doc, extensions: [parsedDoc, provisionalNumbersExtension] });

describe('the provisional scene numbers', () => {
  test('are drawn only once the issued numbers are given, and never put in the text', () => {
    let state = stateOf();
    expect(provisionalShown(state)).toEqual([]);
    state = state.update({ effects: setProvisionalIssued.of(['5', '6']) }).state;
    expect(provisionalShown(state)).toEqual(['5A']);
    expect(state.doc.toString()).toBe(TEXT);
    // Off again: nothing drawn.
    state = state.update({ effects: setProvisionalIssued.of(null) }).state;
    expect(provisionalShown(state)).toEqual([]);
  });

  test('follow the text, and skip a number already issued', () => {
    let state = stateOf().update({ effects: setProvisionalIssued.of(['5', '5A', '6']) }).state;
    expect(provisionalShown(state)).toEqual(['5B']);
    // The writer numbers it by hand: nothing left to draw.
    const at = TEXT.indexOf('INT. NEW - DAY') + 'INT. NEW - DAY'.length;
    state = state.update({ changes: { from: at, insert: ' #5B#' } }).state;
    expect(provisionalShown(state)).toEqual([]);
  });
});
