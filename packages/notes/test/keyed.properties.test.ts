import { parse } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { type Head, readNote, safeBody, writeNote } from '../src';

/** The text between a written note's `[[` and `]]`. */
const inner = (note: string) => note.slice(2, -2);

/** Bodies of any Unicode, with the pieces that could break a note or a boneyard mixed in. */
const body = fc
  .array(
    fc.oneof(
      fc.string({ unit: 'grapheme' }),
      fc.constantFrom(
        ']]',
        '[[',
        ']',
        '[',
        '/*',
        '*/',
        '#',
        '#resolved',
        ':',
        '\n',
        '\r\n',
        ' ',
        '  \n  ',
      ),
    ),
  )
  .map((parts) => parts.join(''));

const word = (first: string, rest: string) =>
  fc
    .tuple(fc.constantFrom(...first), fc.string({ unit: fc.constantFrom(...rest), maxLength: 8 }))
    .map(([a, b]) => a + b);
const lower = 'abcdefghijklmnopqrstuvwxyzéø';
const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÉØ';
const name = fc
  .tuple(word(upper, lower), fc.option(word(upper, `${lower}'.-`), { nil: undefined }))
  .map(([a, b]) => (b ? `${a} ${b}` : a))
  // A key is never a person's name.
  .filter((n) => !/^(color|storyline|goal|conflict|outcome|shift|setup|payoff|card)$/i.test(n));

/** A head as written, and the head it reads as. */
const heads: fc.Arbitrary<[string, Head]> = fc.oneof(
  fc
    .constantFrom('color', 'storyline', 'goal', 'conflict', 'outcome', 'shift')
    .map((key): [string, Head] => [key, { kind: 'field', key } as Head]),
  fc
    .constantFrom('setup', 'payoff')
    .map((key): [string, Head] => [key, { kind: 'mark', key } as Head]),
  fc.constant<[string, Head]>(['Card', { kind: 'card' }]),
  word(upper, `${upper}?!`)
    .filter(
      (w) =>
        ![
          'COLOR',
          'STORYLINE',
          'GOAL',
          'CONFLICT',
          'OUTCOME',
          'SHIFT',
          'SETUP',
          'PAYOFF',
          'CARD',
        ].includes(w),
    )
    .map((w): [string, Head] => [w, { kind: 'category', name: w.toLowerCase() }]),
  name
    .filter((n) => /\p{Ll}/u.test(n))
    .filter((n) => !/^(color|storyline|goal|conflict|outcome|shift|setup|payoff|card)$/i.test(n))
    .map((n): [string, Head] => [n, { kind: 'person', name: n, on: null, re: null }]),
  fc
    .tuple(name, name)
    .map(([n, r]): [string, Head] => [
      `${n} re ${r}`,
      { kind: 'person', name: n, on: null, re: r },
    ]),
  fc
    .tuple(
      name,
      fc.string({ unit: fc.constantFrom(...`${lower} :,.'`), minLength: 1, maxLength: 20 }),
    )
    .map(([n, q]): [string, Head] => [
      `${n} on “${q}”`,
      { kind: 'person', name: n, on: q, re: null },
    ]),
);

describe('keyed notes, any body', () => {
  test('writing and reading any body gives it back', () => {
    fc.assert(
      fc.property(heads, body, ([written, expected], b) => {
        const note = writeNote(written, b);
        const read = readNote(inner(note));
        expect(read.head).toEqual(expected);
        expect(read.body).toBe(safeBody(b));
        // The parser reads it as one closed note, end to end.
        const regions = parse(note).regions;
        expect(regions.map((r) => [r.kind, r.span.from, r.span.to, r.closed])).toEqual([
          ['note', 0, note.length, true],
        ]);
      }),
    );
  });

  test('a note with no head gives its body back', () => {
    fc.assert(
      fc.property(body, (b) => {
        fc.pre(readNote(safeBody(b)).head === null);
        const note = writeNote(null, b);
        expect(readNote(inner(note))).toMatchObject({ head: null, body: safeBody(b) });
        expect(parse(note).regions).toHaveLength(1);
      }),
    );
  });

  test('reading never throws', () => {
    fc.assert(
      fc.property(body, (text) => {
        const note = readNote(text);
        expect(note.tags.includes('resolved')).toBe(false);
      }),
    );
  });
});
