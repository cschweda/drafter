import { parse, type Span } from '@drafter/fountain';
import { type LayoutLine, type Page, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { buildPage, shiftOf, shiftPage } from '../src/page';
import { featureScript } from './scripts';

const screenplay = builtins['us-screenplay'] as Template;
// The header, the footer, and the scene numbers are furniture a shift must leave alone.
const furnished: Template = {
  ...screenplay,
  page: { ...screenplay.page, header: 'DRAFT', footer: 'Page {n}' },
};

const pagesOf = (source: string, template = furnished): Page[] =>
  paginate(parse(source), template, { sceneNumbers: true }).pages;

/** Every kind of page: a title page, speeches split across pages, dual dialogue, and furniture. */
const rich = pagesOf(featureScript({ scenes: 12, paged: true }));

/** How many lines of a page, right parts too, are from a block. */
function blockLines(page: Page): number {
  const parts = page.lines.flatMap((line) => (line.right ? [line, line.right] : [line]));
  return parts.filter((line) => line.blockIndex >= 0).length;
}

/** A page as it would be had the source moved: every offset by `offset`, every block number by `block`. */
function shifted(page: Page, offset: number, block: number): Page {
  const move = (span: Span): Span => ({ from: span.from + offset, to: span.to + offset });
  const line = (l: LayoutLine): LayoutLine => ({
    ...l,
    span: move(l.span),
    blockIndex: l.blockIndex < 0 ? l.blockIndex : l.blockIndex + block,
    runs: l.runs.map((run) => ({ ...run, span: move(run.span) })),
    ...(l.right ? { right: line(l.right) } : {}),
  });
  return { ...structuredClone(page), lines: page.lines.map(line) };
}

/** The moves worth trying on a page: forward and back, and with blocks added or taken away. */
function movesOf(page: Page): Array<[number, number]> {
  const first = Math.min(
    ...page.lines.flatMap((l) => (l.right ? [l, l.right] : [l])).map((l) => l.blockIndex),
  );
  return [
    [3, 0],
    [-2, 0],
    [11, 1],
    [0, 2],
    [-5, first > 0 ? -1 : 0],
  ];
}

describe('the pages these tests move', () => {
  it('hold every kind of line a shift has to handle', () => {
    const lines = rich.flatMap((page) => page.lines.flatMap((l) => (l.right ? [l, l.right] : [l])));
    expect(rich[0]?.number).toBe(0);
    expect(rich.length).toBeGreaterThan(10);
    expect(lines.some((l) => l.right)).toBe(true);
    for (const synthetic of ['blank', 'title', 'more', 'contd']) {
      expect(
        lines.some((l) => l.synthetic === synthetic),
        synthetic,
      ).toBe(true);
    }
    expect(lines.some((l) => l.runs.some((run) => run.synthetic))).toBe(true);
    expect(lines.some((l) => l.runs.length > 1)).toBe(true);
    expect(rich.some((p) => p.sceneNumbersLeft.length > 0 && p.sceneNumbersRight.length > 0)).toBe(
      true,
    );
    expect(rich.some((p) => p.pageNumber && p.header && p.footer)).toBe(true);
  });
});

describe('shiftOf', () => {
  it('finds how far a page moved in the source', () => {
    for (const page of rich) {
      for (const [offset, block] of movesOf(page)) {
        // A page with no block lines (the title page) has no block number to have moved.
        const moved = blockLines(page) > 0 ? block : 0;
        expect(shiftOf(page, shifted(page, offset, block)), `page ${page.number}`).toEqual({
          offset,
          block: moved,
        });
      }
    }
  });

  it('finds no shift in a page that did not move', () => {
    for (const page of rich)
      expect(shiftOf(page, structuredClone(page))).toEqual({ offset: 0, block: 0 });
  });

  it('finds no shift when a line, a run, or a right part is added or taken away', () => {
    const withRight = rich.find((p) => p.lines.some((l) => l.right)) as Page;
    const withRuns = rich.find((p) => p.lines.some((l) => l.runs.length > 1)) as Page;

    const fewer = shifted(withRuns, 4, 0);
    fewer.lines.pop();
    expect(shiftOf(withRuns, fewer)).toBeNull();

    const more = shifted(withRuns, 4, 0);
    more.lines.push(more.lines[0] as LayoutLine);
    expect(shiftOf(withRuns, more)).toBeNull();

    const run = shifted(withRuns, 4, 0);
    (run.lines.find((l) => l.runs.length > 1) as LayoutLine).runs.pop();
    expect(shiftOf(withRuns, run)).toBeNull();

    const lost = shifted(withRight, 4, 0);
    delete (lost.lines.find((l) => l.right) as LayoutLine).right;
    expect(shiftOf(withRight, lost)).toBeNull();

    // And the other way: a right part that the page did not have.
    expect(shiftOf(lost, shifted(withRight, 4, 0))).toBeNull();
  });

  it('finds no shift when only some offsets moved', () => {
    const page = rich[3] as Page;
    const one = (change: (moved: Page) => void) => {
      const moved = shifted(page, 4, 0);
      change(moved);
      return shiftOf(page, moved);
    };
    // A line's span, a run's span, or a right part's span that stayed where it was.
    expect(
      one((moved) => ((moved.lines[0] as LayoutLine).span = page.lines[0]?.span as Span)),
    ).toBeNull();
    const withRun = page.lines.findIndex((l) => l.runs.length > 0);
    expect(
      one((moved) => {
        const run = (moved.lines[withRun] as LayoutLine).runs[0];
        if (run) run.span = (page.lines[withRun] as LayoutLine).runs[0]?.span as Span;
      }),
    ).toBeNull();
    const dual = rich.find((p) => p.lines.some((l) => l.right)) as Page;
    const moved = shifted(dual, 4, 0);
    const at = dual.lines.findIndex((l) => l.right);
    (moved.lines[at] as LayoutLine).right = (dual.lines[at] as LayoutLine).right;
    expect(shiftOf(dual, moved)).toBeNull();
  });

  it('finds no shift when the blocks moved by different amounts, or a synthetic line got a block', () => {
    const page = rich[3] as Page;
    const blocks = page.lines.map((l, i) => [l, i] as const).filter(([l]) => l.blockIndex >= 0);
    const [, last] = blocks.at(-1) as readonly [LayoutLine, number];
    const split = shifted(page, 4, 1);
    (split.lines[last] as LayoutLine).blockIndex += 1;
    expect(shiftOf(page, split)).toBeNull();

    const none = page.lines.findIndex((l) => l.blockIndex < 0);
    const given = shifted(page, 4, 1);
    (given.lines[none] as LayoutLine).blockIndex = 0;
    expect(shiftOf(page, given)).toBeNull();

    // A block that goes below zero is no block any more, even when every block moved alike.
    const lowest = Math.min(...blocks.map(([l]) => l.blockIndex));
    expect(shiftOf(page, shifted(page, 4, -(lowest + 1)))).toBeNull();
    expect(shiftOf(page, shifted(page, 4, -lowest))).toEqual({ offset: 4, block: -lowest });
  });

  it('notices a change to any field of a line, a run, or a page', () => {
    // Anything but an offset or a block number that moved the same as the rest, in any field the
    // layout emits, must be seen: the DOM is built from all of them. So change each in turn.
    type Leaf = { owner: Record<string, unknown>; key: string; path: string };
    const leavesOf = (value: unknown, path: string, out: Leaf[] = []): Leaf[] => {
      if (typeof value !== 'object' || value === null) return out;
      for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'object' && item !== null) leavesOf(item, `${path}.${key}`, out);
        else out.push({ owner: value as Record<string, unknown>, key, path: `${path}.${key}` });
      }
      return out;
    };
    const change = (value: unknown) =>
      typeof value === 'number' ? value + 1 : typeof value === 'string' ? `${value}x` : !value;

    let checked = 0;
    for (const page of rich) {
      const copy = structuredClone(page);
      // One block number that moved alone is a shift of a page that has just the one.
      const lone = blockLines(page) < 2;
      for (const { owner, key, path } of leavesOf(copy, `page ${page.number}`)) {
        if (lone && key === 'blockIndex') continue;
        const was = owner[key];
        owner[key] = change(was);
        expect(shiftOf(page, copy), path).toBeNull();
        owner[key] = was;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });
});

describe('shiftPage', () => {
  it('leaves a page as if it had been built from the moved source', () => {
    for (const page of rich) {
      for (const [offset, block] of movesOf(page)) {
        const patched = buildPage(document, page, furnished);
        const before = patched.outerHTML;
        shiftPage(patched, { offset, block });
        const built = buildPage(document, shifted(page, offset, block), furnished);
        expect(patched.outerHTML, `page ${page.number}`).toBe(built.outerHTML);
        if (offset !== 0) expect(patched.outerHTML).not.toBe(before);
      }
    }
  });

  it('moves the offsets of the lines and the numbers of the blocks, and nothing else', () => {
    const page = rich[1] as Page;
    const el = buildPage(document, page, furnished);
    const lines = [...el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')];
    const blocks = [...el.querySelectorAll<HTMLElement>('.drafter-block[data-block]')];
    expect(lines.length).toBeGreaterThan(3);
    expect(blocks.length).toBeGreaterThan(3);
    const was = lines.map((l) => [l.dataset.from, l.dataset.to]);
    const wasBlocks = blocks.map((b) => b.dataset.block);
    shiftPage(el, { offset: 10, block: 2 });
    expect(lines.map((l) => [l.dataset.from, l.dataset.to])).toEqual(
      was.map(([from, to]) => [String(Number(from) + 10), String(Number(to) + 10)]),
    );
    expect(blocks.map((b) => b.dataset.block)).toEqual(wasBlocks.map((b) => String(Number(b) + 2)));
    // The furniture has no offset to move.
    expect(el.querySelectorAll('.drafter-furniture[data-from]')).toHaveLength(0);
  });
});
