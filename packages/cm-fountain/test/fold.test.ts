import { foldable, foldEffect } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fountainFolding, parsedDoc } from '@drafter/cm-fountain';
import { afterEach, describe, expect, it } from 'vitest';

const text = (...rows: string[]) => rows.join('\n');

/** The text a fold hides, for the line that holds `line`, or null when the line has no fold. */
function hidden(state: EditorState, line: string): string | null {
  const start = state.doc.toString().indexOf(line);
  const found = state.doc.lineAt(start);
  const range = foldable(state, found.from, found.to);
  return range && state.sliceDoc(range.from, range.to);
}

const stateOf = (doc: string) =>
  EditorState.create({ doc, extensions: [parsedDoc, fountainFolding()] });

describe('folding', () => {
  it('folds a scene to the line before the next heading', () => {
    const state = stateOf(
      text(
        ...['INT. HALL - DAY', '', 'She waits.', '', 'MARGARET', 'Hello.', ''],
        ...['EXT. YARD - DAY', '', 'Rain.'],
      ),
    );
    // From the end of the heading to the end of the scene's last line. The blank line before the
    // next heading is left out, so folded scenes still have a gap between them.
    expect(hidden(state, 'INT. HALL')).toBe('\n\nShe waits.\n\nMARGARET\nHello.');
    // The last scene runs to the end of the script.
    expect(hidden(state, 'EXT. YARD')).toBe('\n\nRain.');
  });

  it('folds a scene to the next section as well as the next heading', () => {
    const state = stateOf(text('INT. A - DAY', '', 'One.', '', '# Act two', '', 'INT. B - DAY'));
    expect(hidden(state, 'INT. A')).toBe('\n\nOne.');
    // A heading with nothing under it has nothing to fold.
    expect(hidden(state, 'INT. B')).toBeNull();
    expect(hidden(state, '# Act two')).toBe('\n\nINT. B - DAY');
  });

  it('folds a section over deeper sections, up to one as deep or shallower', () => {
    const state = stateOf(
      text(
        ...['# Act one', '', 'INT. A - DAY', '', 'One.', ''],
        ...['## Sequence', '', 'INT. B - DAY', '', 'Two.', ''],
        ...['### Beat', '', 'Three.', ''],
        ...['## Another sequence', '', 'Four.', ''],
        ...['# Act two', '', 'Five.'],
      ),
    );
    expect(hidden(state, '# Act one')).toMatch(/^\n\nINT\. A - DAY[\s\S]*Four\.$/);
    // `##` folds over its `###`, and stops at the next `##`.
    expect(hidden(state, '## Sequence')).toBe('\n\nINT. B - DAY\n\nTwo.\n\n### Beat\n\nThree.');
    expect(hidden(state, '### Beat')).toBe('\n\nThree.');
    expect(hidden(state, '## Another')).toBe('\n\nFour.');
    // A section as deep or deeper than the one before it ends that one; `# Act two` is the last.
    expect(hidden(state, '# Act two')).toBe('\n\nFive.');
  });

  it('folds a scene inside a section only to the end of the scene', () => {
    const state = stateOf(text('# Act', '', 'INT. A - DAY', 'One.', '', 'INT. B - DAY', 'Two.'));
    expect(hidden(state, 'INT. A')).toBe('\nOne.');
    expect(hidden(state, '# Act')).toBe('\n\nINT. A - DAY\nOne.\n\nINT. B - DAY\nTwo.');
  });

  it('has no fold on any other line, the title page, or the metadata block', () => {
    const state = stateOf(
      text(
        ...['Title: The Call', '', 'INT. A - DAY', '', 'MARGARET', 'Hello.', ''],
        ...['/* drafter', '{"v":1}', '*/'],
      ),
    );
    for (const line of ['Title:', 'MARGARET', 'Hello.', '{"v"']) {
      expect(hidden(state, line)).toBeNull();
    }
    // The last scene stops before the metadata, which belongs to no scene.
    expect(hidden(state, 'INT. A')).toBe('\n\nMARGARET\nHello.');
  });

  it('leaves a blank line and an empty script alone', () => {
    const state = stateOf(text('INT. A - DAY', '', 'One.'));
    expect(foldable(state, 13, 13)).toBeNull();
    const empty = stateOf('');
    expect(foldable(empty, 0, 0)).toBeNull();
  });

  it('follows the text as it changes', () => {
    const state = stateOf(text('INT. A - DAY', '', 'One.'));
    const next = state.update({ changes: { from: state.doc.length, insert: '\n\nTwo.' } }).state;
    expect(hidden(next, 'INT. A')).toBe('\n\nOne.\n\nTwo.');
  });
});

describe('a folded scene in a view', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  function mount(doc: string) {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({ state: stateOf(doc), parent });
    views.push(view);
    return view;
  }

  /** Folds the scene or section whose heading line starts with `heading`. */
  function fold(view: EditorView, heading: string) {
    const line = view.state.doc.lineAt(view.state.doc.toString().indexOf(heading));
    const range = foldable(view.state, line.from, line.to);
    if (!range) throw new Error(`No fold for ${heading}`);
    view.dispatch({ effects: foldEffect.of(range) });
  }

  /** The text of each line the view draws, a fold placeholder included. */
  const drawn = (view: EditorView) =>
    [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);

  const script = text(
    ...['# Act one', '', '= The act in a line.', '', 'INT. HALL - DAY', ''],
    ...['Action.', '', '= Margaret finds the letter.', '', '= A second synopsis.', ''],
    ...['EXT. YARD - DAY', '', 'Rain.'],
  );

  it('shows its heading and the first synopsis inside it', () => {
    const view = mount(script);
    fold(view, 'INT. HALL');
    expect(drawn(view)).toEqual([
      '# Act one',
      '',
      '= The act in a line.',
      '',
      'INT. HALL - DAY… Margaret finds the letter.',
      '',
      'EXT. YARD - DAY',
      '',
      'Rain.',
    ]);
    const placeholder = view.contentDOM.querySelector('.cm-foldPlaceholder');
    expect(placeholder?.textContent).toBe('… Margaret finds the letter.');
    expect(placeholder?.getAttribute('aria-label')).toBe('folded code');
  });

  it('shows a scene with no synopsis as the heading and an ellipsis', () => {
    const view = mount(script);
    fold(view, 'EXT. YARD');
    expect(drawn(view).slice(-2)).toEqual(['', 'EXT. YARD - DAY…']);
  });

  it('shows a folded section as its title, whatever synopsis lies inside', () => {
    const view = mount(script);
    fold(view, '# Act one');
    // Nothing follows the section, so the whole script folds into its title.
    expect(drawn(view)).toEqual(['# Act one…']);
    expect(view.contentDOM.querySelector('.cm-foldPlaceholder')?.textContent).toBe('…');
  });

  it('shows script text as text, never as markup', () => {
    const view = mount(text('INT. A - DAY', '', '= <img src=x onerror=alert(1)>', '', 'One.'));
    fold(view, 'INT. A');
    expect(view.contentDOM.querySelector('img:not(.cm-widgetBuffer)')).toBeNull();
    expect(view.contentDOM.querySelector('.cm-foldPlaceholder')?.textContent).toBe(
      '… <img src=x onerror=alert(1)>',
    );
  });
});
