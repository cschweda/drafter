import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

// Inputs shaped to make a careless paginator super-linear: each is a hostile
// file that must still lay out well inside a second. The source is parsed and
// fully read first, so only pagination is timed.
const screenplay = builtins['us-screenplay'] as Template;

const cases: Array<[string, () => string]> = [
  ['a speech of three hundred thousand lines', () => `MARGARET\n${'Talk.\n'.repeat(300_000)}`],
  [
    'a parenthetical of a hundred thousand lines',
    () => `MARGARET\nHi.\n(aside\n${'more\n'.repeat(100_000)}end)\nBye.\n`,
  ],
  [
    'two speeches side by side, a hundred and fifty thousand lines each',
    () => `MARGARET\n${'Hi.\n'.repeat(150_000)}\nDANNY ^\n${'Yo.\n'.repeat(150_000)}`,
  ],
  ['fifty thousand speeches by one speaker', () => 'MARGARET\nHi.\n\n'.repeat(50_000)],
  ['thirty thousand scene headings in a row', () => 'INT. HALL - DAY\n\n'.repeat(30_000)],
  ['an action line of half a million characters', () => `${'word '.repeat(100_000)}\n`],
  ['a word of two hundred thousand letters', () => `${'x'.repeat(200_000)}\n`],
  ['fifty thousand page breaks', () => '===\n\nA.\n\n'.repeat(50_000)],
  [
    'a title page of two hundred thousand lines',
    () => `Title: The Call\n${'    and more\n'.repeat(200_000)}\nAction.\n`,
  ],
];

describe('hostile input', () => {
  for (const [label, make] of cases) {
    it(`lays out ${label} in under a second`, () => {
      const doc = parse(make());
      for (const block of doc.blocks) {
        void block.sem;
        for (const line of block.lines) void line.inline;
      }
      const start = performance.now();
      paginate(doc, screenplay);
      expect(performance.now() - start).toBeLessThan(1000);
    }, 120_000);
  }
});
