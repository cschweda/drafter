import { describe, expect, test } from 'vitest';
import { gridKey, holdPlace, holdStop } from '../app/stats/grid-keys';

// The character-by-scene grid's keys (seeing-the-script design §4.4): the ARIA grid pattern over
// the cells, a row per character and a column per scene.
const model = { rows: 4, columns: 30 };
const at = (row: number, column: number) => ({ row, column });

describe('the grid’s keys', () => {
  test('arrows move and stop at edges', () => {
    expect(gridKey(model, at(1, 5), 'ArrowRight', false)).toEqual(at(1, 6));
    expect(gridKey(model, at(1, 5), 'ArrowLeft', false)).toEqual(at(1, 4));
    expect(gridKey(model, at(1, 5), 'ArrowDown', false)).toEqual(at(2, 5));
    expect(gridKey(model, at(1, 5), 'ArrowUp', false)).toEqual(at(0, 5));
    // At an edge the key is still the grid's (the page doesn't scroll), and focus stays.
    expect(gridKey(model, at(0, 0), 'ArrowUp', false)).toEqual(at(0, 0));
    expect(gridKey(model, at(0, 0), 'ArrowLeft', false)).toEqual(at(0, 0));
    expect(gridKey(model, at(3, 29), 'ArrowDown', false)).toEqual(at(3, 29));
    expect(gridKey(model, at(3, 29), 'ArrowRight', false)).toEqual(at(3, 29));
  });

  test('Home and End go along a row', () => {
    expect(gridKey(model, at(2, 12), 'Home', false)).toEqual(at(2, 0));
    expect(gridKey(model, at(2, 12), 'End', false)).toEqual(at(2, 29));
  });

  test('Ctrl+Home and Ctrl+End go to the corners', () => {
    expect(gridKey(model, at(2, 12), 'Home', true)).toEqual(at(0, 0));
    expect(gridKey(model, at(2, 12), 'End', true)).toEqual(at(3, 29));
  });

  test('Page Down moves ten scenes', () => {
    expect(gridKey(model, at(1, 5), 'PageDown', false)).toEqual(at(1, 15));
    expect(gridKey(model, at(1, 25), 'PageDown', false)).toEqual(at(1, 29));
    expect(gridKey(model, at(1, 15), 'PageUp', false)).toEqual(at(1, 5));
    expect(gridKey(model, at(1, 5), 'PageUp', false)).toEqual(at(1, 0));
  });

  test('Enter and the menu keys', () => {
    expect(gridKey(model, at(1, 5), 'Enter', false)).toBe('enter');
    // Shift+F10 comes as ContextMenu: the grid maps it, as the other lists do.
    expect(gridKey(model, at(1, 5), 'ContextMenu', false)).toBe('menu');
    // Anything else isn't the grid's.
    expect(gridKey(model, at(1, 5), 'a', false)).toBeNull();
    expect(gridKey(model, at(1, 5), 'Tab', false)).toBeNull();
    expect(gridKey(model, at(1, 5), 'ArrowRight', true)).toBeNull();
    // An empty grid has nowhere to go.
    expect(gridKey({ rows: 0, columns: 0 }, at(0, 0), 'ArrowRight', false)).toBeNull();
  });
});

// The cast is worked out again as the writer types, and its order can change (a character passes
// another in speeches). The grid's Tab stop stays with the character, not the row number.
describe('the grid’s Tab stop through a new cast', () => {
  test('stays with the character when the rows are ranked again', () => {
    expect(holdPlace('ODO', at(1, 4), ['ODO', 'WREN', 'MAVIS'], 10)).toEqual(at(0, 4));
    expect(holdPlace('MAVIS', at(2, 4), ['MAVIS', 'ODO', 'WREN'], 10)).toEqual(at(0, 4));
  });

  test('keeps the row number, within the rows, when the character is gone', () => {
    expect(holdPlace('PIA', at(1, 4), ['ODO', 'WREN', 'MAVIS'], 10)).toEqual(at(1, 4));
    expect(holdPlace('PIA', at(5, 4), ['ODO', 'WREN'], 10)).toEqual(at(1, 4));
    expect(holdPlace(undefined, at(0, 0), [], 0)).toEqual(at(0, 0));
  });

  test('keeps the column within the scenes', () => {
    expect(holdPlace('ODO', at(0, 12), ['WREN', 'ODO'], 5)).toEqual(at(1, 4));
  });
});

describe('the grid’s Tab stop through several casts', () => {
  test('after its character is gone, it stays with whoever has that row now', () => {
    // PIA had the stop on row 1; she is gone, so ODO, now on row 1, has it.
    const gone = holdStop('PIA', at(1, 4), ['WREN', 'ODO', 'MAVIS'], 10);
    expect(gone).toEqual({ key: 'ODO', sceneId: undefined, place: at(1, 4) });
    // The next cast ranks ODO first: the stop goes with him, not with row 1.
    const ranked = holdStop(gone.key, gone.place, ['ODO', 'WREN', 'MAVIS'], 10);
    expect(ranked).toEqual({ key: 'ODO', sceneId: undefined, place: at(0, 4) });
    // No rows at all: no one holds it.
    expect(holdStop('ODO', at(0, 0), [], 0)).toEqual({
      key: undefined,
      sceneId: undefined,
      place: at(0, 0),
    });
  });
});

describe('the grid’s Tab stop keeps its scene', () => {
  test('a scene added before it moves the column with the scene, by its id', () => {
    const ids = ['hut', 'lock', 'towpath'];
    // A new scene before the lock: the lock is the third column now.
    expect(
      holdPlace('ODO', at(0, 1), ['ODO'], 4, {
        id: 'lock',
        ids: ['new', 'hut', 'lock', 'towpath'],
      }),
    ).toEqual(at(0, 2));
    // A scene taken out before it: back one.
    expect(
      holdPlace('ODO', at(0, 2), ['ODO'], 2, { id: 'towpath', ids: ['lock', 'towpath'] }),
    ).toEqual(at(0, 1));
    // The scene itself gone: the column number, within the scenes.
    expect(holdPlace('ODO', at(0, 2), ['ODO'], 2, { id: 'gone', ids: ['hut', 'lock'] })).toEqual(
      at(0, 1),
    );
    expect(ids).toHaveLength(3);
  });

  test('holdStop says which scene has the stop afterwards', () => {
    const next = holdStop('ODO', at(0, 1), ['ODO'], 3, { id: 'lock', ids: ['new', 'hut', 'lock'] });
    expect(next).toEqual({ key: 'ODO', sceneId: 'lock', place: at(0, 2) });
    // Its scene gone: whichever scene has that column now.
    const after = holdStop('ODO', at(0, 2), ['ODO'], 2, { id: 'gone', ids: ['hut', 'lock'] });
    expect(after.sceneId).toBe('lock');
  });
});
