import {
  Annotation,
  EditorState,
  type Extension,
  type Text,
  type Transaction,
} from '@codemirror/state';
import { findMarkdownMeta } from '@drafter/markdown';
import {
  carryFacts,
  type NovelFacts,
  type NovelTree,
  novelStructure,
  readFacts,
  writeFacts,
} from '@drafter/novel';
import { isNovel } from './kind';

// A novel's facts (status, synopsis, target) are kept by each heading's id, and an id is the
// heading's text and its place among same-named headings. So an edit that renames, adds, or removes
// a heading can change ids, and the facts follow their headings in the same transaction: undo takes
// back the text and the facts at once. Typing in a paragraph never changes an id (ordinals count
// headings only), so a transaction that touches no line that could be structure is let through
// without reading the book at all.

/** Marks a transaction that writes the facts itself (the Outline's status, synopsis, and moves). */
export const novelFacts = Annotation.define<boolean>();

/**
 * A line that is, or may make, structure: a heading, a code fence (which hides the headings after
 * it), or a run of `-`, `*`, `_`, or `=` (a scene break, or a setext underline). Generous: a line it
 * matches costs a read of the book, one it misses would lose facts.
 */
const CANDIDATE = /^ {0,3}(?:#|`{3}|~{3}|[-*_=][-*_= \t]*$)/;
/** Past this many lines, a change is taken to touch structure rather than scanned. */
const MAX_LINES = 2000;

/**
 * Whether the lines `from`–`to` of `doc` could be structure, or change it: the lines themselves,
 * and the lines after them to the end of their paragraph, whose setext underline takes its title
 * from every line of it.
 */
function touchesIn(doc: Text, from: number, to: number): boolean {
  let n = doc.lineAt(from).number;
  const last = doc.lineAt(to).number;
  if (last - n > MAX_LINES) return true;
  for (; n <= last; n++) if (CANDIDATE.test(doc.line(n).text)) return true;
  for (let k = 0; n <= doc.lines; n++, k++) {
    if (k > MAX_LINES) return true;
    const text = doc.line(n).text;
    if (CANDIDATE.test(text)) return true;
    if (text.trim() === '') return false;
  }
  return false;
}

/** Whether a change of `tr` touches a line that is, or may become, structure, before or after. */
export function touchesStructure(tr: Transaction): boolean {
  let touches = false;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (touches) return;
    touches = touchesIn(tr.startState.doc, fromA, toA) || touchesIn(tr.newDoc, fromB, toB);
  });
  return touches;
}

/** The facts as one comparable string: the same facts, in any key order, are the same. */
function factsKey(facts: NovelFacts): string {
  const ids = Object.keys(facts.nodes).sort();
  return JSON.stringify([facts.bookTarget ?? null, ids.map((id) => [id, facts.nodes[id]])]);
}

export function sameFacts(a: NovelFacts, b: NovelFacts): boolean {
  return factsKey(a) === factsKey(b);
}

/**
 * The one change that writes `facts` into `text`'s metadata comment (`writeFacts`), in `text`'s
 * offsets: the comment replaced where it is, or a new one added at the end. Null when nothing
 * would change.
 */
export function factsChange(
  text: string,
  facts: NovelFacts,
): { from: number; to: number; insert: string } | null {
  const written = writeFacts(text, facts);
  if (written === text) return null;
  const block = findMarkdownMeta(text);
  const from = block?.from ?? text.length;
  const to = block?.to ?? text.length;
  const tail = text.length - to;
  if (written.startsWith(text.slice(0, from)) && written.endsWith(text.slice(to))) {
    return { from, to, insert: written.slice(from, written.length - tail) };
  }
  return { from: 0, to: text.length, insert: written };
}

/** Whether the last non-blank line of `doc` is a metadata comment naming the novel template. */
export function docIsNovel(doc: Text): boolean {
  let n = doc.lines;
  while (n > 1 && doc.line(n).text.trim() === '') n--;
  return isNovel(doc.line(n).text);
}

export interface CarryOptions {
  /** Whether the editor holds a Markdown document now; a script's lines are never read. */
  active: () => boolean;
  /** The structure reader, for a test that counts the reads. */
  structure?: (text: string) => NovelTree;
}

/**
 * The editor extension that carries a novel's facts through every edit to its structure, in the
 * transaction itself. (A transaction filter, not an extender: an extender can't add changes.)
 */
export function carryNovelFacts({ active, structure = novelStructure }: CarryOptions): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !active()) return tr;
    if (tr.annotation(novelFacts) || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr;
    if (!touchesStructure(tr)) return tr;
    if (!docIsNovel(tr.startState.doc)) return tr;
    const before = tr.startState.doc.toString();
    const facts = readFacts(before);
    if (Object.keys(facts.nodes).length === 0) return tr;
    // An edit to the comment itself (or one replacing everything) says what the facts are.
    const block = findMarkdownMeta(before);
    if (block) {
      let touched = false;
      tr.changes.iterChangedRanges((fromA, toA) => {
        if (toA >= block.from && fromA <= block.to) touched = true;
      });
      if (touched) return tr;
    }
    const after = tr.newDoc.toString();
    const carried = carryFacts(facts, structure(before), structure(after), (pos, assoc) =>
      tr.changes.mapPos(pos, assoc),
    );
    if (sameFacts(carried, readFacts(after))) return tr;
    const change = factsChange(after, carried);
    if (!change) return tr;
    return [tr, { changes: change, sequential: true }];
  });
}
