import type { SceneIndex } from '@drafter/outline';
import type { Absence } from './absences';
import type { Cast } from './figures';

// The character-by-scene grid's model (seeing-the-script design §4.4): a row per character in the
// Characters table's order, a column per scene, each cell the speeches there (or silent), its
// shade in four steps, and the long absences over the empty cells they span.

export interface GridModel {
  /** The characters' keys, in the Characters table's order. */
  rows: string[];
  /** One per scene. */
  columns: number;
  /** The cell at a row and column, or null where the character isn't in that scene. */
  cell(row: number, column: number): { speeches: number; silent: boolean } | null;
  /** 0 for none, then 1, 2–3, 4–6, and 7 or more speeches (Call 20). */
  shade(speeches: number): 0 | 1 | 2 | 3 | 4;
  /** Each long absence, over the columns from just after the scene left to just before the return. */
  gaps: Array<{ row: number; from: number; to: number; absence: Absence }>;
}

const ABSENT = -1;

function shade(speeches: number): 0 | 1 | 2 | 3 | 4 {
  if (speeches <= 0) return 0;
  if (speeches === 1) return 1;
  if (speeches <= 3) return 2;
  if (speeches <= 6) return 3;
  return 4;
}

/** The grid of `cast` over the scenes of `index`. */
export function gridModel(cast: Cast, index: SceneIndex): GridModel {
  const columns = index.scenes.length;
  const rows = cast.characters.map((c) => c.key);
  // Speeches per cell, row by row; ABSENT where the character isn't in the scene.
  const speeches = new Int32Array(rows.length * columns).fill(ABSENT);
  cast.byScene.forEach((scenes, r) => {
    for (const p of scenes) if (p.scene < columns) speeches[r * columns + p.scene] = p.speeches;
  });
  const gaps: GridModel['gaps'] = [];
  rows.forEach((key, row) => {
    for (const absence of cast.figures.get(key)?.absences ?? []) {
      gaps.push({ row, from: absence.from.scene + 1, to: absence.to.scene - 1, absence });
    }
  });
  return {
    rows,
    columns,
    cell(row, column) {
      if (row < 0 || row >= rows.length || column < 0 || column >= columns) return null;
      const n = speeches[row * columns + column] as number;
      return n === ABSENT ? null : { speeches: n, silent: n === 0 };
    },
    shade,
    gaps,
  };
}
