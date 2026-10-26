import { parse } from '@drafter/fountain';
import { lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

// Inputs shaped to make a careless linter super-linear: each is a hostile file that must
// still lint well inside a second. (The editor lints on the main thread, a moment after
// typing stops.) The source is parsed and fully read first, so only the linter is timed.
const screenplay = builtins['us-screenplay'] as Template;

/** The script parsed, with everything a rule reads already worked out. */
function parsed(source: string) {
  const doc = parse(source);
  for (const block of doc.blocks) {
    void block.sem;
    for (const line of block.lines) void line.inline;
  }
  return doc;
}

/** Twenty thousand different names, each cued once with a line of speech. */
const cast = Array.from({ length: 20_000 }, (_, i) => `NAME${i}`);

/** Each name cued once, with a line of speech. */
const cues = (names: Iterable<string>) => [...names].map((name) => `${name}\nHi.\n\n`).join('');

/** Numbers from a fixed seed, so the "random" names are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** `count` different names of `length` letters from `alphabet`. */
function randomNames(count: number, length: number, alphabet: string, seed: number): Set<string> {
  const next = seeded(seed);
  const names = new Set<string>();
  while (names.size < count) {
    let name = '';
    for (let i = 0; i < length; i++) name += alphabet.charAt(Math.floor(next() * alphabet.length));
    names.add(name);
  }
  return names;
}

/**
 * How many pairs of these names, which are all as long as each other, are one edit apart: they
 * differ in one letter of `alphabet`, or in two letters side by side that have changed places.
 * Found by making every such change to each name and looking it up, which is not how the rule
 * does it.
 */
function pairsOneEditApart(names: ReadonlySet<string>, alphabet: string): number {
  let pairs = 0;
  for (const name of names) {
    for (let i = 0; i < name.length; i++) {
      for (const letter of alphabet) {
        const other = name.slice(0, i) + letter + name.slice(i + 1);
        // Counting a pair from its smaller name leaves out the name itself and counts each once.
        if (other > name && names.has(other)) pairs++;
      }
      if (i + 1 < name.length) {
        const swapped = name.slice(0, i) + name.charAt(i + 1) + name.charAt(i) + name.slice(i + 2);
        if (swapped > name && names.has(swapped)) pairs++;
      }
    }
  }
  return pairs;
}

/** A label, the script, and how many problems the linter must find in it. */
const cases: Array<[string, () => string, number]> = [
  ['tens of thousands of unclosed notes in one paragraph', () => '[[ '.repeat(60_000), 60_000],
  [
    'fifty thousand headings with text right below them',
    () => 'INT. HALL - DAY\nShe waits.\n\n'.repeat(50_000),
    50_000,
  ],
  [
    'fifty thousand headings whose lines end inside a note',
    () => 'INT. HALL - DAY [[a\nb]]\nShe waits.\n\n'.repeat(50_000),
    50_000,
  ],
  [
    'twenty thousand headings after two hundred thousand notes',
    () => `${'[[x]] '.repeat(200_000)}\n\n${'INT. HALL - DAY\nShe waits.\n\n'.repeat(20_000)}`,
    20_000,
  ],
  [
    'fifty thousand wrapped parentheticals',
    () => 'MARGARET\n(quietly,\n   then louder)\nHi.\n\n'.repeat(50_000),
    50_000,
  ],
  [
    'a parenthetical of a hundred thousand lines',
    () => `MARGARET\n(aside\n${'more \n'.repeat(100_000)}end)\nBye.\n`,
    1,
  ],
  [
    'a parenthetical of a hundred thousand CRLF lines',
    () => `MARGARET\r\n(aside\r\n${'  more\r\n'.repeat(100_000)}end)\r\nBye.\r\n`,
    1,
  ],
  [
    'a parenthetical with two hundred thousand spaces around its line break',
    () => `MARGARET\n(aside${' '.repeat(200_000)}\n${' '.repeat(200_000)}end)\nBye.\n`,
    1,
  ],
  // The first of the fifty thousand speeches has no one before it, so the layout adds nothing.
  ["fifty thousand typed (CONT'D)s", () => "MARGARET (CONT'D)\nHi.\n\n".repeat(50_000), 49_999],
  [
    "a cue with two hundred thousand spaces on each side of its (CONT'D)",
    () =>
      `MARGARET\nHi.\n\nShe sits.\n\nMARGARET${' '.repeat(200_000)}(CONT'D)${' '.repeat(200_000)}\nHi.\n`,
    1,
  ],
  [
    "fifty thousand scenes, each with a typed (CONT'D) after a page break",
    () => "INT. HALL - DAY\n\nMARGARET\nHi.\n\n===\n\nMARGARET (CONT'D)\nHi.\n\n".repeat(50_000),
    50_000,
  ],
  [
    "a typed (CONT'D) after a speech of a hundred thousand parentheticals",
    () => `MARGARET\n${'(softly)\n'.repeat(100_000)}Hi.\n\nShe sits.\n\nMARGARET (CONT'D)\nHi.\n`,
    1,
  ],
  [
    "twenty-five thousand pairs of dual dialogue, each with a typed (CONT'D)",
    () => "MARGARET\nHi.\n\nDANNY (CONT'D) ^\nYo.\n\nMARGARET (CONT'D) ^\nHi.\n\n".repeat(25_000),
    0,
  ],
  ['fifty thousand headings with no time', () => 'INT. HALL\n\n'.repeat(50_000), 50_000],
  ['fifty thousand transitions in a row', () => 'CUT TO:\n\n'.repeat(50_000), 49_999],
  [
    'fifty thousand transitions, each followed by a note',
    () => 'CUT TO:\n\n[[n]]\n\n'.repeat(50_000),
    49_999,
  ],
  [
    'a transition, a hundred thousand notes, and then action',
    () => `CUT TO:\n\n${'[[n]]\n\n'.repeat(100_000)}She waits.\n`,
    1,
  ],
  [
    'twenty thousand cue-like lines, each the name of one of twenty thousand characters',
    () =>
      cast.map((name) => `${name}\nHi.\n\n`).join('') +
      cast.map((name) => `${name}\n\nShe waits.\n\n`).join(''),
    20_000,
  ],
  [
    'a hundred thousand blank lines between a cue-like line and a parenthetical',
    () => `NARRATOR${'\n'.repeat(100_000)}(quietly)\nHi.\n`,
    0,
  ],
  [
    'a cue-like line of a hundred thousand empty extensions',
    () => `NARRATOR${'()'.repeat(100_000)}\n\n(quietly)\nHi.\n`,
    1,
  ],
  [
    'a line of two hundred thousand open parentheses after a name',
    () => `NARRATOR${'('.repeat(200_000)}\n\n(quietly)\nHi.\n`,
    0,
  ],
  // The three below are about similar-names: each name is a cue, with a line of speech.
  [
    'two cues of two hundred thousand letters each, one letter apart',
    () => `${'A'.repeat(200_000)}\nHi.\n\n${'A'.repeat(199_999)}B\nHi.\n`,
    0,
  ],
  [
    'twenty thousand names that differ in one letter, all of them one series',
    () =>
      cues(Array.from({ length: 20_000 }, (_, i) => `ABCDE${String.fromCodePoint(0x4e00 + i)}`)),
    0,
  ],
  // The longest names that are compared: each takes thirty-three keys of thirty-one letters.
  [
    'twenty thousand different names of thirty-two letters',
    () => cues(randomNames(20_000, 32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 32)),
    0,
  ],
];

describe('hostile input', () => {
  for (const [label, make, problems] of cases) {
    it(`lints ${label} in under a second`, () => {
      const doc = parsed(make());
      const start = performance.now();
      const found = lint(doc, screenplay);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(found).toHaveLength(problems);
    }, 120_000);
  }

  it('lints a hostile 200 KB script in under a second', () => {
    // About 100 KB of one-line upper-case paragraphs alternating with `(` lines, each pair
    // set to make character-without-dialogue look further than it should, then about 100 KB
    // of transitions in a row, to make transition-not-last do the same.
    const source = `${'SHOUT\n\n(\n\n'.repeat(10_000)}${'CUT TO:\n\n'.repeat(11_000)}`;
    expect(source.length).toBeGreaterThan(190_000);
    expect(source.length).toBeLessThan(210_000);

    const doc = parsed(source);
    const start = performance.now();
    const found = lint(doc, screenplay);
    expect(performance.now() - start).toBeLessThan(1000);

    const count = (id: string) => found.filter((d) => d.ruleId === id).length;
    expect(count('character-without-dialogue')).toBe(10_000);
    // Every transition but the last, which ends the script.
    expect(count('transition-not-last')).toBe(10_999);
    expect(found).toHaveLength(20_999);
  }, 120_000);

  it('checks 20,000 names in under a second', () => {
    // Twenty thousand different six-letter names, each cued once. They come from twelve letters,
    // so that thousands of them are one edit from another name.
    const alphabet = 'ABCDEFGHIJKL';
    const names = randomNames(20_000, 6, alphabet, 2026);
    const doc = parsed(cues(names));
    const start = performance.now();
    const found = lint(doc, screenplay);
    expect(performance.now() - start).toBeLessThan(1000);

    // One diagnostic for each pair, found another way: a rule that found nothing would be fast too.
    const pairs = pairsOneEditApart(names, alphabet);
    expect(pairs).toBeGreaterThan(1000);
    expect(found.every((d) => d.ruleId === 'similar-names')).toBe(true);
    expect(found).toHaveLength(pairs);
  }, 120_000);
});
