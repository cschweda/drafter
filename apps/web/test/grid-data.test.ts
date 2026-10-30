import { castOf, gridModel, type IsWord } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import {
  cellTarget,
  columnSceneId,
  type GridView,
  liveTarget,
  placeOf,
} from '../app/stats/grid-data';

// Where Enter on a grid cell goes (seeing-the-script design §4.4): the character's first cue in the
// scene, the first mention for a silent cell, and the scene's heading for an empty one.

const screenplay = builtins['us-screenplay'] as Template;
const noWords: IsWord = () => false;

/** Original text for this test: two keepers in a lighthouse. */
const LAMP = `INT. LAMP ROOM - NIGHT

WREN trims the wick.

ODO
The stairs are longer at night.

WREN
They are the same stairs.

EXT. GALLERY - NIGHT

ODO leans on the rail. WREN watches from the door.

ODO
Ships tonight?
`;

function viewOf(text: string): GridView {
  const doc = parse(text);
  const index = sceneIndex(doc, screenplay, null);
  const cast = castOf(index, doc, screenplay, null, noWords);
  return {
    cast,
    index,
    doc,
    model: gridModel(cast, index),
    names: cast.characters.map((c) => c.name),
    numbers: index.scenes.map((s) => String(s.ordinal)),
    ids: index.scenes.map((_, i) => `scene-${i + 1}`),
  };
}

describe('where a grid cell goes', () => {
  test('a speaking cell goes to the first cue, a silent one to the first mention, an empty one to the heading', () => {
    const view = viewOf(LAMP);
    const row = (key: string) => view.cast.characters.findIndex((c) => c.key === key);
    const at = (needle: string, from = 0) => LAMP.indexOf(needle, from);
    // WREN's first cue in scene 1 is the cue, not the action that names WREN first.
    expect(cellTarget(view, row('WREN'), 0)).toBe(at('WREN\nThey'));
    expect(cellTarget(view, row('ODO'), 0)).toBe(at('ODO\nThe stairs'));
    // Silent in scene 2: the first mention in its action.
    expect(view.model.cell(row('WREN'), 1)?.silent).toBe(true);
    expect(cellTarget(view, row('WREN'), 1)).toBe(at('WREN watches'));
    // Past the last scene: nowhere.
    expect(cellTarget(view, row('WREN'), 2)).toBeNull();
    // An empty cell: a third character, only in the second scene, has none in the first.
    const three = viewOf(`${LAMP}\nINT. STORE ROOM - DAY\n\nPELL\nWho moved the oil?\n`);
    const pell = three.cast.characters.findIndex((c) => c.key === 'PELL');
    expect(three.model.cell(pell, 0)).toBeNull();
    expect(cellTarget(three, pell, 0)).toBe(0);
  });
});

describe('Scaffold for a column’s scene', () => {
  test('is the scene the column was drawn from, by its id, whatever was added above since', () => {
    // The cast's scenes are the cabin and the gallery; the writer has since added a scene first,
    // so the gallery is the live index's third scene. The column still names the gallery.
    const view = { ...viewOf(LAMP), ids: ['lamp-room', 'gallery'] };
    expect(columnSceneId(view, 1)).toBe('gallery');
    expect(columnSceneId(view, 0)).toBe('lamp-room');
    expect(columnSceneId(view, 2)).toBeNull();
  });
});

describe('a cell’s place in the script as it is now', () => {
  /** The live script's scenes, found by the same ids as the view's. */
  function now(text: string) {
    const index = sceneIndex(parse(text), screenplay, null);
    const ids = ['scene-1', 'scene-2', 'scene-3'];
    return (id: string) => index.scenes[ids.indexOf(id)];
  }

  test('text added above the scene after the cast: Enter still lands on the cue', () => {
    const view = viewOf(LAMP);
    const row = view.cast.characters.findIndex((c) => c.key === 'ODO');
    const later = `A long night begins.\n\n${LAMP}`;
    const target = liveTarget(view, row, 1, now(later.replace('A long night begins.\n\n', '')));
    expect(target).toBe(LAMP.indexOf('ODO\nShips'));
    // Now with the text above: the gallery has moved down, and so has the cue.
    const moved = (id: string) =>
      sceneIndex(parse(later), screenplay, null).scenes[['scene-1', 'scene-2'].indexOf(id)];
    expect(liveTarget(view, row, 1, moved)).toBe(later.indexOf('ODO\nShips'));
    // A silent cell's mention, and an empty cell's heading, move too.
    const wren = view.cast.characters.findIndex((c) => c.key === 'WREN');
    expect(liveTarget(view, wren, 1, moved)).toBe(later.indexOf('WREN watches'));
  });

  test('a heading goes to the scene where it is now; a scene that is gone goes nowhere', () => {
    const view = viewOf(LAMP);
    const later = `INT. CELLAR - DAY\n\nDamp.\n\n${LAMP}`;
    const index = sceneIndex(parse(later), screenplay, null);
    // The cellar is new: the view's two scenes are the live second and third.
    const find = (id: string) => index.scenes[['scene-1', 'scene-2'].indexOf(id) + 1];
    expect(liveTarget(view, null, 1, find)).toBe(later.indexOf('EXT. GALLERY'));
    expect(liveTarget(view, null, 1, () => undefined)).toBeNull();
  });

  test('the menu’s character and scene are found again by key and id', () => {
    const view = viewOf(LAMP);
    const odo = view.cast.characters.findIndex((c) => c.key === 'ODO');
    expect(placeOf(view, 'ODO', 'scene-2')).toEqual({ row: odo, column: 1 });
    expect(placeOf(view, 'PIA', 'scene-2')).toBeNull();
    expect(placeOf(view, 'ODO', 'gone')).toBeNull();
  });
});
