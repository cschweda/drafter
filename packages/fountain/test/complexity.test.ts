import { parse } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';

// Inputs shaped to make a careless parser super-linear: each is a hostile file
// that must still parse well inside a second. (The editor parses on the main
// thread, so a slow parse would freeze typing.)
const readAll = (source: string) => {
  for (const block of parse(source).blocks) {
    void block.sem;
    for (const line of block.lines) void line.inline;
  }
};

const cases: Array<[string, () => string]> = [
  ['a long line that might be a character cue', () => `A${' '.repeat(3000)}x(\nmore\n`],
  [
    'a long title-page line with no colon',
    () => `Title${' '.repeat(3000)}x\nAuthor: A\n\nAction.\n`,
  ],
  ['tens of thousands of unclosed notes in one paragraph', () => '[[ '.repeat(60_000)],
  ['one paragraph of fifty thousand forced transitions', () => '> X\n'.repeat(50_000)],
  ['deeply nested emphasis', () => `${'**a '.repeat(25_000)}x${' a**'.repeat(25_000)}\n`],
  ['a scene heading with a long run of spaces', () => `INT. HOUSE${' '.repeat(30_000)}x#\n`],
  ['fifty thousand note blocks', () => '[[n]]\n\n'.repeat(50_000)],
  [
    'emphasis closers that match no opener',
    () => `${'*a '.repeat(30_000)}${'b_ '.repeat(30_000)}\n`,
  ],
];

describe('deep emphasis', () => {
  it('still styles text nested past 32,767 levels', () => {
    const depth = 40_000;
    const doc = parse(`${'**a '.repeat(depth)}x${' a**'.repeat(depth)}\n`);
    const runs = doc.blocks[0]?.lines[0]?.inline ?? [];
    expect(runs.find((r) => r.text.includes('x'))?.bold).toBe(true);
  });
});

describe('hostile input', () => {
  for (const [label, make] of cases) {
    it(`parses ${label} in under a second`, () => {
      const source = make();
      const start = performance.now();
      readAll(source);
      expect(performance.now() - start).toBeLessThan(1000);
    }, 120_000);
  }
});
