import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neighbours, withinEdits } from '../src/names';

/** A full Levenshtein distance by code point, the plain way: the property test's reference. */
function distance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++)
      next[j] = Math.min(
        (row[j] as number) + 1,
        (next[j - 1] as number) + 1,
        (row[j - 1] as number) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[y.length] as number;
}

const pairOf = (pairs: Array<[string, string]>, a: string, b: string) =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

describe('name neighbours', () => {
  it('Dale and Dell look alike, June and Jane too, Juniper and June don’t', () => {
    const pairs = neighbours(['DALE', 'DELL', 'JUNE', 'JANE', 'JUNIPER', 'WES']);
    expect(pairOf(pairs, 'DALE', 'DELL')).toBe(true);
    expect(pairOf(pairs, 'JUNE', 'JANE')).toBe(true);
    expect(pairOf(pairs, 'JUNIPER', 'JUNE')).toBe(false);
    // Two edits are too many for three letters.
    expect(pairOf(neighbours(['ELI', 'EVE']), 'ELI', 'EVE')).toBe(false);
    // Six letters or more: two edits.
    expect(pairOf(neighbours(['MARGIT', 'MARGOT']), 'MARGIT', 'MARGOT')).toBe(true);
    expect(pairOf(neighbours(['MARGIT', 'BRIGIT']), 'MARGIT', 'BRIGIT')).toBe(false);
  });

  it('neighbours count code points', () => {
    expect(withinEdits('ÉLODIE', 'ELODIE', 1)).toBe(true);
    // A decomposed É is two code points: the accent is one edit.
    expect(withinEdits('ÉLODIE', 'ELODIE', 1)).toBe(true);
    expect(pairOf(neighbours(['ÉLODIE', 'ELODIE']), 'ÉLODIE', 'ELODIE')).toBe(true);
    // Two-character Japanese names, one character apart: one edit.
    expect(withinEdits('春子', '夏子', 1)).toBe(true);
    expect(pairOf(neighbours(['春子', '夏子']), '春子', '夏子')).toBe(true);
    // An emoji is one code point (two UTF-16 units): one edit, not two.
    expect(withinEdits('BO🐟', 'BOB', 1)).toBe(true);
    expect(withinEdits('🐟🐟', '🐠🐟', 1)).toBe(true);
    expect(withinEdits('🐟🐟', '🐠🐠', 1)).toBe(false);
  });

  it('a name is never its own neighbour', () => {
    const pairs = neighbours(['JUNE', 'JUNE', 'DALE', '春子', '春子']);
    for (const [a, b] of pairs) expect(a).not.toBe(b);
    expect(pairs).toEqual([]);
  });

  it('withinEdits agrees with a full Levenshtein for max ≤ 2', () => {
    // A small alphabet, with an astral character, so edits are common.
    const letter = fc.constantFrom('A', 'B', 'C', 'É', '春', '🐟');
    const name = fc.array(letter, { maxLength: 8 }).map((cs) => cs.join(''));
    fc.assert(
      fc.property(name, name, fc.integer({ min: 0, max: 2 }), (a, b, max) => {
        expect(withinEdits(a, b, max)).toBe(distance(a, b) <= max);
      }),
      { numRuns: 2_000 },
    );
    // The reference agrees with itself on a known pair.
    expect(distance('kitten', 'sitting')).toBe(3);
    expect(distance('', '')).toBe(0);
  });
});
