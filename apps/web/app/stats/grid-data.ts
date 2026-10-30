import { type Cast, type GridModel, gridModel } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import type { OutlineItem, SceneIndex } from '@drafter/outline';
import { computed } from 'vue';
import { useCast } from '../cast/use-cast';
import { useEditor } from '../editor/session';
import { sceneNumber } from '../outline/labels';
import { useOutline } from '../outline/use-outline';

// The character-by-scene grid's data (seeing-the-script design §4.4), for the grid, its List, and
// the long absences under them: the cast's grid model over the scenes it was worked out from, so
// the columns agree with the cells while the writer types on. The offsets are the basis's: going
// there finds the column's scene again by its id, now, and moves the offset by as much as that
// scene has moved (`liveTarget`), so an edit above it since the cast never lands Enter elsewhere.

export interface GridView {
  cast: Cast;
  index: SceneIndex;
  doc: Doc;
  model: GridModel;
  /** Each row's name, as first typed. */
  names: string[];
  /** Each column's scene number, as the script gives it ("12", or a written "12A"). */
  numbers: string[];
  /** Each column's scene's session id, as it was when the cast was worked out. */
  ids: readonly string[];
}

/** The grid's data from the cast the Stats tab holds; null until the cast is in. */
export function useGridView() {
  const { cast, basis } = useCast();
  return computed<GridView | null>(() => {
    const c = cast.value;
    const b = basis.value;
    if (!c || !b) return null;
    return {
      cast: c,
      index: b.index,
      doc: b.doc,
      model: gridModel(c, b.index),
      names: c.characters.map((character) => character.name),
      numbers: b.index.scenes.map(sceneNumber),
      ids: b.ids,
    };
  });
}

/**
 * Where a cell goes: the character's first cue in the scene, or for a silent cell the first mention
 * of their name in its action, or for an empty cell the scene's heading.
 */
export function cellTarget(view: GridView, row: number, column: number): number | null {
  const scene = view.index.scenes[column];
  if (!scene) return null;
  const cell = view.model.cell(row, column);
  const key = view.cast.characters[row]?.key;
  if (cell && !cell.silent && key) {
    const cue = scene.speeches.find((speech) => speech.name.toUpperCase() === key);
    const block = cue ? view.doc.blocks[cue.block] : undefined;
    if (block) return block.span.from;
  }
  if (cell?.firstMention != null) return cell.firstMention;
  return scene.span.from;
}

/**
 * The session id of a column's scene, for Scaffold for this scene: the scene the column was drawn
 * from, by its id, so a scene added above it since doesn't put another in its place. Null past the
 * last column.
 */
export function columnSceneId(view: GridView, column: number): string | null {
  return view.ids[column] ?? null;
}

/** A scene of the script as it is now, by its session id (`useOutline().itemById`). */
export type FindScene = (id: string) => Pick<OutlineItem, 'kind' | 'span'> | undefined;

/**
 * Where a cell goes in the script as it is now: the column's scene found by its id (`find`), and
 * the cell's place in it (`cellTarget`, or the heading when `row` is null) moved by as much as the
 * scene's start has moved since the cast, kept inside the scene. Null when the scene is gone.
 */
export function liveTarget(
  view: GridView,
  row: number | null,
  column: number,
  find: FindScene,
): number | null {
  const then = view.index.scenes[column];
  const id = view.ids[column];
  const now = id === undefined ? undefined : find(id);
  if (!then || !now || now.kind !== 'scene') return null;
  const at = row === null ? then.span.from : cellTarget(view, row, column);
  if (at === null) return null;
  const moved = now.span.from + (at - then.span.from);
  return Math.min(now.span.to, Math.max(now.span.from, moved));
}

/** The menu's cell found again, by the character's key and the scene's id; null when either is gone. */
export function placeOf(
  view: GridView,
  key: string,
  sceneId: string,
): { row: number; column: number } | null {
  const row = view.model.rows.indexOf(key);
  const column = view.ids.indexOf(sceneId);
  return row < 0 || column < 0 ? null : { row, column };
}

const findNow: FindScene = (id) => useOutline().itemById(id);

/** Puts the cursor where a cell goes, in the Source as it is now. */
export function goToCell(view: GridView, row: number, column: number): void {
  const at = liveTarget(view, row, column, findNow);
  if (at !== null) useEditor().goto(at);
}

/** Puts the cursor at a scene's heading, where the scene is now, in the Source. */
export function goToScene(view: GridView, column: number): void {
  const at = liveTarget(view, null, column, findNow);
  if (at !== null) useEditor().goto(at);
}
