import { describe, expect, test } from 'vitest';
import { matchNames, nameMap, spellings, tokens } from '../src/names';

/** Invented words from a seeded generator (Marsaglia's xorshift). */
function invented(seed: number) {
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const syllables = ['bra', 'tol', 'mev', 'ska', 'rin', 'dou', 'pel', 'vax', 'quo', 'ten', 'lir'];
  const word = () => {
    let w = '';
    for (let i = 0; i < 3; i++) w += syllables[next() % syllables.length];
    return w;
  };
  return { next, word };
}

describe('names', () => {
  test('capitals, capitalised, and as the cue spells it', () => {
    expect(spellings('McCLANE', false)).toEqual(['MCCLANE', 'Mcclane', 'McCLANE']);
    expect(spellings('ANN LEE', false)).toEqual(['ANN LEE', 'Ann Lee']);
    expect(spellings('MARY-JO', false)).toEqual(['MARY-JO', 'Mary-Jo']);
    expect(spellings("O'NEIL", false)).toEqual(["O'NEIL", "O'Neil"]);
    expect(spellings('DR. VOSS', false)).toEqual(['DR. VOSS', 'Dr. Voss']);
    // A name that is also a word: capitals only.
    expect(spellings('WILL', true)).toEqual(['WILL']);
    expect(spellings('THE DRIVER', true)).toEqual(['THE DRIVER']);
    // Nothing to match in a name with no letters or digits.
    expect(spellings('!!', false)).toEqual([]);
  });

  test('strips a possessive', () => {
    const words = tokens("TOM'S hat and Tom’s coat, 'JO' and the boys' bikes.").map((t) => t.word);
    expect(words).toEqual([
      'TOM',
      'hat',
      'and',
      'Tom',
      'coat',
      'JO',
      'and',
      'the',
      'boys',
      'bikes',
    ]);
    // Where each word starts, and the marks between it and the word before.
    const [, second] = tokens('DR. VOSS');
    expect(second).toEqual({ word: 'VOSS', at: 4, gap: '.' });
    expect(tokens("'TOM'")[0]?.at).toBe(1);
  });

  test('longest name first', () => {
    const map = nameMap([
      { name: 'ANN', word: false },
      { name: 'ANN LEE', word: false },
      { name: 'DR. VOSS', word: false },
      { name: 'ANN LEE ROSS', word: false },
    ]);
    // By first word, then by second; a one-word name stands alone.
    expect(map.get('ANN')?.alone.map((s) => s.character)).toEqual([0]);
    expect(
      map
        .get('ANN')
        ?.next.get('LEE')
        ?.map((s) => s.words.join(' ')),
    ).toEqual(['ANN LEE ROSS', 'ANN LEE']);
    expect(
      map
        .get('Ann')
        ?.next.get('Lee')
        ?.map((s) => s.character),
    ).toEqual([3, 1]);
    const found: Array<[number, number]> = [];
    const text = 'ANN LEE waves. ANN waves back. Ann Lee laughs. ANN. LEE. DR VOSS, DR. VOSS.';
    matchNames(text, map, (character, at) => found.push([character, at]));
    expect(found).toEqual([
      [1, 0],
      [0, text.indexOf('ANN waves')],
      [1, text.indexOf('Ann Lee')],
      [0, text.indexOf('ANN. LEE')],
      [2, text.lastIndexOf('DR. VOSS')],
    ]);
    const three: number[] = [];
    matchNames('ANN LEE ROSS sits. ANN LEE stands.', map, (character) => three.push(character));
    expect(three).toEqual([3, 1]);
  });

  test('a first word many names share stays cheap', () => {
    // A thousand invented names that all start THE, against 200 KB of action full of The and THE:
    // each The tries only the names whose second word follows it, so a thousand cost about one.
    const { next, word } = invented(11);
    const named = Array.from({ length: 1000 }, (_, i) => ({
      name: `THE ${word().toUpperCase()}${i}`,
      word: false,
    }));
    let text = '';
    while (text.length < 200_000) {
      text += `The ${word()} ${word()} sees THE ${word().toUpperCase()} by the ${word()}. `;
    }
    const target = (named[next() % named.length] as { name: string }).name;
    text += `${target} waves.`;
    const many = nameMap(named);
    const one = nameMap(named.slice(0, 1));
    const time = (map: ReturnType<typeof nameMap>) => {
      const start = performance.now();
      matchNames(text, map, () => {});
      return performance.now() - start;
    };
    time(many);
    time(one);
    let fast = Number.POSITIVE_INFINITY;
    let slow = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 7; k++) {
      fast = Math.min(fast, time(one));
      slow = Math.min(slow, time(many));
    }
    const found: number[] = [];
    matchNames(text, many, (character) => found.push(character));
    expect(found).toEqual([named.findIndex((n) => n.name === target)]);
    // Load slows both alike; a scan that tried every THE name would be several times slower.
    expect(slow / Math.max(fast, 0.1)).toBeLessThan(3);
    // A hang guard at ten times castOf's 15 ms budget.
    expect(slow).toBeLessThan(150);
    if (process.env.DRAFTER_TIMING) {
      console.log(
        `matchNames, 1,000 THE names, ${text.length} characters, best of 7: ${slow.toFixed(2)} ms (one name: ${fast.toFixed(2)} ms)`,
      );
    }
  });
});
