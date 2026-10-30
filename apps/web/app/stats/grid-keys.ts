// The character-by-scene grid's keys (seeing-the-script design §4.4): the ARIA grid pattern over
// its cells, a row per character and a column per scene. The grid is one Tab stop; the headers
// aren't stops of their own.

/** A cell: the character's row and the scene's column, from 0. */
export interface GridPlace {
  row: number;
  column: number;
}

/** How far Page Up and Page Down move: ten scenes. */
const PAGE = 10;

/**
 * Where `key` takes focus from `at`, or 'enter' (go to the cue or the first mention), 'menu' (the
 * context-menu key; the grid maps Shift+F10 to it), or null when the key isn't the grid's. Arrows
 * stop at the edges, keeping focus where it is. `ctrl` is Ctrl (or Cmd) held: with Home and End it
 * goes to the corners, and with an arrow it is nobody's key here.
 */
export function gridKey(
  model: { rows: number; columns: number },
  at: GridPlace,
  key: string,
  ctrl: boolean,
): GridPlace | 'enter' | 'menu' | null {
  const { rows, columns } = model;
  if (rows === 0 || columns === 0) return null;
  const place = (row: number, column: number): GridPlace => ({
    row: Math.min(rows - 1, Math.max(0, row)),
    column: Math.min(columns - 1, Math.max(0, column)),
  });
  const { row, column } = at;
  if (key === 'Home') return ctrl ? place(0, 0) : place(row, 0);
  if (key === 'End') return ctrl ? place(rows - 1, columns - 1) : place(row, columns - 1);
  if (ctrl) return null;
  switch (key) {
    case 'ArrowRight':
      return place(row, column + 1);
    case 'ArrowLeft':
      return place(row, column - 1);
    case 'ArrowDown':
      return place(row + 1, column);
    case 'ArrowUp':
      return place(row - 1, column);
    case 'PageDown':
      return place(row, column + PAGE);
    case 'PageUp':
      return place(row, column - PAGE);
    case 'Enter':
      return 'enter';
    case 'ContextMenu':
      return 'menu';
    default:
      return null;
  }
}

/** The scene the Tab stop's column was drawn from, by its id, and the columns' ids now. */
export interface HeldScene {
  id: string | undefined;
  ids: readonly string[];
}

/**
 * Where the Tab stop goes when the cast is worked out again: to the row of the character it was on
 * (`key`), as a re-ranking moves them; else the same row number, within the rows. The column goes
 * with its scene (`scene`, by id) when a scene was added or taken out before it; else it keeps its
 * number, within the scenes.
 */
export function holdPlace(
  key: string | undefined,
  place: GridPlace,
  rows: readonly string[],
  columns: number,
  scene?: HeldScene,
): GridPlace {
  const found = key === undefined ? -1 : rows.indexOf(key);
  const column = scene?.id === undefined ? -1 : scene.ids.indexOf(scene.id);
  return {
    row: found >= 0 ? found : Math.min(place.row, Math.max(0, rows.length - 1)),
    column: column >= 0 ? column : Math.min(place.column, Math.max(0, columns - 1)),
  };
}

/**
 * `holdPlace`, and the character and scene that have the stop afterwards: the same ones when they
 * are still there, else whoever has that row and that column now, so the cast after next follows
 * them and not a row or column number.
 */
export function holdStop(
  key: string | undefined,
  place: GridPlace,
  rows: readonly string[],
  columns: number,
  scene?: HeldScene,
): { key: string | undefined; sceneId: string | undefined; place: GridPlace } {
  const next = holdPlace(key, place, rows, columns, scene);
  return { key: rows[next.row], sceneId: scene?.ids[next.column], place: next };
}
