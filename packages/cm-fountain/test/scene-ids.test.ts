import { EditorState, type TransactionSpec } from '@codemirror/state';
import { parsedDoc, sceneIdAt, sceneIds, sceneMoved } from '@drafter/cm-fountain';
import { describe, expect, it } from 'vitest';

const SCRIPT = '# Act One\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n';

const stateOf = (doc: string) => EditorState.create({ doc, extensions: [parsedDoc, sceneIds] });
const at = (state: EditorState, text: string) => state.doc.toString().indexOf(text);
const idOf = (state: EditorState, text: string) => sceneIdAt(state, at(state, text));
const step = (state: EditorState, spec: TransactionSpec) => state.update(spec).state;

describe('sceneIds', () => {
  it('gives every heading and section an id', () => {
    const state = stateOf(SCRIPT);
    const ids = ['# Act One', 'INT. A', 'INT. B'].map((t) => idOf(state, t));
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(state.field(sceneIds).size).toBe(3);
    expect(sceneIdAt(state, at(state, 'One.'))).toBeUndefined();
  });

  it('keeps ids while the writer types in and between scenes', () => {
    let state = stateOf(SCRIPT);
    const a = idOf(state, 'INT. A');
    const b = idOf(state, 'INT. B');
    state = step(state, { changes: { from: at(state, 'One.'), insert: 'Line ' } });
    state = step(state, { changes: { from: 0, insert: 'Title: X\n\n' } });
    state = step(state, { changes: { from: at(state, 'Two.') + 4, insert: '\n\nMore.' } });
    expect(idOf(state, 'INT. A')).toBe(a);
    expect(idOf(state, 'INT. B')).toBe(b);
  });

  it('gives a new heading a new id and drops a deleted one', () => {
    let state = stateOf(SCRIPT);
    const known = new Set(state.field(sceneIds).values());
    const b = idOf(state, 'INT. B');
    state = step(state, {
      changes: { from: state.doc.length, insert: '\nINT. C - DAY\n\nThree.\n' },
    });
    const c = idOf(state, 'INT. C');
    expect(c).toBeDefined();
    expect(known.has(c as string)).toBe(false);
    const from = at(state, 'INT. B');
    state = step(state, { changes: { from, to: at(state, 'INT. C') } });
    expect([...state.field(sceneIds).values()]).not.toContain(b);
    expect(idOf(state, 'INT. C')).toBe(c);
  });

  it("keeps a renamed heading's id", () => {
    let state = stateOf(SCRIPT);
    const a = idOf(state, 'INT. A');
    const from = at(state, 'INT. A - DAY') + 'INT. '.length;
    state = step(state, { changes: { from, to: from + 1, insert: 'GARDEN' } });
    expect(idOf(state, 'INT. GARDEN - DAY')).toBe(a);
    // Even a whole new heading typed over the old one, line start kept.
    const line = at(state, 'INT. GARDEN - DAY');
    state = step(state, {
      changes: { from: line, to: line + 'INT. GARDEN - DAY'.length, insert: 'EXT. ROAD - NIGHT' },
    });
    expect(idOf(state, 'EXT. ROAD - NIGHT')).toBe(a);
  });

  it("carries a moved scene's id with an annotated move", () => {
    let state = stateOf(SCRIPT);
    const a = idOf(state, 'INT. A');
    const b = idOf(state, 'INT. B');
    // A down past B, as @drafter/outline writes it: cut with the gap before, put after B.
    const cutFrom = at(state, '# Act One') + '# Act One'.length;
    const cutTo = at(state, 'One.') + 'One.'.length;
    const end = at(state, 'Two.') + 'Two.'.length;
    const text = state.doc.sliceString(at(state, 'INT. A'), cutTo);
    const landed = end - (cutTo - cutFrom) + 2;
    state = step(state, {
      changes: [
        { from: cutFrom, to: cutTo },
        { from: end, insert: `\n\n${text}` },
      ],
      annotations: sceneMoved.of([{ from: SCRIPT.indexOf('INT. A'), to: landed }]),
    });
    expect(state.doc.toString()).toBe(
      '# Act One\n\nINT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n',
    );
    expect(idOf(state, 'INT. A')).toBe(a);
    expect(idOf(state, 'INT. B')).toBe(b);
  });

  it('gives a cut-and-pasted scene a new id', () => {
    let state = stateOf(SCRIPT);
    const a = idOf(state, 'INT. A');
    const from = at(state, 'INT. A');
    const to = at(state, 'INT. B');
    const text = state.doc.sliceString(from, to);
    state = step(state, { changes: { from, to } });
    state = step(state, { changes: { from: state.doc.length, insert: `\n${text}` } });
    expect(idOf(state, 'INT. A')).toBeDefined();
    expect(idOf(state, 'INT. A')).not.toBe(a);
  });
});
