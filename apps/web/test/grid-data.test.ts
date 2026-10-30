import { castOf, gridModel, type IsWord } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { cellTarget, columnSceneId, type GridView } from '../app/stats/grid-data';

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
