import {
  EditorSelection,
  EditorState,
  type Extension,
  MapMode,
  StateEffect,
  StateField,
  type Text,
  Transaction,
} from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { findMarkdownMeta } from '@drafter/markdown';
import { type NovelKind, type NovelNode, type NovelTree, novelStructure } from '@drafter/novel';
import { appChange } from '../editor/typewriter';
import { type MdNode, startOf } from '../markdown/render';
import { novelFacts, touchesStructure } from './carry';

// Focus on one chapter or one section (the Novel design, goal 4). The editor shows only that
// passage: the text before it and the text after it, up to the metadata comment, are hidden by
// two replacing decorations. Nothing is taken out of the document, so a save, a draft, a snapshot,
// and every export still write the whole book; only what the Source draws changes.
//
// Not CodeMirror's fold state: a fold has a placeholder to click, the fold gutter and the fold keys
// open it, and moving the cursor into it opens it, and any of these would leave one side of the
// book open while the bar still said "showing this chapter". These ranges are focus's own, so
// nothing but focus opens them, and the writer's own folds inside the passage still work.
//
// The focus follows the passage through every edit: a change that touches no line that could be
// structure (the gate `carry.ts` uses) moves its ends along; one that might is read again, and the
// passage is the node whose heading the old heading's start maps to, as `carryFacts` follows a
// node. A heading that is gone ends the focus, and the whole book shows (Review Focus 5). An
// unfocused editor pays nothing.
//
// The cursor stays in the passage. The arrow keys, a click, and Select All are held to it; a
// selection put outside it (a search match elsewhere, Go to in the Outline) ends the focus, so the
// writer always sees where the cursor is. Typing and deleting never reach the hidden text (a
// Backspace at the passage's first character, or Delete at its last, does nothing).

/** The focused passage: its node's id, where its text runs, and where the metadata comment starts. */
export interface Passage {
  id: string;
  /** The heading's start, which is the span's. */
  from: number;
  /** The span's end: the next sibling-or-ancestor's heading, or the comment. */
  to: number;
  /** Where the metadata comment starts, or the text's length when there is none. */
  meta: number;
}

/** Sets the focused passage, or ends the focus (null). Its offsets are in the document it is dispatched to. */
export const setPassage = StateEffect.define<Passage | null>();

/** The last offset the cursor may stand at: the end of the passage's last line, not the next line's start. */
function lastPos(doc: Text, passage: Passage): number {
  const { from, to } = passage;
  return to > from && doc.sliceString(to - 1, to) === '\n' ? to - 1 : to;
}

/** Whether `from`–`to` lies inside the passage, where the cursor and the writer's edits may go. */
function inside(doc: Text, passage: Passage, from: number, to: number): boolean {
  return from >= passage.from && to <= lastPos(doc, passage);
}

/** The node at `heading` (a heading's start), anywhere in the book, or null. */
function nodeWithHeadingAt(list: NovelNode[], heading: number): NovelNode | null {
  for (const node of list) {
    if (node.heading.from === heading) return node;
    if (node.span.from <= heading && heading < node.span.to) {
      const found = nodeWithHeadingAt(node.children, heading);
      if (found) return found;
    }
  }
  return null;
}

/** Where the metadata comment starts in `text`, or its length. */
const metaOf = (text: string) => findMarkdownMeta(text)?.from ?? text.length;

/** The passage that node `id` of `text` is, or null when there is no such node. */
export function passageOf(text: string, id: string, tree: NovelTree = novelStructure(text)) {
  const node = findIn(tree.nodes, id);
  if (!node) return null;
  return { id, from: node.span.from, to: node.span.to, meta: metaOf(text) } satisfies Passage;
}

function findIn(list: NovelNode[], id: string): NovelNode | null {
  for (const node of list) {
    if (node.id === id) return node;
    const found = findIn(node.children, id);
    if (found) return found;
  }
  return null;
}

/** The passage after `tr`'s changes, or null when its heading went with them. */
function follow(passage: Passage, tr: Transaction): Passage | null {
  const { changes } = tr;
  if (!touchesStructure(tr)) {
    // No heading changed, so no id did: the ends move along. A change at the comment (the facts
    // written again) keeps the comment's start, and so the last passage's end, where it was.
    return {
      id: passage.id,
      from: changes.mapPos(passage.from, 1),
      to: changes.mapPos(passage.to, -1),
      meta: changes.mapPos(passage.meta, -1),
    };
  }
  const text = tr.newDoc.toString();
  const tree = novelStructure(text);
  // The heading's first character, where it went; null when it was deleted. A heading deleted and
  // put back elsewhere (the Outline's move) is found by its id, which a move keeps.
  const at = changes.mapPos(passage.from, 1, MapMode.TrackDel);
  const node = at === null ? findIn(tree.nodes, passage.id) : nodeWithHeadingAt(tree.nodes, at);
  if (!node) return null;
  return { id: node.id, from: node.span.from, to: node.span.to, meta: metaOf(text) };
}

/** The ranges focus hides: the text before the passage, and the text after it up to the comment. */
function hiddenRanges(passage: Passage): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  if (passage.from > 0) out.push({ from: 0, to: passage.from });
  if (passage.meta > passage.to) out.push({ from: passage.to, to: passage.meta });
  return out;
}

/**
 * Hides whole lines, with nothing in their place and no line numbers: a block over a hidden range's
 * lines, which stops short of the line break that ends them, so no empty line is left behind.
 */
const HIDE = Decoration.replace({ block: true });

/** The decorations for `passage`'s hidden ranges, each its lines from the first's start to the last's end. */
function hiding(doc: Text, passage: Passage) {
  const out = [];
  for (const { from, to } of hiddenRanges(passage)) {
    const end = to > from && doc.sliceString(to - 1, to) === '\n' ? to - 1 : to;
    if (end > from) out.push(HIDE.range(from, end));
  }
  return Decoration.set(out);
}

/** The focused passage, with every offset kept up to date; null when the whole book shows. */
export const passageState = StateField.define<Passage | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setPassage)) return effect.value;
    if (!value) return null;
    let next: Passage | null = value;
    if (tr.docChanged) next = follow(value, tr);
    if (!next) return null;
    if (tr.selection || tr.docChanged) {
      const selection = tr.selection ?? tr.startState.selection.map(tr.changes);
      for (const range of selection.ranges) {
        if (!inside(tr.newDoc, next, range.from, range.to)) return null;
      }
    }
    if (
      next.id === value.id &&
      next.from === value.from &&
      next.to === value.to &&
      next.meta === value.meta
    ) {
      return value;
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const passage = state.field(field);
      return passage ? hiding(state.doc, passage) : Decoration.none;
    }),
});

/** The focused node's id, or null when the whole book shows. */
export const passageFocus: StateField<string | null> = StateField.define<string | null>({
  create: (state) => state.field(passageState, false)?.id ?? null,
  update: (_value, tr) => tr.state.field(passageState, false)?.id ?? null,
});

/** The focused passage of `state`, or null. */
export function focusedPassage(state: EditorState): Passage | null {
  return state.field(passageState, false) ?? null;
}

/** What `focusPassage` hides now, for a test: the ranges before and after the passage. */
export function focusRanges(state: EditorState): Array<{ from: number; to: number }> {
  const passage = focusedPassage(state);
  return passage ? hiddenRanges(passage) : [];
}

/**
 * Keeps the cursor in the passage and the hidden text out of the writer's reach: the keys and the
 * pointer's selections are held to the passage, and an edit typed or deleted into the hidden text
 * is dropped. The Outline's edits, the facts written, a replace from Find, and undo go through.
 */
const guard = EditorState.transactionFilter.of((tr) => {
  const passage = tr.startState.field(passageState, false);
  if (!passage || tr.effects.some((e) => e.is(setPassage))) return tr;
  const doc = tr.startState.doc;
  if (tr.docChanged) {
    if (tr.annotation(appChange) || tr.annotation(novelFacts)) return tr;
    const typed =
      (tr.isUserEvent('input') && !tr.isUserEvent('input.replace')) ||
      tr.isUserEvent('delete') ||
      tr.isUserEvent('move');
    if (!typed) return tr;
    let reaches = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      // The comment is not hidden (it starts after the passage, or the hidden text ends at it).
      if (!inside(doc, passage, fromA, toA) && fromA < passage.meta) reaches = true;
    });
    return reaches ? [] : tr;
  }
  if (!tr.selection || !tr.isUserEvent('select') || tr.isUserEvent('select.search')) return tr;
  const last = lastPos(doc, passage);
  const clamp = (pos: number) => Math.min(last, Math.max(passage.from, pos));
  const ranges = tr.selection.ranges.map((r) =>
    EditorSelection.range(clamp(r.anchor), clamp(r.head)),
  );
  const held = EditorSelection.create(ranges, tr.selection.mainIndex);
  if (held.eq(tr.selection)) return tr;
  return {
    selection: held,
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

/** Everything focus needs in the editor: the passage, its id, its hidden ranges, and the guard. */
export function passageFocusExtension(): Extension {
  return [passageState, passageFocus, guard];
}

/**
 * Focuses on node `id` (a chapter or a section), hiding the rest of the book, or shows the whole
 * book again (null). The document is not changed. A cursor outside the passage goes to the end of
 * its heading.
 */
export function focusPassage(view: EditorView, id: string | null): void {
  if (id === null) {
    if (!focusedPassage(view.state)) return;
    view.dispatch({
      effects: [
        setPassage.of(null),
        EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }),
      ],
    });
    return;
  }
  const text = view.state.doc.toString();
  const tree = novelStructure(text);
  const passage = passageOf(text, id, tree);
  if (!passage) return;
  const heading = findIn(tree.nodes, id)?.heading.to ?? passage.from;
  const { main } = view.state.selection;
  const keep =
    inside(view.state.doc, passage, main.from, main.to) && view.state.selection.ranges.length === 1;
  const head = keep ? main.head : heading;
  view.dispatch({
    effects: [setPassage.of(passage), EditorView.scrollIntoView(head, { y: 'center' })],
    ...(keep ? {} : { selection: { anchor: head } }),
  });
}

/** The innermost node of `kind` whose span holds `pos`: the chapter or the section at the cursor. */
export function passageAt(tree: NovelTree, pos: number, kind: NovelKind): NovelNode | null {
  let list = tree.nodes;
  let found: NovelNode | null = null;
  for (;;) {
    let hit: NovelNode | null = null;
    for (const node of list) {
      if (node.span.from > pos) break;
      hit = node;
    }
    if (!hit || pos >= hit.span.to) return found;
    if (hit.kind === kind) found = hit;
    list = hit.children;
  }
}

/** The 1-based number the bar gives node `id`: a chapter's place in the book, a section's in its chapter. */
export function passageNumber(tree: NovelTree, id: string): number | null {
  let chapters = 0;
  let result: number | null = null;
  const walk = (list: NovelNode[]) => {
    let sections = 0;
    for (const node of list) {
      if (result !== null) return;
      if (node.kind === 'chapter') chapters++;
      if (node.kind === 'section') sections++;
      if (node.id === id) {
        result = node.kind === 'section' ? sections : chapters;
        return;
      }
      walk(node.children);
    }
  };
  walk(tree.nodes);
  return result;
}

const HEADING_RANK: Partial<Record<NovelKind, number>> = { chapter: 1, section: 2 };

/**
 * The Preview's tree with only the focused passage in it: the blocks from the passage's heading
 * up to the next heading of the same rank or above (or, for a section, a scene break), and every
 * footnote's and link's definition wherever it was written, so the notes the passage refers to are
 * still listed. Found by the tree's own blocks, so a tree a moment behind the text still shows one
 * whole passage. A tree with no block near the heading is returned as it is.
 */
export function passageTree(tree: MdNode, passage: Passage, kind: NovelKind): MdNode {
  const children = tree.children ?? [];
  const isHeading = (node: MdNode) => node.type === 'heading' || node.type === 'thematicBreak';
  // The heading block nearest the passage's start.
  let start = -1;
  let best = Number.POSITIVE_INFINITY;
  children.forEach((node, index) => {
    if (!isHeading(node)) return;
    const at = startOf(node);
    if (at === undefined) return;
    const distance = Math.abs(at - passage.from);
    if (distance < best) {
      best = distance;
      start = index;
    }
  });
  if (start < 0) return tree;
  const rank = HEADING_RANK[kind] ?? 1;
  const ends = (node: MdNode) => {
    if (node.type === 'heading') return (node.depth ?? 1) <= rank;
    return node.type === 'thematicBreak' && rank === 2;
  };
  const kept: MdNode[] = [];
  let end = children.length;
  for (let i = start + 1; i < children.length; i++) {
    if (ends(children[i] as MdNode)) {
      end = i;
      break;
    }
  }
  children.forEach((node, index) => {
    const definition = node.type === 'definition' || node.type === 'footnoteDefinition';
    if ((index >= start && index < end) || definition) kept.push(node);
  });
  return { ...tree, children: kept };
}
