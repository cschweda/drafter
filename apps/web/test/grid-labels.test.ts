import type { Absence, Presence } from '@drafter/cast';
import { describe, expect, test } from 'vitest';
import { absenceLine, cellName, listLine } from '../app/stats/grid-labels';

// What the grid's cells, its long absences, and its List say (seeing-the-script design §4.4).
const presence = (scene: number, speeches: number): Presence => ({
  scene,
  speaking: speeches > 0,
  speeches,
  words: speeches * 5,
  firstMention: null,
});
// Scene numbers as the script gives them: the fourth has a written number.
const numberOf = (scene: number) => (scene === 3 ? '3A' : String(scene + 1 - (scene > 3 ? 1 : 0)));

describe('the grid’s words', () => {
  test('names a speaking, a silent, and an empty cell', () => {
    expect(cellName('OSKAR', '12', { speeches: 4, silent: false })).toBe(
      'OSKAR, scene 12, 4 speeches',
    );
    expect(cellName('OSKAR', '12', { speeches: 1, silent: false })).toBe(
      'OSKAR, scene 12, 1 speech',
    );
    expect(cellName('OSKAR', '7A', { speeches: 0, silent: true })).toBe('OSKAR, scene 7A, silent');
    expect(cellName('OSKAR', '3', null)).toBe('OSKAR, scene 3, not in it');
  });

  test('an absence line says the pages', () => {
    const absence = (from: number, to: number, pages: number): Absence => ({
      from: { scene: 4, page: from },
      to: { scene: 9, page: to },
      pages,
    });
    expect(absenceLine('LIESL', absence(31, 72, 40.6))).toBe(
      'LIESL: absent from page 31 to page 72 (41 pages).',
    );
    // Whole pages, from the page numbers: a gap of 20.0 pages prints 20.
    expect(absenceLine('LIESL', absence(5, 25, 20))).toBe(
      'LIESL: absent from page 5 to page 25 (20 pages).',
    );
  });

  test('the list line folds runs into ranges', () => {
    const scenes = [0, 1, 4, 5, 6, 7, 8, 13].map((s) => presence(s, 2));
    const silent = [presence(2, 0), presence(9, 0)];
    const all = [...scenes, ...silent].sort((a, b) => a.scene - b.scene);
    // Scene index 3 is "3A", so index 4 is scene 4: the run 4 to 8 reads "4 to 8".
    expect(listLine('BRAM', all, numberOf)).toBe(
      'BRAM: in 10 scenes. Speaks in 1, 2, 4 to 8, 13. Silent in 3, 9.',
    );
    // Two in a row are two numbers, not a range; one scene is one.
    expect(listLine('BRAM', [presence(0, 1), presence(1, 3)], numberOf)).toBe(
      'BRAM: in 2 scenes. Speaks in 1, 2.',
    );
    expect(listLine('BRAM', [presence(3, 0)], numberOf)).toBe('BRAM: in 1 scene. Silent in 3A.');
    // A character who speaks only before the first scene is in none.
    expect(listLine('BRAM', [], numberOf)).toBe('BRAM: in no scenes.');
  });
});
