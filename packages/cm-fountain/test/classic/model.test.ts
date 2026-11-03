// The model test of Classic Mode design §15.1: elements typed key by key, as a writer types them
// (Enter, Tab, the chooser's pick, letters, and an accepted name), give the oracle's bytes, and
// those bytes parse back to the same elements. The oracle (oracle.ts) is written from the spec
// alone; a failure here is a bug in Classic Mode, fixed there, never by changing the oracle.
//
// The typist in writer.ts steers by the code's own state: it reads the pending element and picks
// in the chooser when that isn't the one it wants. So the first two properties check the bytes,
// not §6.1's transitions. The last one does: it types §6.1's table with no chooser at all, and
// checks each key lands where the table, written out here, says.
import { EditorView } from '@codemirror/view';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { dismissOffer, elementAt, offerAt } from '../../src/classic';
import { classicEditor, keys, render, type } from './harness';
import {
  type ClassicKind,
  fountainOf,
  meant,
  type OracleTemplate,
  readBack,
  type Spoken,
} from './oracle';
import { BOTH, RUNS, SEED, script, shown, typeScript } from './writer';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

// ---- The properties ---------------------------------------------------------------------------

describe.each(BOTH)('a $name', ({ template }) => {
  test('typing the elements gives the oracle’s bytes', () => {
    fc.assert(
      fc.property(script(template), (steps) => {
        const typed = typeScript(steps, template).doc.toString();
        expect(typed, shown(steps)).toBe(fountainOf(steps, template));
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  test('and parses back to the same elements', () => {
    fc.assert(
      fc.property(script(template), (steps) => {
        const typed = typeScript(steps, template).doc.toString();
        const back = readBack(steps, template, typed);
        expect(back, shown(steps)).toEqual(
          steps.map((s) => ({ kind: s.kind, words: meant(s, template) })),
        );
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe('the lines no mark can force, as they are', () => {
  test('a chosen heading of `!#x` keeps its words as Action’s, as `.` can’t force it', () => {
    const state = typeScript(
      [
        {
          kind: 'action',
          words: 'A door.',
          how: { key: 'Enter', pick: false, units: false, accept: false },
        },
        {
          kind: 'scene_heading',
          words: '!#x',
          how: { key: 'Enter', pick: true, units: false, accept: false },
        },
      ],
      'screenplay',
    );
    expect(render(state)).toBe('A door.\n\n!!#X|');
  });

  test('a bare `fade<` on a Transition stays as typed, as `>` would make it centered', () => {
    const state = typeScript(
      [
        {
          kind: 'action',
          words: 'A door.',
          how: { key: 'Enter', pick: false, units: false, accept: false },
        },
        {
          kind: 'transition',
          words: 'fade<',
          how: { key: 'Enter', pick: true, units: false, accept: false },
        },
      ],
      'screenplay',
    );
    expect(render(state)).toBe('A door.\n\nFADE<|');
  });
});

// ---- §6.1's table, with no chooser --------------------------------------------------------------

type Walked = 'scene_heading' | 'action' | 'character' | 'dialogue' | 'parenthetical';

/** §6.1, a line with text at its end (and Dialogue the speech's last line), screenplay. */
const TABLE: Record<Walked, { Enter: Walked; Tab: Walked }> = {
  scene_heading: { Enter: 'action', Tab: 'action' },
  action: { Enter: 'action', Tab: 'character' },
  character: { Enter: 'dialogue', Tab: 'dialogue' },
  dialogue: { Enter: 'character', Tab: 'parenthetical' },
  parenthetical: { Enter: 'dialogue', Tab: 'dialogue' },
};

interface Move {
  key: 'Enter' | 'Tab';
  /** On a soft Action, the words are a heading's, which makes it one (§4.2). */
  heading: boolean;
  /** On a pending Dialogue, Tab first, for its Parenthetical (§6.2). */
  parens: boolean;
  n: number;
}

const WALKED_WORDS: Record<Walked, (n: number) => string> = {
  scene_heading: (n) => `int. room ${n} - day`,
  action: (n) => `she waits ${n} times.`,
  character: (n) => ['june', 'dale', 'mo'][n % 3] as string,
  dialogue: (n) => `hello ${n}.`,
  parenthetical: (n) => `softly ${n}`,
};

describe('§6.1’s table, typed with Enter and Tab alone', () => {
  test('each key goes where the table says, and the bytes are the oracle’s', () => {
    const move = fc.record({
      key: fc.constantFrom('Enter' as const, 'Tab' as const),
      heading: fc.boolean(),
      parens: fc.boolean(),
      n: fc.nat(9),
    });
    fc.assert(
      fc.property(fc.array(move, { minLength: 1, maxLength: 12 }), (moves: Move[]) => {
        let state = classicEditor('|');
        let pending: Walked = 'action';
        const spoken: Spoken[] = [];
        const said: string[] = [];
        for (const m of moves) {
          let kind: Walked = pending;
          if (kind === 'action' && m.heading && elementAt(state)?.soft) kind = 'scene_heading';
          if (kind === 'dialogue' && m.parens && elementAt(state)?.pending) {
            state = keys(state, 'Tab');
            kind = 'parenthetical';
          }
          expect(elementAt(state)?.kind, said.join(' ')).toBe(
            kind === 'scene_heading' ? 'action' : kind,
          );
          const words = WALKED_WORDS[kind](m.n);
          state = type(state, words);
          spoken.push({ kind: kind as ClassicKind, words });
          expect(elementAt(state)?.kind, said.join(' ')).toBe(kind);
          // Autofill sent away, as a writer would; Escape then Enter, as Escape then Tab leaves.
          let key = m.key;
          if (offerAt(state, state.selection.main.head, false)) {
            const view = new EditorView({ state });
            dismissOffer(view);
            state = view.state;
            view.destroy();
            key = 'Enter';
          }
          state = keys(state, key);
          said.push(`${kind} ${JSON.stringify(words)} ${key}`);
          pending = TABLE[kind][key];
          // A Parenthetical arrives as its `()`, the cursor inside; the rest as an empty line.
          expect(elementAt(state), said.join(' ')).toMatchObject({
            kind: pending,
            pending: pending !== 'parenthetical',
          });
        }
        // What the last key made (an empty line, or a `()`) the oracle doesn't hold: the text up to it.
        const text = state.doc.toString();
        const expected = fountainOf(spoken, 'screenplay');
        expect(text.startsWith(expected), said.join('\n')).toBe(true);
        expect(text.slice(expected.length), said.join('\n')).toMatch(/^(?:\n{1,2}|\n\(\))$/);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});
