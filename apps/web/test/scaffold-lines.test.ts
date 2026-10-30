import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { cueTarget, lineGroups, linesOf } from '../app/scaffold/lines';
import { lineHeading, speechesOf } from '../app/scaffold/pages';

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
    expect(lines).toEqual([{ scene: 0, item: 0, before: false, block: 1, text: '(nods)' }]);
  });
});

/**
 * A canal journey in acts, written for these tests: ODA speaks before anything, in Act One's own
 * stretch before its first scene, in a scene, then in Act Two's and Act Three's own stretches one
 * after the other, with no scene of hers between.
 */
const LOCKS = `ODA
Cast off.

# Act One

ODA
The first lock.

INT. LOCK KEEPER'S HUT - DAY

ODA
Paddles up.

# Act Two

ODA
The second lock.

# Act Three

ODA
The third lock.

EXT. TOWPATH - NIGHT

PIM
Done.
`;

describe('grouping a character’s lines', () => {
  test('a new group whenever the speech’s owner changes, even outside the scenes', () => {
    const { lines } = linesFor('ODA', LOCKS);
    expect(lines.map((l) => [l.scene, l.before])).toEqual([
      [null, true],
      [null, true],
      [0, false],
      [null, false],
      [null, false],
    ]);
    const groups = lineGroups(lines);
    // The opening, Act One's stretch, the hut, Act Two's stretch, Act Three's stretch.
    expect(groups.map((g) => g.lines.map((l) => l.at))).toEqual([[0], [1], [2], [3], [4]]);
  });

  test('each group’s heading says where its lines are', () => {
    const doc = parse(LOCKS);
    const index = sceneIndex(doc, screenplay, null);
    const lines = linesOf(doc, speechesOf(index, 'ODA'));
    expect(lines.map((l) => lineHeading(index, l))).toEqual([
      'Before the first scene',
      'Before the first scene, in Act One',
      "Scene 1 · INT. LOCK KEEPER'S HUT - DAY",
      'Between scenes, in Act Two',
      'Between scenes, in Act Three',
    ]);
  });

  test('“before the first scene” comes from the script, not from the lines shown', () => {
    // PIM's only speech is in Act Two's stretch, after a scene PIM isn't in.
    const text = 'INT. HUT - DAY\n\nODA\nHello.\n\n# Act Two\n\nPIM\nLate again.\n';
    const { lines } = linesFor('PIM', text);
    expect(lines.map((l) => l.before)).toEqual([false]);
  });
});

describe('going to a line’s cue', () => {
  /** The basis as Scaffold keeps it: the parse, the index, and each item's id then. */
  function basisOf(text: string) {
    const doc = parse(text);
    const index = sceneIndex(doc, screenplay, null);
    const ids = index.scenes.map((s) => `id-${s.heading}`);
    const items = index.items.map((i) => `id-${i.kind === 'scene' ? i.heading : i.title}`);
    return { doc, index, ids, items };
  }
  /** The script as it is now, its items found by the same ids. */
  function now(text: string) {
    const doc = parse(text);
    const index = sceneIndex(doc, screenplay, null);
    const byId = (id: string) =>
      index.items.find((i) => `id-${i.kind === 'scene' ? i.heading : i.title}` === id);
    const lineStart = (at: number) => text.lastIndexOf('\n', at - 1) + 1;
    return { text, itemById: byId, first: index.items[0]?.span.from ?? text.length, lineStart };
  }

  test('a cue in a scene lands at the start of its line, found by the scene’s id', () => {
    const basis = basisOf(LOCKS);
    const line = linesOf(basis.doc, speechesOf(basis.index, 'ODA'))[2];
    if (!line) throw new Error('no line');
    // Text added above the hut, and a few letters added inside it above ODA's cue.
    const later = LOCKS.replace('# Act One', 'A new line.\n\n# Act One').replace(
      "INT. LOCK KEEPER'S HUT - DAY\n",
      "INT. LOCK KEEPER'S HUT - DAY\n\nRain.\n",
    );
    const n = now(later);
    const at = cueTarget(basis, line, n, n.lineStart);
    if (at === null) throw new Error('no target');
    // Always the start of a line, inside the hut, and never in the middle of a word.
    expect(at).toBe(n.lineStart(at));
    const hut = n.itemById("id-INT. LOCK KEEPER'S HUT - DAY");
    expect(at).toBeGreaterThanOrEqual(hut?.span.from ?? -1);
    expect(at).toBeLessThanOrEqual(hut?.span.to ?? -1);
  });

  test('a cue in a section’s own stretch is found by that section’s id', () => {
    const basis = basisOf(LOCKS);
    const line = linesOf(basis.doc, speechesOf(basis.index, 'ODA'))[3];
    if (!line) throw new Error('no line');
    // A long paragraph added above Act Two moves it down.
    const later = LOCKS.replace('# Act Two', `${'Rain on the roof. '.repeat(20)}\n\n# Act Two`);
    const n = now(later);
    const at = cueTarget(basis, line, n, n.lineStart);
    expect(at).toBe(later.indexOf('ODA\nThe second lock.'));
  });

  test('a cue in the opening stays where it was, before the first heading', () => {
    const basis = basisOf(LOCKS);
    const line = linesOf(basis.doc, speechesOf(basis.index, 'ODA'))[0];
    if (!line) throw new Error('no line');
    const n = now(LOCKS);
    expect(cueTarget(basis, line, n, n.lineStart)).toBe(0);
  });

  test('a section that is gone goes nowhere', () => {
    const basis = basisOf(LOCKS);
    const line = linesOf(basis.doc, speechesOf(basis.index, 'ODA'))[3];
    if (!line) throw new Error('no line');
    const n = now(LOCKS.replace('# Act Two\n\n', ''));
    expect(cueTarget(basis, line, n, n.lineStart)).toBeNull();
  });
});
