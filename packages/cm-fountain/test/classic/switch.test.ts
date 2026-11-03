import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { fountain } from '../../src';
import {
  classic,
  classicEnter,
  classicTab,
  isBlankScript,
  savedText,
  selectionClear,
  tidiedSpeech,
} from '../../src/classic';
import { classicEditor } from './harness';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

// What the app needs when the writer changes mode: the text box says so, a line Enter made inside a
// speech doesn't stay to break it, and a selection isn't left in a block that's about to be hidden.

function entered(marked: string) {
  const view = new EditorView({ state: classicEditor(marked) });
  classicEnter(view);
  const { state } = view;
  view.destroy();
  return state;
}

describe('the text box', () => {
  test('is named for the mode, and points at the way out', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'One.\n',
        extensions: [
          classic(),
          EditorView.contentAttributes.of({ 'aria-label': 'Source' }),
          fountain(),
        ],
      }),
    });
    expect(view.contentDOM.getAttribute('aria-label')).toBe('Source, Classic Mode');
    expect(view.contentDOM.getAttribute('aria-describedby')).toBe('classic-leave');
    view.destroy();
  });
});

describe('tidiedSpeech', () => {
  test('takes the line Enter made in a speech, which cuts the speech in two', () => {
    const state = entered('JUNE\nOne.|\nTwo.\n');
    expect(state.doc.toString()).toBe('JUNE\nOne.\n\nTwo.\n');
    const spec = tidiedSpeech(state);
    expect(spec).not.toBeNull();
    expect(state.update(spec ?? {}).newDoc.toString()).toBe('JUNE\nOne.\nTwo.\n');
  });

  test('takes an empty () it made, at the end of the file too, and not one with words in it', () => {
    const tabbed = (marked: string) => {
      const view = new EditorView({ state: classicEditor(marked) });
      classicTab(view);
      const { state } = view;
      view.destroy();
      return state;
    };
    const state = tabbed('JUNE\nOne.|');
    expect(state.doc.toString()).toBe('JUNE\nOne.\n()');
    expect(state.update(tidiedSpeech(state) ?? {}).newDoc.toString()).toBe('JUNE\nOne.');
    const words = state.update({ changes: { from: state.doc.length - 1, insert: 'softly' } }).state;
    expect(tidiedSpeech(words)).toBeNull();
    expect(tidiedSpeech(classicEditor('JUNE\n(|)\nOne.\n'))).toBeNull(); // a file's own
  });

  test('leaves a line that hurts nothing, and a line with words on it', () => {
    expect(tidiedSpeech(entered('A plain line.|\n\nAnother.\n'))).toBeNull();
    expect(tidiedSpeech(entered('JUNE\nOne.|\n\nA plain line.\n'))).toBeNull();
    expect(tidiedSpeech(classicEditor('JUNE\nOne.|\nTwo.\n'))).toBeNull();
  });

  test('has nothing to do in Fountain Mode', () => {
    expect(
      tidiedSpeech(EditorState.create({ doc: 'JUNE\nOne.\n', extensions: fountain() })),
    ).toBeNull();
  });
});

describe('selectionClear', () => {
  const BLOCK = '/* drafter\n{"v":1,"template":"stage-play"}\n*/';

  test('stops a selection above the metadata block', () => {
    const doc = `One.\n\n${BLOCK}\n`;
    const state = EditorState.create({
      doc,
      selection: EditorSelection.single(2, doc.length - 3),
      extensions: fountain(),
    });
    const selection = selectionClear(state);
    expect(selection?.main.from).toBe(2);
    expect(selection?.main.to).toBe(4);
  });

  test('is null where the selection is clear', () => {
    const doc = `One.\n\n${BLOCK}\n`;
    const state = EditorState.create({ doc, selection: { anchor: 2 }, extensions: fountain() });
    expect(selectionClear(state)).toBeNull();
  });
});

test('isBlankScript names a script that is only its block', () => {
  const state = EditorState.create({ doc: '/* drafter\n{"v":1}\n*/\n', extensions: fountain() });
  expect(isBlankScript(state, state.doc.line(1))).toBe(true);
});

describe('savedText', () => {
  test('a save leaves out a line Enter made in a speech, and the cursor where it is', () => {
    const state = entered('JUNE\nOne.|\nTwo.\n');
    expect(state.doc.toString()).toBe('JUNE\nOne.\n\nTwo.\n');
    expect(savedText(state).toString()).toBe('JUNE\nOne.\nTwo.\n');
    // Nothing was dispatched: the line is still there for the writer's next letter.
    expect(state.doc.toString()).toBe('JUNE\nOne.\n\nTwo.\n');
  });

  test('is the text itself when nothing is made, and in Fountain Mode', () => {
    const state = classicEditor('JUNE\nOne.|\nTwo.\n');
    expect(savedText(state)).toBe(state.doc);
    const plain = EditorState.create({ doc: 'JUNE\nOne.\n\nTwo.\n', extensions: fountain() });
    expect(savedText(plain)).toBe(plain.doc);
    const blank = entered('A plain line.|\n\nAnother.\n');
    expect(savedText(blank)).toBe(blank.doc);
  });
});
