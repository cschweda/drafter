import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { linesOf } from '../app/scaffold/lines';
import { speechesOf } from '../app/scaffold/pages';

// A character's lines on their Scaffold page (seeing-the-script design §5.3): each speech's printed
// text, read from the parse at its cue, in order. Nothing is counted here.

const screenplay = builtins['us-screenplay'] as Template;

/** A boatyard at dusk, written for these tests. */
const YARD = `INT. BOATYARD - DUSK

ODA
(to the hull)
Hold still, you old tub.
Just one more plank.

PIM
She can't hear you.

ODA
She hears **everything**.

EXT. SLIPWAY - NIGHT

ODA
Push [[a note to myself]] on three.
[[She counts under her breath.]]
One, two...
`;

function linesFor(key: string, text = YARD) {
  const doc = parse(text);
  const index = sceneIndex(doc, screenplay, null);
  return { doc, lines: linesOf(doc, speechesOf(index, key)) };
}

describe('a character’s lines', () => {
  test('every speech’s printed text, in order', () => {
    const { doc, lines } = linesFor('ODA');
    expect(lines.map((l) => l.scene)).toEqual([0, 0, 1]);
    expect(lines[1]?.text).toBe('She hears everything.');
    // Each points at its cue's block.
    for (const line of lines) expect(doc.blocks[line.block]?.kind).toBe('character');
    expect(linesFor('PIM').lines.map((l) => l.text)).toEqual(["She can't hear you."]);
  });

  test('a parenthetical stays in its parentheses', () => {
    const { lines } = linesFor('ODA');
    expect(lines[0]?.text).toBe('(to the hull) Hold still, you old tub. Just one more plank.');
  });

  test('notes inside a speech are left out', () => {
    const { lines } = linesFor('ODA');
    expect(lines[2]?.text).toBe('Push on three. One, two...');
  });

  test('a speech ends at a blank line', () => {
    const { lines } = linesFor('ODA', 'INT. SHED - DAY\n\nODA\n(nods)\n\nThe wind drops.\n');
    expect(lines).toEqual([{ scene: 0, block: 1, text: '(nods)' }]);
  });
});
