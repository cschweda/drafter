import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COURIER_PRIME_RANGES, courierPrimeHas } from '@drafter/layout';
import fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';

// The script font's coverage is written out in @drafter/layout, which has no font reader, so the
// missing-glyph warning can run where the fonts aren't. This keeps it true to the files.

const FACES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

function fromTheFonts(): number[] {
  const sets = FACES.map((face) => {
    const bytes = readFileSync(
      join(import.meta.dirname, '..', 'fonts', `CourierPrime-${face}.ttf`),
    );
    return new Set<number>(fontkit.create(bytes).characterSet);
  });
  const [first, ...rest] = sets as [Set<number>, ...Set<number>[]];
  const shared = [...first].filter((cp) => rest.every((set) => set.has(cp))).sort((a, b) => a - b);
  const ranges: number[] = [];
  for (const cp of shared) {
    if (ranges.length > 0 && ranges[ranges.length - 1] === cp - 1) ranges[ranges.length - 1] = cp;
    else ranges.push(cp, cp);
  }
  return ranges;
}

describe('the script font’s coverage', () => {
  it('lists exactly the characters all four Courier Prime faces can draw', () => {
    expect([...COURIER_PRIME_RANGES]).toEqual(fromTheFonts());
  });

  it('has Latin with accents, curly quotes, and dashes, and no Cyrillic, CJK, or emoji', () => {
    for (const ch of 'AzÉłŞ’“—…€')
      expect(courierPrimeHas(ch.codePointAt(0) as number), ch).toBe(true);
    for (const ch of 'Дあ中ש😀')
      expect(courierPrimeHas(ch.codePointAt(0) as number), ch).toBe(false);
  });
});
