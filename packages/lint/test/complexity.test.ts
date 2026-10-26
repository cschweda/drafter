import { parse } from '@drafter/fountain';
import { lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

// Inputs shaped to make a careless linter super-linear: each is a hostile file that must
// still lint well inside a second. (The editor lints on the main thread, a moment after
// typing stops.) The source is parsed and fully read first, so only the linter is timed.
const screenplay = builtins['us-screenplay'] as Template;

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
];

describe('hostile input', () => {
  for (const [label, make, problems] of cases) {
    it(`lints ${label} in under a second`, () => {
      const doc = parse(make());
      for (const block of doc.blocks) {
        void block.sem;
        for (const line of block.lines) void line.inline;
      }
      const start = performance.now();
      const found = lint(doc, screenplay);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(found).toHaveLength(problems);
    }, 120_000);
  }
});
