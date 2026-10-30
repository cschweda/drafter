import { describe, expect, test } from 'vitest';
import { matchNames, nameMap, spellings, tokens } from '../src/names';

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
    ]);
    expect(map.get('ANN')?.map((s) => s.words.join(' '))).toEqual(['ANN LEE', 'ANN']);
    expect(map.get('Ann')?.map((s) => s.character)).toEqual([1, 0]);
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
  });
});
