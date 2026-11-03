// The model test of Classic Mode design §15.1: elements typed key by key, as a writer types them
// (Enter, Tab, the chooser's pick, letters, and an accepted name), give the oracle's bytes, and
// those bytes parse back to the same elements. The oracle (oracle.ts) is written from the spec
// alone; a failure here is a bug in Classic Mode, fixed there, never by changing the oracle.
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { render } from './harness';
import { fountainOf, meant, type OracleTemplate, readBack } from './oracle';
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
