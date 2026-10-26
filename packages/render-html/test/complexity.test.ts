import type { Layout, LayoutLine, Page } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPage } from '../src/page';
import { createScriptView } from '../src/view';

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

const page = (lines: LayoutLine[], number = 1): Page => ({
  number,
  lines,
  sceneNumbersLeft: [],
  sceneNumbersRight: [],
});

const rows = <T>(count: number, make: (i: number) => T): T[] =>
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

// The view's update runs after every edit: it compares each page with the last one drawn, and
// builds the pages that changed. These layouts have more pages, or a taller page, than any script
// does, and every step must still finish inside a second.
/** A layout of `count` pages with one line each, `word` on every one. */
const layoutOfPages = (count: number, word: string): Layout => ({
  pages: rows(count, (i) => page([line('action', i, word)], i + 1)),
  index: rows(count, (i) => ({ page: i + 1, line: 0 })),
  diagnostics: [],
});

describe('hostile layouts', () => {
  // jsdom has no scrollIntoView; reveal calls it once it has found the line.
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  /** Runs the steps in order on one view, each of which must take under a second. */
  async function stepsAreFast(steps: Array<[string, Layout]>) {
    const view = createScriptView(document.createElement('div'));
    for (const [step, layout] of steps) {
      const start = performance.now();
      await view.update(layout, screenplay);
      expect(performance.now() - start, step).toBeLessThan(1000);
      // Not `element.children`: reading that makes jsdom keep a live list up to date, and every
      // removal after it takes as long as the list is long.
      expect(view.element.querySelectorAll('.drafter-page'), step).toHaveLength(
        layout.pages.length,
      );
    }
  }

  it(
    'draws, compares, and clears ten thousand pages in under a second a step',
    () =>
      stepsAreFast([
        ['draws them all', layoutOfPages(10_000, 'Talk.')],
        ['finds them all unchanged', layoutOfPages(10_000, 'Talk.')],
        ['removes them all', layoutOfPages(0, '')],
      ]),
    60_000,
  );

  // jsdom takes as long to replace one child as the parent has children (a browser takes the same
  // time however many there are), so replacing every page of a big layout is quadratic here and
  // nowhere else. This layout is smaller than the one above for that reason.
  it(
    'replaces two thousand pages in under a second',
    () =>
      stepsAreFast([
        ['draws them all', layoutOfPages(2000, 'Talk.')],
        ['replaces them all', layoutOfPages(2000, 'Said.')],
      ]),
    60_000,
  );

  it('reveals a line on a page of twenty thousand lines in under a second', async () => {
    const view = createScriptView(document.createElement('div'));
    const tall = rows(20_000, (i) => line('action', i, 'Talk.'));
    await view.update(
      {
        pages: [page(tall)],
        index: rows(20_000, (i) => ({ page: 1, line: i })),
        diagnostics: [],
      },
      screenplay,
    );
    expect(view.element.querySelectorAll('.drafter-line')).toHaveLength(20_000);
    const start = performance.now();
    for (let i = 0; i < 3; i++) view.reveal(19_999 - i);
    expect(performance.now() - start).toBeLessThan(1000);
  }, 60_000);
});
