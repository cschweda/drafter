import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  type CursorElement,
  cursorElement,
  onCursorElement,
  parsedDoc,
} from '@drafter/cm-fountain';
import { afterEach, describe, expect, it } from 'vitest';

const text = (...rows: string[]) => rows.join('\n');

/** The element at the `|` in `marked`. */
function at(marked: string): CursorElement | null {
  const bar = marked.indexOf('|');
  const doc = marked.slice(0, bar) + marked.slice(bar + 1);
  const state = EditorState.create({ doc, selection: { anchor: bar }, extensions: [parsedDoc] });
  return cursorElement(state);
}

const script = (cursor: string) =>
  text(
    ...['Title: The Call', 'Author: A. Writer', ''],
    ...['INT. HALL - DAY', '', 'She waits.', 'Rain.', ''],
    ...['MARGARET', '(quietly)', 'Hello,', 'again.', ''],
    cursor,
  );

describe('cursorElement', () => {
  it('reports the block, line, and kind under the cursor', () => {
    const base = script('');
    const where = (needle: string, offset = 0) =>
      at(
        `${base.slice(0, base.indexOf(needle) + offset)}|${base.slice(base.indexOf(needle) + offset)}`,
      );
    expect(where('INT. HALL', 4)).toEqual({ blockIndex: 0, lineIndex: 0, kind: 'scene_heading' });
    expect(where('She waits.')).toEqual({ blockIndex: 1, lineIndex: 0, kind: 'action' });
    expect(where('Rain.', 5)).toEqual({ blockIndex: 1, lineIndex: 1, kind: 'action' });
    expect(where('MARGARET')).toEqual({ blockIndex: 2, lineIndex: 0, kind: 'character' });
    expect(where('(quietly)', 3)).toEqual({ blockIndex: 3, lineIndex: 0, kind: 'parenthetical' });
    // A speech of two lines is one block.
    expect(where('again.', 2)).toEqual({ blockIndex: 4, lineIndex: 1, kind: 'dialogue' });
  });

  it('reports null on a blank line, and the title page as blockIndex -1', () => {
    const base = script('');
    const index = (needle: string) => base.indexOf(needle);
    const cursor = (pos: number) => at(`${base.slice(0, pos)}|${base.slice(pos)}`);
    expect(cursor(index('INT. HALL') - 1)).toBeNull();
    expect(cursor(index('She waits.') - 1)).toBeNull();
    expect(at(script('|'))).toBeNull();
    expect(cursor(index('Title'))).toEqual({ blockIndex: -1, lineIndex: 0, kind: 'title_page' });
    expect(cursor(index('Author') + 3)).toEqual({
      blockIndex: -1,
      lineIndex: 1,
      kind: 'title_page',
    });
    // The end of the title page's last line is still on it.
    expect(cursor(index('Author') + 'Author: A. Writer'.length)?.kind).toBe('title_page');
  });

  it('has no element in an empty script', () => {
    expect(at('|')).toBeNull();
  });

  it('keeps a line of two spaces inside the speech it joins', () => {
    expect(at(text('MARGARET', 'Hello.', '  |', 'Again.'))).toEqual({
      blockIndex: 1,
      lineIndex: 1,
      kind: 'dialogue',
    });
    // A line of one space is blank.
    expect(at(text('MARGARET', 'Hello.', ' |', 'Again.'))).toBeNull();
  });

  it('follows the main selection head, not its start', () => {
    const doc = text('INT. A - DAY', '', 'One.', '', 'Two.');
    const state = EditorState.create({
      doc,
      selection: EditorSelection.single(0, doc.length),
      extensions: [parsedDoc],
    });
    expect(cursorElement(state)).toEqual({ blockIndex: 2, lineIndex: 0, kind: 'action' });
  });

  it('counts lines in a script with CRLF line endings', () => {
    const state = EditorState.create({
      doc: 'MARGARET\r\nHello.\r\nAgain.',
      selection: { anchor: 18 },
      extensions: [parsedDoc],
    });
    expect(cursorElement(state)).toEqual({ blockIndex: 1, lineIndex: 1, kind: 'dialogue' });
  });
});

describe('onCursorElement', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  function mount(doc: string) {
    const calls: Array<CursorElement | null> = [];
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 0 },
        extensions: [onCursorElement((element) => calls.push(element))],
      }),
      parent,
    });
    views.push(view);
    return { view, calls };
  }

  const doc = text('INT. A - DAY', '', 'One.', 'More.', '', 'Two.');

  it('calls back when the element under the cursor changes, and only then', () => {
    const { view, calls } = mount(doc);
    // Nothing is reported before a change: the app reads the first value with `cursorElement`.
    expect(calls).toEqual([]);
    // Within the same line: no change.
    view.dispatch({ selection: { anchor: 3 } });
    expect(calls).toEqual([]);
    // To the action's first line, then its second, then the blank line, then the last block.
    view.dispatch({ selection: { anchor: doc.indexOf('One.') } });
    view.dispatch({ selection: { anchor: doc.indexOf('More.') + 1 } });
    view.dispatch({ selection: { anchor: doc.indexOf('More.') + 6 } });
    view.dispatch({ selection: { anchor: doc.indexOf('Two.') } });
    expect(calls).toEqual([
      { blockIndex: 1, lineIndex: 0, kind: 'action' },
      { blockIndex: 1, lineIndex: 1, kind: 'action' },
      null,
      { blockIndex: 2, lineIndex: 0, kind: 'action' },
    ]);
  });

  it('reports a move to a blank line as null, once', () => {
    const { view, calls } = mount(doc);
    view.dispatch({ selection: { anchor: 12 } });
    view.dispatch({ selection: { anchor: 13 } });
    view.dispatch({ selection: { anchor: 13 } });
    expect(calls).toEqual([null]);
  });

  it('reports an edit that changes the element, though the cursor stays', () => {
    const { view, calls } = mount(doc);
    view.dispatch({ selection: { anchor: doc.indexOf('Two.') } });
    expect(calls).toHaveLength(1);
    // Typing in the line changes nothing the callback reports.
    view.dispatch({
      changes: { from: doc.indexOf('Two.'), insert: 'x' },
      selection: { anchor: doc.indexOf('Two.') + 1 },
    });
    expect(calls).toHaveLength(1);
    // A heading typed above shifts the block's index, which is a change.
    view.dispatch({ changes: { from: 0, insert: 'EXT. B - DAY\n\n' } });
    expect(calls.at(-1)).toEqual({ blockIndex: 3, lineIndex: 0, kind: 'action' });
    // Making the line a heading changes its kind.
    const pos = view.state.doc.toString().indexOf('xTwo.');
    view.dispatch({ changes: { from: pos, to: pos + 1, insert: 'INT. ' } });
    expect(calls.at(-1)).toEqual({ blockIndex: 3, lineIndex: 0, kind: 'scene_heading' });
  });
});
