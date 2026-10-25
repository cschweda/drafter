import type { InlineRun } from '@drafter/fountain';
import { wrap } from '@drafter/layout';
import { describe, expect, it } from 'vitest';
import { style } from './helpers';

/** Runs over `text` from [text, style] pairs, with spans that start at 0. */
function runs(...pieces: Array<[string, string]>): InlineRun[] {
  let at = 0;
  return pieces.map(([t, s]) => {
    const run = {
      text: t,
      bold: s.includes('b'),
      italic: s.includes('i'),
      underline: s.includes('u'),
      span: { from: at, to: at + t.length },
    };
    at += t.length;
    return run;
  });
}
const plain = (t: string) => runs([t, '']);
const lines = (out: InlineRun[][]) => out.map((line) => line.map((r) => r.text).join(''));

describe('wrap', () => {
  it('breaks at spaces and drops the space at each break', () => {
    expect(
      lines(wrap('The quick brown fox jumps', plain('The quick brown fox jumps'), 10)),
    ).toEqual(['The quick', 'brown fox', 'jumps']);
  });

  it('hard-breaks a word longer than the width', () => {
    expect(lines(wrap('Supercalifragilistic', plain('Supercalifragilistic'), 8))).toEqual([
      'Supercal',
      'ifragili',
      'stic',
    ]);
  });

  it('carries a style across a break', () => {
    const out = wrap(
      'Tell her right now',
      runs(['Tell ', ''], ['her right', 'b'], [' now', '']),
      9,
    );
    expect(out.map((line) => line.map((r) => [r.text, style(r)]))).toEqual([
      [
        ['Tell ', ''],
        ['her', 'b'],
      ],
      [
        ['right', 'b'],
        [' now', ''],
      ],
    ]);
  });

  it('keeps leading spaces on the first line and spaces inside a line', () => {
    expect(lines(wrap('    Two  spaces', plain('    Two  spaces'), 40))).toEqual([
      '    Two  spaces',
    ]);
  });

  it('drops every space at a break', () => {
    expect(lines(wrap('ab   cd', plain('ab   cd'), 3))).toEqual(['ab', 'cd']);
  });

  it('counts a code point as one column and never splits a surrogate pair', () => {
    expect(lines(wrap('😀😀😀', plain('😀😀😀'), 2))).toEqual(['😀😀', '😀']);
  });

  it('keeps pieces inside their run when the text and span differ in length', () => {
    // An escaped asterisk: five characters of text from six of source.
    const run = {
      text: 'a* bc',
      bold: false,
      italic: false,
      underline: false,
      span: { from: 10, to: 16 },
    };
    expect(wrap(run.text, [run], 2).map((line) => line.map((r) => r.span))).toEqual([
      [{ from: 10, to: 12 }],
      [{ from: 14, to: 16 }],
    ]);
  });

  it('gives empty text one empty line', () => {
    expect(wrap('', [], 10)).toEqual([[]]);
  });

  it('treats text without runs as plain', () => {
    expect(lines(wrap('one two', [], 3))).toEqual(['one', 'two']);
  });

  it('maps each piece back to the source', () => {
    const out = wrap('ab cd', plain('ab cd'), 2);
    expect(out.map((line) => line.map((r) => r.span))).toEqual([
      [{ from: 0, to: 2 }],
      [{ from: 3, to: 5 }],
    ]);
  });
});
