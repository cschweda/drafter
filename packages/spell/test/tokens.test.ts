import { describe, expect, test } from 'vitest';
import { lookupForms, tokenize } from '../src/tokens';

const words = (text: string) => tokenize(text).map((t) => t.word);

describe('tokenize', () => {
  test('finds words and their offsets', () => {
    expect(tokenize('The kettle  sings.')).toEqual([
      { from: 0, to: 3, word: 'The' },
      { from: 4, to: 10, word: 'kettle' },
      { from: 12, to: 17, word: 'sings' },
    ]);
    // An offset moves every token; astral characters count as two, as the source does.
    expect(tokenize('😀 recieve', 10)).toEqual([{ from: 13, to: 20, word: 'recieve' }]);
  });

  test('skips words with digits', () => {
    expect(words('R2D2 met 3rd and 90s and plain')).toEqual(['met', 'and', 'and', 'plain']);
  });

  test('skips web and e-mail addresses', () => {
    expect(
      words(
        'Go to https://zzqx.example/path, (www.zzqxsite.org) or zzqxdomain.com; mail pell@zzqx.net now.',
      ),
    ).toEqual(['Go', 'to', 'or', 'mail', 'now']);
    // A word that merely holds `www` or ends a sentence is kept.
    expect(words('Awww. The end.')).toEqual(['Awww', 'The', 'end']);
  });

  test('skips all-capital words of three letters or fewer', () => {
    expect(words('INT EXT TV I OK HOUSE Tv')).toEqual(['HOUSE', 'Tv']);
  });

  test('splits hyphenated words', () => {
    expect(tokenize('a well-meant twenty-one')).toEqual([
      { from: 0, to: 1, word: 'a' },
      { from: 2, to: 6, word: 'well', compound: 'well-meant' },
      { from: 7, to: 12, word: 'meant', compound: 'well-meant' },
      { from: 13, to: 19, word: 'twenty', compound: 'twenty-one' },
      { from: 20, to: 23, word: 'one', compound: 'twenty-one' },
    ]);
    // Each part carries the whole compound, with emphasis and ’ read as the word's are; a part
    // that isn't checked (a digit, short capitals) still belongs to it.
    expect(tokenize('a *walkie*-talkie’s B-roll 3-way')).toEqual([
      { from: 0, to: 1, word: 'a' },
      { from: 3, to: 9, word: 'walkie', compound: "walkie-talkie's" },
      { from: 11, to: 19, word: "talkie's", compound: "walkie-talkie's" },
      { from: 22, to: 26, word: 'roll', compound: 'B-roll' },
      { from: 29, to: 32, word: 'way', compound: '3-way' },
    ]);
    // Two hyphens, a dash, or a hyphen at an edge joins nothing.
    expect(tokenize('wait--what pre- -lap so–so').map((t) => t.compound)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('normalizes apostrophes and possessives', () => {
    expect(tokenize('don’t ‘quote’ dogs’')).toEqual([
      { from: 0, to: 5, word: "don't" },
      { from: 7, to: 12, word: 'quote' },
      { from: 14, to: 18, word: 'dogs' },
    ]);
    expect(lookupForms("Margaret's")).toEqual(["margaret's", 'margaret']);
    expect(lookupForms('Margaret’s')).toEqual(["margaret's", 'margaret']);
    expect(lookupForms('Kettle')).toEqual(['kettle']);
  });

  test('looks a word up as a plural and a plural possessive too', () => {
    expect(lookupForms('Halvorsens')).toEqual(['halvorsens', 'halvorsen']);
    expect(lookupForms("Halvorsens'")).toEqual(["halvorsens'", 'halvorsens', 'halvorsen']);
    expect(lookupForms('Halvorsens’')).toEqual(["halvorsens'", 'halvorsens', 'halvorsen']);
    // `es` only after s, x, z, ch, or sh; otherwise only the `s`.
    expect(lookupForms('Velloxes')).toEqual(['velloxes', 'vellox']);
    expect(lookupForms('Marchbankses')).toEqual(['marchbankses', 'marchbanks']);
    expect(lookupForms('Halvorsenes')).toEqual(['halvorsenes', 'halvorsene']);
    expect(lookupForms('Janes')).toEqual(['janes', 'jane']);
    // Three letters or fewer are never cut.
    expect(lookupForms('bus')).toEqual(['bus']);
  });

  test('skips words in other scripts', () => {
    expect(words('Ελένη 東京 Москва naïve 𐐀𐐁 café')).toEqual(['naïve', 'café']);
    expect(tokenize('𐐀𐐁 zzqx')).toEqual([{ from: 5, to: 9, word: 'zzqx' }]);
  });

  test('emphasis marks split nothing', () => {
    expect(tokenize('*did* **so** _now_ \\*lit\\*')).toEqual([
      { from: 1, to: 4, word: 'did' },
      { from: 8, to: 10, word: 'so' },
      { from: 14, to: 17, word: 'now' },
      { from: 21, to: 24, word: 'lit' },
    ]);
    // A run of `*` between letters joins the word: the token spans the source, its word has no `*`.
    expect(tokenize('un*believ*able')).toEqual([{ from: 0, to: 14, word: 'unbelievable' }]);
    expect(tokenize('*un*believable')).toEqual([{ from: 1, to: 14, word: 'unbelievable' }]);
    expect(tokenize('un**believ**able don’t')).toEqual([
      { from: 0, to: 16, word: 'unbelievable' },
      { from: 17, to: 22, word: "don't" },
    ]);
    // `_` never joins: snake_case is two words.
    expect(words('snake_case')).toEqual(['snake', 'case']);
  });
});
