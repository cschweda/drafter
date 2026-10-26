import { codeFolding, foldEffect, unfoldEffect } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fountainHighlighting } from '@drafter/cm-fountain';
import { afterEach, describe, expect, it } from 'vitest';

// jsdom has no layout, so the viewport is whatever CodeMirror guesses: here, the whole of a short
// script. These tests check that the plugin puts the decorations in the DOM and keeps them up to
// date; which ranges a real window shows can only be seen in a browser.
const views: EditorView[] = [];

function mount(doc: string, extensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [fountainHighlighting(), ...extensions] }),
    parent,
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

/** Each line the view draws, as `[its text, its cm-f-* classes]`. */
const lines = (view: EditorView) =>
  [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => [
    line.textContent,
    [...line.classList].filter((cls) => cls.startsWith('cm-f-')).join(' '),
  ]);

/** The text of each mark of a class in the view. A line of a block kind has the class too. */
const texts = (view: EditorView, cls: string) =>
  [...view.contentDOM.querySelectorAll(`span.${cls}`)].map((el) => el.textContent);

const script = ['INT. HALL - DAY', '', 'MARGARET', 'Hello, **you**.', '', 'She waits.'].join('\n');

describe('fountainHighlighting in a view', () => {
  it('classes the lines it draws, and the marks in them', () => {
    const view = mount(script);
    expect(lines(view)).toEqual([
      ['INT. HALL - DAY', 'cm-f-scene_heading'],
      ['', ''],
      ['MARGARET', 'cm-f-character'],
      ['Hello, **you**.', 'cm-f-dialogue'],
      ['', ''],
      ['She waits.', 'cm-f-action'],
    ]);
    expect(texts(view, 'cm-f-b')).toEqual(['you']);
    expect(texts(view, 'cm-f-marker')).toEqual(['**', '**']);
  });

  it('follows the text as it changes', () => {
    const view = mount(script);
    view.dispatch({ changes: { from: 0, insert: '# ' } });
    expect(lines(view)[0]).toEqual(['# INT. HALL - DAY', 'cm-f-section']);
    expect(texts(view, 'cm-f-marker')).toEqual(['#', '**', '**']);

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n\n[[a note]]' } });
    expect(lines(view).slice(-1)).toEqual([['[[a note]]', 'cm-f-note']]);
    expect(texts(view, 'cm-f-note')).toEqual(['[[a note]]']);
  });

  it('decorates what an unfold shows again, though the text has not changed', () => {
    const view = mount(script, [codeFolding()]);
    // The three lines after the heading, from the end of the heading to the end of the dialogue.
    const fold = { from: 15, to: 41 };
    view.dispatch({ effects: foldEffect.of(fold) });
    expect(view.visibleRanges).toEqual([
      { from: 0, to: 15 },
      { from: 41, to: script.length },
    ]);
    // A change while they are folded rebuilds the decorations for what is visible.
    view.dispatch({ changes: { from: script.length, insert: '.' } });
    expect(lines(view).map(([text]) => text)).toEqual(['INT. HALL - DAY…', '', 'She waits..']);

    view.dispatch({ effects: unfoldEffect.of(fold) });
    expect(lines(view)).toEqual([
      ['INT. HALL - DAY', 'cm-f-scene_heading'],
      ['', ''],
      ['MARGARET', 'cm-f-character'],
      ['Hello, **you**.', 'cm-f-dialogue'],
      ['', ''],
      ['She waits..', 'cm-f-action'],
    ]);
  });
});
