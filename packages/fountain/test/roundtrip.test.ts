import { parse, print } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';

// A byte-order mark, spelled out so no formatter turns it into an invisible literal.
const BOM = String.fromCharCode(0xfeff);

// Any UTF-16 code unit, lone surrogates included, mixed with the tokens Fountain
// cares about so random strings still hit interesting structure.
const codeUnit = fc.integer({ min: 0, max: 0xffff }).map((c) => String.fromCharCode(c));
const token = fc.constantFrom(
  '\n',
  '\r\n',
  '\r',
  '  ',
  '\t',
  BOM,
  '#',
  '=',
  '===',
  '!',
  '@',
  '~',
  '>',
  '<',
  '.',
  '[[',
  ']]',
  '/*',
  '*/',
  '^',
  '(',
  ')',
  '*',
  '**',
  '_',
  '\\',
  ':',
  'INT. ',
  'CUT TO:',
  'MARGARET',
  'Title: ',
  '/* drafter\n',
  'a',
  ' ',
);
// `size: 'max'` matters: by default fast-check caps arrays at about ten items.
const anyString = fc
  .array(fc.oneof(codeUnit, token), { maxLength: 200, size: 'max' })
  .map((p) => p.join(''));

describe('print(parse(s)) === s', () => {
  it('holds for arbitrary strings across the UTF-16 range', () => {
    fc.assert(
      fc.property(anyString, (s) => {
        expect(print(parse(s))).toBe(s);
      }),
      { numRuns: 10_000 },
    );
  });

  it('holds for generated scripts', () => {
    fc.assert(
      fc.property(fountainScript, (s) => {
        expect(print(parse(s))).toBe(s);
      }),
      { numRuns: 1_000 },
    );
  });
});
