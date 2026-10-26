import { EditorState, type Extension } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { fountainDecorations, parsedDoc } from '@drafter/cm-fountain';

/** A range of positions in the editor's text: `from` inclusive, `to` exclusive. */
export interface Span {
  from: number;
  to: number;
}

/** One decoration read back from a set. A line decoration is empty: `from` equals `to`. */
export interface Found extends Span {
  class: string;
}

/** The byte-order mark, spelled out so no formatter turns it into an invisible literal. */
export const BOM = String.fromCharCode(0xfeff);

/** An editor state that holds the parse. */
export const stateOf = (doc: string, extensions: Extension[] = []) =>
  EditorState.create({ doc, extensions: [parsedDoc, ...extensions] });

/** Every decoration in a set, in document order. */
export function found(set: DecorationSet): Found[] {
  const out: Found[] = [];
  for (const cursor = set.iter(); cursor.value; cursor.next()) {
    out.push({ from: cursor.from, to: cursor.to, class: cursor.value.spec.class });
  }
  return out;
}

/** The decorations for the ranges given, or for the whole document when there are none. */
export const decorate = (
  state: EditorState,
  ranges: readonly Span[] = [{ from: 0, to: state.doc.length }],
): Found[] => found(fountainDecorations(state, ranges));

/** The line decorations of a whole document, each as `[the line's text, its class]`. */
export function lineClasses(doc: string): Array<[string, string]> {
  const state = stateOf(doc);
  return decorate(state)
    .filter((deco) => deco.from === deco.to)
    .map((deco) => [state.doc.lineAt(deco.from).text, deco.class]);
}

/** The text that each mark of a class covers in a whole document, in document order. */
export function marked(doc: string, cls: string): string[] {
  const state = stateOf(doc);
  return decorate(state)
    .filter((deco) => deco.from < deco.to && deco.class === cls)
    .map((deco) => state.sliceDoc(deco.from, deco.to));
}
