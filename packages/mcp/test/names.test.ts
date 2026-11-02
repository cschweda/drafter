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
    const composed = '\u00c9LODIE';
    const decomposed = 'E\u0301LODIE';
    expect(composed).not.toBe(decomposed);
    // One accented letter is one edit from the plain letter.
    expect(withinEdits(composed, 'ELODIE', 1)).toBe(true);
    expect(pairOf(neighbours([composed, 'ELODIE']), composed, 'ELODIE')).toBe(true);
    // Typed as one character or as two, É is the same letter: the same name, never a neighbour.
    expect(withinEdits(decomposed, composed, 0)).toBe(true);
    expect(withinEdits(decomposed, 'ELODIE', 1)).toBe(true);
    expect(neighbours([composed, decomposed])).toEqual([]);
    expect(neighbours([decomposed, composed, 'ELODIE'])).toEqual([[decomposed, 'ELODIE']]);
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

  it('a thousand long names that share a start are compared quickly', () => {
    // Long names (past the length any name is compared at) and names just within it, every one
    // sharing its start with the rest.
    const long = Array.from({ length: 1_000 }, (_, i) => `${'A'.repeat(195)}${i}`);
    let t = performance.now();
    expect(neighbours(long)).toEqual([]);
    expect(performance.now() - t).toBeLessThan(1_000);
    const near = Array.from(
      { length: 1_000 },
      (_, i) => `${'B'.repeat(36)}${String(i).padStart(4, '0')}`,
    );
    t = performance.now();
    const pairs = neighbours(near);
    expect(performance.now() - t).toBeLessThan(1_000);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairOf(pairs, near[0] as string, near[1] as string)).toBe(true);
    // withinEdits itself, on two long names, is linear in their length.
    t = performance.now();
    for (let i = 0; i < 1_000; i++)
      withinEdits(`${'C'.repeat(5_000)}X`, `${'C'.repeat(5_000)}Y`, 2);
    expect(performance.now() - t).toBeLessThan(1_000);
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
