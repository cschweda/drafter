import { type Cast, type GridModel, gridModel } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import type { SceneIndex } from '@drafter/outline';
import { computed } from 'vue';
import { useCast } from '../cast/use-cast';
import { useEditor } from '../editor/session';
import { sceneNumber } from '../outline/labels';

// The character-by-scene grid's data (seeing-the-script design §4.4), for the grid, its List, and
// the long absences under them: the cast's grid model over the scenes it was worked out from, so
// the columns and the offsets Enter goes to agree with the cells while the writer types on.

export interface GridView {
  cast: Cast;
  index: SceneIndex;
  doc: Doc;
  model: GridModel;
  /** Each row's name, as first typed. */
  names: string[];
  /** Each column's scene number, as the script gives it ("12", or a written "12A"). */
  numbers: string[];
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

/** Puts the cursor where a cell goes, in the Source. */
export function goToCell(view: GridView, row: number, column: number): void {
  const at = cellTarget(view, row, column);
  if (at !== null) useEditor().goto(at);
}

/** Puts the cursor at a scene's heading, in the Source. */
export function goToScene(view: GridView, column: number): void {
  const scene = view.index.scenes[column];
  if (scene) useEditor().goto(scene.span.from);
}
