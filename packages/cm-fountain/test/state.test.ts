import { EditorState, StateEffect, type TransactionSpec } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import { parse, toJSON } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { BOM, stateOf } from './helpers';

/** What the parse in the state must equal: a fresh parse of the text, spans and regions too. */
function expectFresh(state: EditorState) {
  const text = state.doc.toString();
  const doc = state.field(parsedDoc);
  const fresh = parse(text);
  expect(doc.source).toBe(text);
  expect(toJSON(doc)).toEqual(toJSON(fresh));
  // toJSON leaves the regions out, so they need a comparison of their own.
  expect(doc.regions).toEqual(fresh.regions);
}

const script = [
  'Title: The Call',
  'Author: A. Writer',
  '',
  'INT. HALL - DAY',
  '',
  'MARGARET',
  'Hello there.',
  '',
  'She waits.',
  '',
].join('\n');

describe('parsedDoc', () => {
  it('parses on creation and reparses on every change', () => {
    let state = stateOf(script);
    expectFresh(state);
    expect(state.field(parsedDoc).titlePage?.fields).toHaveLength(2);

    const steps: Array<(s: EditorState) => TransactionSpec> = [
      // Typing in the middle of a word.
      (s) => ({ changes: { from: s.doc.toString().indexOf('MARGARET') + 3, insert: 'X' } }),
      // Deleting across a line break, which joins the cue and the speech into one line.
      (s) => {
        const at = s.doc.toString().indexOf('Hello there.');
        return { changes: { from: at - 1, to: at + 6 } };
      },
      // Several ranges in one transaction, a multi-cursor edit, in old-document offsets.
      (s) => ({
        changes: [
          { from: 0, to: 5, insert: 'Name' },
          { from: s.doc.toString().indexOf('She'), insert: '[[note]] ' },
          { from: s.doc.length, insert: '/* gone */' },
        ],
      }),
      // A new title page field and a new scene at the end.
      (s) => ({ changes: { from: s.doc.length, insert: '\n\nEXT. YARD - NIGHT\n' } }),
      // The whole text replaced.
      (s) => ({ changes: { from: 0, to: s.doc.length, insert: 'Just action.\r\nAnd a CRLF.' } }),
      // Down to nothing.
      (s) => ({ changes: { from: 0, to: s.doc.length } }),
    ];
    for (const step of steps) {
      state = state.update(step(state)).state;
      expectFresh(state);
    }
    expect(state.field(parsedDoc).blocks).toHaveLength(0);
  });

  it('keeps the same parse for a transaction that changes no text', () => {
    const state = stateOf(script);
    const doc = state.field(parsedDoc);
    const moved = state.update({ selection: { anchor: 4 }, scrollIntoView: true }).state;
    expect(moved.field(parsedDoc)).toBe(doc);
  });

  it('parses the current text when it is added to a state that was already edited', () => {
    let state = EditorState.create({ doc: 'INT. HALL - DAY' });
    state = state.update({ changes: { from: 15, insert: '\n\nMARGARET\nHi.' } }).state;
    expect(state.field(parsedDoc, false)).toBeUndefined();
    state = state.update({ effects: StateEffect.appendConfig.of(parsedDoc) }).state;
    expectFresh(state);
    expect(state.field(parsedDoc).blocks).toHaveLength(3);
    // And it follows the edits that come after.
    state = state.update({ changes: { from: 0, insert: '.' } }).state;
    expectFresh(state);
  });

  describe('line breaks', () => {
    it('parses the text joined with line feeds, whatever the file used', () => {
      const crlf = stateOf('INT. HALL - DAY\r\n\r\nMARGARET\r\nHello.\r\n');
      expect(crlf.field(parsedDoc).source).toBe('INT. HALL - DAY\n\nMARGARET\nHello.\n');

      const lone = stateOf('One\rTwo\rThree');
      expect(lone.field(parsedDoc).source).toBe('One\nTwo\nThree');

      // A break inserted later is split by CodeMirror, and the parse sees what the text holds.
      const typed = crlf.update({ changes: { from: 0, insert: 'a\r\nb\rc' } }).state;
      expect(typed.field(parsedDoc).source).toBe(typed.doc.toString());
      expect(typed.field(parsedDoc).source).not.toContain('\r');
      expectFresh(typed);
    });

    it('gives spans that are CodeMirror positions, even with a line separator set', () => {
      for (const separator of ['\r\n', '\n', '\r']) {
        const text = ['INT. HALL - DAY', '', 'MARGARET', 'Hello.'].join(separator);
        const state = stateOf(text, [EditorState.lineSeparator.of(separator)]);
        const doc = state.field(parsedDoc);
        expect(doc.source).toBe(state.doc.toString());
        expect(doc.blocks.map((block) => block.kind)).toEqual([
          'scene_heading',
          'character',
          'dialogue',
        ]);
        // Every block starts where a CodeMirror line starts, and every line ends where one does.
        for (const block of doc.blocks) {
          expect(state.doc.lineAt(block.span.from).from).toBe(block.span.from);
          expect(state.doc.lineAt(block.span.to).to).toBe(block.span.to);
        }
        // An edit in the middle is still converted to the offsets the parser reads.
        const next = state.update({
          changes: { from: text.indexOf('Hello'), insert: 'Oh, ' },
        }).state;
        expect(next.field(parsedDoc).source).toBe(next.doc.toString());
        expectFresh(next);
      }
    });

    it('reads a carriage return that a separator leaves in a line as part of a CRLF', () => {
      const state = stateOf('INT. HALL - DAY\r\n\r\nMARGARET\r\nHello.', [
        EditorState.lineSeparator.of('\n'),
      ]);
      const doc = state.field(parsedDoc);
      expect(doc.blocks.map((block) => block.kind)).toEqual([
        'scene_heading',
        'character',
        'dialogue',
      ]);
      // The first line is `INT. HALL - DAY\r` to CodeMirror, and the parser's span agrees.
      expect(doc.blocks[0]?.span.to).toBe(state.doc.line(1).to);
    });
  });
});

describe('the parse stays equal to a fresh one', () => {
  interface Edit {
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
      'Title: x\n',
    ),
    fc.constantFrom('MARGARET\n', '  ', '\r\n', '\r', BOM),
    fc.string({ maxLength: 8 }),
  );
  const edit = fc.record({
    at: fc.double({ min: 0, max: 1, noNaN: true }),
    del: fc.nat({ max: 12 }),
    insert: insertion,
  });
  // One transaction is a few ranges, in the old document's offsets, that may even overlap.
  const sequence = fc.array(fc.array(edit, { minLength: 1, maxLength: 4 }), {
    minLength: 1,
    maxLength: 5,
  });

  const changesFor = (length: number, edits: Edit[]) =>
    edits.map(({ at, del, insert }) => {
      const from = Math.min(length, Math.floor(at * (length + 1)));
      return { from, to: Math.min(length, from + del), insert };
    });

  it('matches a fresh parse after random edits', () => {
    fc.assert(
      fc.property(fountainScript, sequence, (text, transactions) => {
        let state = stateOf(text);
        expectFresh(state);
        for (const edits of transactions) {
          state = state.update({ changes: changesFor(state.doc.length, edits) }).state;
          expectFresh(state);
        }
      }),
      { numRuns: 200 },
    );
  });
});
