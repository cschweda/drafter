import type { LayoutLine, Page } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { buildPage } from '../src/page';

// A page holds as many lines as its template is tall, and a template can be tall. Each case
// is a hostile page shaped to make a careless builder super-linear, and it must still build
// well inside a second. The pages are made by hand, so only the builder is timed.
const screenplay = builtins['us-screenplay'] as Template;

function line(role: string, block: number, text: string, right?: LayoutLine): LayoutLine {
  const span = { from: block, to: block + 1 };
  return {
    col: 0,
    runs: [{ text, bold: false, italic: false, underline: false, span }],
    role,
    blockIndex: block,
    span,
    right,
  };
}

const page = (lines: LayoutLine[]): Page => ({
  number: 1,
  lines,
  sceneNumbersLeft: [],
  sceneNumbersRight: [],
});

const rows = (count: number, make: (i: number) => LayoutLine) =>
  Array.from({ length: count }, (_, i) => make(i));

const cases: Array<[string, () => Page]> = [
  [
    'a cue that runs to twenty thousand lines',
    () => page([...rows(20_000, () => line('character', 0, 'NAME')), line('dialogue', 1, 'Talk.')]),
  ],
  [
    'ten thousand speeches',
    () => page(rows(20_000, (i) => line(i % 2 === 0 ? 'character' : 'dialogue', i, 'Talk.'))),
  ],
  [
    'ten thousand lines of dual dialogue, a block to a column',
    () => page(rows(10_000, () => line('dialogue', 1, 'Left.', line('dialogue', 2, 'Right.')))),
  ],
  [
    'ten thousand lines of dual dialogue, a block to a line',
    () =>
      page(
        rows(10_000, (i) =>
          line('dialogue', 2 * i, 'Left.', line('dialogue', 2 * i + 1, 'Right.')),
        ),
      ),
  ],
  [
    'ten thousand blocks of one line each',
    () => page(rows(10_000, (i) => line('action', i, 'Talk.'))),
  ],
  [
    'a line of two million characters, controls among them',
    () => page([line('action', 0, 'word\u0007 '.repeat(300_000))]),
  ],
];

describe('hostile pages', () => {
  for (const [label, make] of cases) {
    it(`builds ${label} in under a second`, () => {
      const hostile = make();
      const start = performance.now();
      buildPage(document, hostile, screenplay);
      expect(performance.now() - start).toBeLessThan(1000);
    }, 60_000);
  }
});
