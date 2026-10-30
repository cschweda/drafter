import { Annotation, type EditorState, MapMode, StateEffect, StateField } from '@codemirror/state';
import type { Doc } from '@drafter/fountain';
import { parsedDoc } from './state';

// Scene identity (Phase 2 design §5.2): each scene heading and section has an id for as long as
// the editor holds the script, so a view keeps its selection and focus while the writer types,
// and a moved scene keeps its own. Ids live in the session only; reopening gives new ones.
//
// After each change every heading's offset is mapped through it, the way CodeMirror maps any
// position, and a heading found at a mapped offset keeps its id. A heading the writer retyped
// from its line's start keeps its id too, unless another heading's offset lands there first. A
// move Drafter makes says where each moved heading went (`sceneMoved`), so their ids go with
// them rather than to the place they left. A scene cut and pasted by hand gets a new id.

let counter = 0;
const nextId = () => `scene-${++counter}`;

/**
 * On a transaction that moves text: each moved scene or section heading's offset before the
 * change, and its offset after it. `@drafter/outline`'s moves report these.
 */
export const sceneMoved = Annotation.define<ReadonlyArray<{ from: number; to: number }>>();

/**
 * The same as `sceneMoved`, as an effect, which an editor's history can invert so an undone move
 * gives the scene its id back (`invertSceneMoves`).
 */
export const sceneMovedEffect = StateEffect.define<ReadonlyArray<{ from: number; to: number }>>();

/**
 * For `invertedEffects` from `@codemirror/commands`: a move's effect, the other way round, so undo
 * and redo carry each moved heading's id back and forth.
 */
export function invertSceneMoves(transaction: {
  effects: readonly StateEffect<unknown>[];
}): StateEffect<unknown>[] {
  const out: StateEffect<unknown>[] = [];
  for (const effect of transaction.effects) {
    if (effect.is(sceneMovedEffect)) {
      out.push(sceneMovedEffect.of(effect.value.map(({ from, to }) => ({ from: to, to: from }))));
    }
  }
  return out;
}

/** The offsets of the blocks that have ids: every scene heading and every section. */
function headingOffsets(doc: Doc): number[] {
  const out: number[] = [];
  for (const block of doc.blocks) {
    if (block.kind === 'scene_heading' || block.kind === 'section') out.push(block.span.from);
  }
  return out;
}

/** Each scene heading's and section's start offset, and its session id. Needs `parsedDoc` before it. */
export const sceneIds: StateField<ReadonlyMap<number, string>> = StateField.define({
  create(state) {
    const ids = new Map<number, string>();
    for (const offset of headingOffsets(state.field(parsedDoc))) ids.set(offset, nextId());
    return ids;
  },
  update(ids, transaction) {
    if (!transaction.docChanged) return ids;
    const offsets = headingOffsets(transaction.state.field(parsedDoc));
    const heading = new Set(offsets);
    const claimed = new Map<number, string>();
    const claim = (offset: number | null, id: string) => {
      if (offset === null || !heading.has(offset) || claimed.has(offset)) return false;
      claimed.set(offset, id);
      return true;
    };
    const moved = [
      ...(transaction.annotation(sceneMoved) ?? []),
      ...transaction.effects.flatMap((e) => (e.is(sceneMovedEffect) ? e.value : [])),
    ];
    const movedFrom = new Set<number>();
    for (const { from, to } of moved) {
      const id = ids.get(from);
      movedFrom.add(from);
      if (id) claim(to, id);
    }
    const { changes } = transaction;
    // First every heading whose first character is still there, mapped forward, so text inserted at
    // a heading's start (a whole heading pasted there) goes before it and the heading keeps its id;
    // then those retyped from the start.
    const waiting: Array<[number, string]> = [];
    for (const [offset, id] of ids) {
      if (movedFrom.has(offset)) continue;
      if (!claim(changes.mapPos(offset, 1, MapMode.TrackAfter), id)) waiting.push([offset, id]);
    }
    for (const [offset, id] of waiting) {
      if (!claim(changes.mapPos(offset, -1, MapMode.TrackDel), id)) {
        claim(changes.mapPos(offset, 1, MapMode.TrackDel), id);
      }
    }
    const next = new Map<number, string>();
    for (const offset of offsets) next.set(offset, claimed.get(offset) ?? nextId());
    return next;
  },
});

/** The id of the scene heading or section that starts at `offset`, if one does. */
export function sceneIdAt(state: EditorState, offset: number): string | undefined {
  return state.field(sceneIds, false)?.get(offset);
}
