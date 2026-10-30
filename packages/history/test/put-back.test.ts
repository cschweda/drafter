import { describe, expect, test } from 'vitest';
import { type Place, putBackChanges, putBackPlace, type ScenePrint, scenePrints } from '../src';
import { apply, nowScenes } from './helpers';
import {
  ACT_ONE_SCENES,
  ACT_TWO_SCENES,
  LANTERN_ROOM,
  LAST_FERRY,
  lanternRoom,
  lastFerry,
  PLAY_SCENES,
  S,
  WHEELHOUSE_REWRITE,
} from './scripts';

/** Puts the scene at `index` of `snapshot` back into `current`: the place and the text after. */
function putBack(snapshot: string, index: number, current: string): { place: Place; text: string } {
  const past = scenePrints(snapshot);
  const prints = new Map<string, ScenePrint>(past.prints.map((p) => [p.hash, p]));
  const place = putBackPlace(
    past.slots,
    index,
    prints,
    nowScenes(current),
    current.length,
    scenePrints(current).sections,
  );
  const slot = past.slots[index];
  if (!slot) throw new Error('no such scene');
  const changes = putBackChanges(current, place, snapshot.slice(slot.from, slot.to));
  return { place, text: apply(current, changes) };
}

const without = (...cut: string[]) =>
  lastFerry(
    ACT_ONE_SCENES.filter((s) => !cut.includes(s)),
    ACT_TWO_SCENES.filter((s) => !cut.includes(s)),
  );

describe('putBackPlace and putBackChanges (Call 11)', () => {
  test('goes after its old previous scene', () => {
    const current = without(S.landing);
    const { place, text } = putBack(LAST_FERRY, 4, current);
    expect(place).toEqual({
      at: current.indexOf(S.cabin) + S.cabin.length,
      side: 'after',
      anchor: 'INT. FERRY CABIN - DAY',
    });
    expect(text).toBe(LAST_FERRY);
  });

  test('opens Act Two after # ACT TWO', () => {
    const current = without(S.kitchen);
    const { place, text } = putBack(LAST_FERRY, 6, current);
    expect(place).toEqual({
      at: current.indexOf(S.storm),
      side: 'before',
      anchor: 'EXT. JETTY - NIGHT',
    });
    expect(text).toBe(LAST_FERRY);
  });

  test('closes Act One before # ACT TWO', () => {
    const current = without(S.pub);
    const { place, text } = putBack(LAST_FERRY, 5, current);
    expect(place.side).toBe('after');
    expect(place.anchor).toBe('EXT. ISLAND LANDING - DAY');
    expect(text).toBe(LAST_FERRY);
  });

  test('finds a neighbour renamed since', () => {
    const current = without(S.landing).replace('INT. FERRY CABIN - DAY', 'INT. FERRY SALOON - DAY');
    const { place, text } = putBack(LAST_FERRY, 4, current);
    expect(place.anchor).toBe('INT. FERRY SALOON - DAY');
    expect(text).toBe(LAST_FERRY.replace('INT. FERRY CABIN - DAY', 'INT. FERRY SALOON - DAY'));
  });

  test('falls back to the next neighbour out', () => {
    // The landing's previous scene (the cabin) is rewritten past matching and its next (the pub)
    // is cut too, so it goes after the scene before the cabin.
    const current = lastFerry([S.office, S.jetty, S.arrival, WHEELHOUSE_REWRITE], ACT_TWO_SCENES);
    const { place, text } = putBack(LAST_FERRY, 4, current);
    expect(place).toEqual({
      at: current.indexOf(S.arrival) + S.arrival.length,
      side: 'after',
      anchor: 'INT. CAR - DAY',
    });
    expect(text).toBe(current.replace(S.arrival, `${S.arrival}\n\n${S.landing}`));
  });

  test('a section opener with its next scene gone opens its section again', () => {
    const current = without(S.kitchen, S.storm);
    const { place, text } = putBack(LAST_FERRY, 6, current);
    expect(place).toEqual({
      at: current.indexOf('# ACT TWO') + '# ACT TWO'.length,
      side: 'after',
      anchor: 'ACT TWO',
    });
    expect(text).toBe(without(S.storm));
    // The act's last scene gone too: still at the start of the act, not the end of the one before.
    const empty = '# ACT ONE\n\nINT. ONE - DAY\n\nMara opens the shutters.\n\n# ACT TWO\n';
    const past = `${empty}\nINT. TWO - DAY\n\nTobin sweeps the porch.\n\nINT. THREE - DAY\n\nIlse reads the letter.\n`;
    expect(putBack(past, 1, empty).text).toBe(
      `${empty}\nINT. TWO - DAY\n\nTobin sweeps the porch.\n`,
    );
  });

  test('a section opener with its next scene and its section gone goes after its previous one', () => {
    const current = without(S.kitchen, S.storm).replace('# ACT TWO\n\n', '');
    const { place } = putBack(LAST_FERRY, 6, current);
    expect(place.side).toBe('after');
    expect(place.anchor).toBe('INT. HARBOUR PUB - NIGHT');
  });

  test('goes at the end when no neighbour is left', () => {
    const current = `${S.water}\n`;
    const { place, text } = putBack(`${S.office}\n\n${S.jetty}\n`, 1, current);
    expect(place).toEqual({ at: current.length, side: 'end', anchor: null });
    expect(text).toBe(`${S.water}\n\n${S.jetty}\n`);
  });

  test('at the end of a play, before its settings', () => {
    const current = lanternRoom([], []);
    const { place, text } = putBack(LANTERN_ROOM, 1, current);
    expect(place.side).toBe('end');
    expect(text).toBe(lanternRoom([], [PLAY_SCENES[1]]));
    // The act's opening scene opens the act again, though the act is empty now.
    const opening = putBack(LANTERN_ROOM, 0, current);
    expect(opening.place).toMatchObject({ side: 'after', anchor: 'Act One' });
    expect(opening.text).toBe(lanternRoom([PLAY_SCENES[0]], []));
  });

  test('into an empty script', () => {
    const { text } = putBack(`${S.office}\n`, 0, '');
    expect(text).toBe(S.office);
  });

  test('a line of spaces counts as blank, but not the two spaces of a kept blank line', () => {
    // Between the cabin and the pub, a line of three spaces: a blank line, so none is added there.
    const spaced = without(S.landing).replace(`${S.cabin}\n\n`, `${S.cabin}\n   \n`);
    const { text } = putBack(LAST_FERRY, 4, spaced);
    expect(text).toContain(`${S.cabin}\n\n${S.landing}\n   \n${S.pub}`);
    // Before the pub, a line of tabs and spaces then a line break: blank too.
    const before = without(S.landing).replace(`\n\n${S.pub}`, `\n\t \n${S.pub}`);
    const at = before.indexOf(S.pub) - 4;
    const changes = putBackChanges(before, { at, side: 'after', anchor: 'X' }, S.landing);
    expect(apply(before, changes)).toContain(`${S.cabin}\n\n${S.landing}\n\t \n${S.pub}`);
    // Two spaces alone are a line Fountain keeps (a blank line in a speech), not a blank one.
    const kept = 'INT. ONE - DAY\n\nMara waits.\n  \n';
    const end = { at: kept.length, side: 'after', anchor: 'INT. ONE - DAY' } as const;
    expect(apply(kept, putBackChanges(kept, end, 'INT. TWO - DAY\n\nTobin sweeps.'))).toBe(
      `${kept}\nINT. TWO - DAY\n\nTobin sweeps.`,
    );
  });

  test('keeps one blank line each side', () => {
    const crlf = without(S.landing).replace(/\n/g, '\r\n');
    const { text } = putBack(LAST_FERRY, 4, crlf);
    expect(text).toBe(LAST_FERRY.replace(/\n/g, '\r\n'));
    // A scene from a CRLF snapshot, with trailing spaces and blank lines, into an LF script.
    const past = LAST_FERRY.replace(S.landing, `${S.landing}   \n\n\n`).replace(/\n/g, '\r\n');
    const { text: lf } = putBack(past, 4, without(S.landing));
    expect(lf).toBe(LAST_FERRY);
    // Two blank lines between the scenes now: the new scene gets one on each side, at least.
    const loose = without(S.landing).replace(`${S.cabin}\n\n`, `${S.cabin}\n\n\n`);
    const { text: spaced } = putBack(LAST_FERRY, 4, loose);
    expect(spaced).toContain(`${S.cabin}\n\n${S.landing}\n\n`);
    expect(spaced).toContain(`${S.landing}\n\n\n${S.pub}`);
  });
});
