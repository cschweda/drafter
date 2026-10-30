import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { headingKey, PRINT_VERSION, SKETCH_K, scenePrints } from '../src';
import { now } from './helpers';
import { LANTERN_ROOM, LAST_FERRY, PLAY_SCENES, S } from './scripts';

const sorted = (sketch: Uint32Array) =>
  [...sketch].every((v, i) => i === 0 || (sketch[i - 1] as number) < v);

describe('scenePrints', () => {
  test('prints every scene of a screenplay and a stage play', () => {
    const film = scenePrints(LAST_FERRY);
    expect(film.slots).toHaveLength(12);
    expect(film.prints).toHaveLength(12);
    expect(film.slots.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const first = film.prints[0];
    expect(first?.heading).toBe('INT. FERRY OFFICE - DAWN');
    expect(first?.headingKey).toBe('INT. FERRY OFFICE - DAWN');
    expect(first?.hash).toMatch(/^[0-9a-f]{14}$/);
    expect(first?.words).toBeGreaterThan(40);
    expect(first?.preview.split('\n')).toHaveLength(3);
    expect(first?.preview.startsWith('Rain ticks on the tin roof.')).toBe(true);
    expect(first?.preview.length).toBeLessThanOrEqual(240);
    // Each slot spans its scene from the heading to the end of its last line.
    expect(film.slots.map((slot) => LAST_FERRY.slice(slot.from, slot.to))).toEqual(
      Object.values(S),
    );
    for (const print of film.prints) {
      expect(print.sketch.length).toBe(Math.min(SKETCH_K, print.shingles));
      expect(sorted(print.sketch)).toBe(true);
    }
    const play = scenePrints(LANTERN_ROOM);
    expect(play.slots).toHaveLength(6);
    expect(play.prints.map((p) => p.heading)).toEqual(
      PLAY_SCENES.map((s) => s.split('\n')[0]?.slice(3)),
    );
    expect(PRINT_VERSION).toBe(1);
  });

  test('a scene with more than 64 shingles keeps the 64 smallest', () => {
    const cabin = now(LAST_FERRY)[3];
    expect(cabin?.shingles).toBeGreaterThan(SKETCH_K);
    expect(cabin?.sketch.length).toBe(SKETCH_K);
  });

  test('the same text twice is one print and two slots', () => {
    const text = `${S.office}\n\n${S.jetty}\n\n${S.office}\n`;
    const { slots, prints } = scenePrints(text);
    expect(slots).toHaveLength(3);
    expect(prints).toHaveLength(2);
    expect(slots[0]?.hash).toBe(slots[2]?.hash);
  });

  test('the hash ignores line endings, trailing spaces, and trailing blank lines', () => {
    const a = scenePrints(`${S.jetty}\n`).slots[0]?.hash;
    const b = scenePrints(`${S.jetty.replace(/\n/g, '  \r\n')}\r\n\r\n\r\n`).slots[0]?.hash;
    expect(b).toBe(a);
  });

  test('headingKey drops the locked number, folds dashes and case', () => {
    expect(headingKey('int. car – night #12A#')).toBe('INT. CAR - NIGHT');
    expect(headingKey('INT.  CAR —  NIGHT')).toBe('INT. CAR - NIGHT');
    expect(headingKey('  Int. Car - Night.  ')).toBe('INT. CAR - NIGHT');
    expect(headingKey('EXT. JETTY - MORNING')).not.toBe(headingKey('EXT. JETTY - NIGHT'));
    expect(scenePrints('INT. CAR - NIGHT #12A#\n\nShe drives.\n').prints[0]?.headingKey).toBe(
      'INT. CAR - NIGHT',
    );
  });

  test("notes and synopses don't change the sketch", () => {
    const plain = now(`${S.jetty}\n`)[0];
    const noted = now(
      `${S.jetty.replace('Gulls argue', '= The schoolboy again.\n\n[[Cut the gulls?]]\n\nGulls [[loud]] argue')}\n\n/* An old line\n\nof boneyard */\n`,
    )[0];
    expect(noted?.hash).not.toBe(plain?.hash);
    expect([...(noted?.sketch ?? [])]).toEqual([...(plain?.sketch ?? [])]);
    expect(noted?.shingles).toBe(plain?.shingles);
    expect(noted?.words).toBe(plain?.words);
  });

  test('the heading is not shingled', () => {
    const a = now('INT. CAR - NIGHT\n\nShe drives home slowly in the rain.\n')[0];
    const b = now('EXT. FIELD - DAY\n\nShe drives home slowly in the rain.\n')[0];
    expect([...(a?.sketch ?? [])]).toEqual([...(b?.sketch ?? [])]);
  });

  test('a scene under 3 words has its words and pairs as shingles, one under 5 its pairs', () => {
    // "he nods", "he", "nods"; "nods"; "he nods twice", "he nods", "nods twice".
    expect(now('INT. HALL - DAY\n\nHe nods.\n')[0]?.shingles).toBe(3);
    expect(now('INT. HALL - DAY\n\nNods.\n')[0]?.shingles).toBe(1);
    expect(now('INT. HALL - DAY\n\nHe nods twice.\n')[0]?.shingles).toBe(3);
    // Four words: two threes and three pairs. Five: three threes, and no pairs.
    expect(now('INT. HALL - DAY\n\nHe nods twice, slowly.\n')[0]?.shingles).toBe(5);
    expect(now('INT. HALL - DAY\n\nHe nods twice, very slowly.\n')[0]?.shingles).toBe(3);
    expect(now('INT. HALL - DAY\n\nNods. Nods.\n')[0]?.shingles).toBe(2);
    const empty = now('INT. HALL - DAY\n\n[[Write this.]]\n')[0];
    expect(empty?.shingles).toBe(0);
    expect(empty?.sketch.length).toBe(0);
    expect(empty?.preview).toBe('');
  });

  test('known hashes are not shingled again', () => {
    const first = scenePrints(LAST_FERRY);
    const asked: string[] = [];
    const known = new Set(first.prints.slice(0, 10).map((p) => p.hash));
    const again = scenePrints(LAST_FERRY, (hash) => {
      asked.push(hash);
      return known.has(hash);
    });
    expect(asked).toHaveLength(12);
    expect(again.slots).toEqual(first.slots);
    expect(again.prints.map((p) => p.hash)).toEqual(first.prints.slice(10).map((p) => p.hash));
  });

  test('slots mark a scene that follows a section heading', () => {
    const film = scenePrints(LAST_FERRY);
    expect(film.slots.map((s) => s.section)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    const play = scenePrints(LANTERN_ROOM);
    expect(play.slots.map((s) => s.section)).toEqual([true, false, false, true, false, false]);
  });

  test('words agree with the scene index', () => {
    const index = sceneIndex(parse(LAST_FERRY), builtins['us-screenplay'] as Template);
    expect(now(LAST_FERRY).map((p) => p.words)).toEqual(index.scenes.map((s) => s.words));
  });
});
