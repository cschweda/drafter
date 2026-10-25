import { parse, reparse, type TextChange, toJSON } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';

// A byte-order mark, spelled out so no formatter turns it into an invisible literal.
const BOM = String.fromCharCode(0xfeff);

interface ChangeSpec {
  at: number;
  del: number;
  insert: string;
}

const insertion = fc.oneof(
  fc.constant(''),
  fc.constantFrom(
    '\n',
    '\n\n',
    'INT. ',
    'CUT TO:',
    '[[',
    ']]',
    '/*',
    '*/',
    '(',
    ')',
    '^',
    '#',
    '=',
  ),
  fc.constantFrom('MARGARET\n', '  ', '\r\n', BOM),
  fc.string({ maxLength: 8 }),
);
const changeSpec = fc.record({
  at: fc.double({ min: 0, max: 1, noNaN: true }),
  del: fc.nat({ max: 12 }),
  insert: insertion,
});
const editSequence = fc.array(fc.array(changeSpec, { minLength: 1, maxLength: 4 }), {
  minLength: 1,
  maxLength: 5,
});

// Turns abstract specs into sorted, non-overlapping changes against `text`.
function materialize(text: string, specs: ChangeSpec[]): TextChange[] {
  const changes = specs
    .map((spec) => {
      const from = Math.min(text.length, Math.floor(spec.at * (text.length + 1)));
      return { from, to: Math.min(text.length, from + spec.del), insert: spec.insert };
    })
    .sort((a, b) => a.from - b.from);
  const kept: TextChange[] = [];
  let end = -1;
  for (const change of changes) {
    if (change.from <= end) continue;
    kept.push(change);
    end = change.to;
  }
  return kept;
}

// Applies changes from the last to the first, so earlier offsets stay valid.
function applyInReverse(text: string, changes: TextChange[]): string {
  let out = text;
  for (const { from, to, insert } of [...changes].reverse()) {
    out = out.slice(0, from) + insert + out.slice(to);
  }
  return out;
}

describe('reparse', () => {
  it('equals a fresh parse after every change set', () => {
    fc.assert(
      fc.property(fountainScript, editSequence, (script, sequence) => {
        let text = script;
        let doc = parse(text);
        for (const specs of sequence) {
          const changes = materialize(text, specs);
          text = applyInReverse(text, changes);
          doc = reparse(doc, changes);
          expect(doc.source).toBe(text);
          expect(toJSON(doc)).toEqual(toJSON(parse(text)));
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it('applies a multi-range change set in old-document offsets', () => {
    const doc = parse('MARGARET\nHello.\n');
    const next = reparse(doc, [
      { from: 0, to: 8, insert: 'DANNY' },
      { from: 9, to: 15, insert: 'Goodbye.' },
    ]);
    expect(next.source).toBe('DANNY\nGoodbye.\n');
    expect(next.blocks[0]?.sem).toMatchObject({ name: 'DANNY' });
  });

  it('accepts touching ranges and applies their inserts in order', () => {
    const doc = parse('ab');
    const next = reparse(doc, [
      { from: 0, to: 1, insert: 'X' },
      { from: 1, to: 1, insert: 'Y' },
    ]);
    expect(next.source).toBe('XYb');
  });

  it('rejects overlapping, unsorted, or out-of-range changes', () => {
    const doc = parse('Margaret waits.');
    expect(() =>
      reparse(doc, [
        { from: 0, to: 5, insert: '' },
        { from: 3, to: 6, insert: '' },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      reparse(doc, [
        { from: 6, to: 7, insert: '' },
        { from: 0, to: 1, insert: '' },
      ]),
    ).toThrow(RangeError);
    expect(() => reparse(doc, [{ from: 10, to: 99, insert: '' }])).toThrow(RangeError);
    expect(() => reparse(doc, [{ from: 5, to: 4, insert: '' }])).toThrow(RangeError);
  });
});
