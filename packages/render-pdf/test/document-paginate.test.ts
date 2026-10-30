import { describe, expect, it } from 'vitest';
import type { DocLine } from '../src/document/lines';
import { MIN_LINES, paginate } from '../src/document/paginate';

/** A block of lines of the given heights (no fragments: pagination reads only heights). */
const block = (heights: number[], spaceBefore = 0, keepWithNext = false) => ({
  lines: heights.map((height): DocLine => ({ fragments: [], height, ascent: 0 })),
  spaceBefore,
  keepWithNext,
});
const lines = (count: number, height: number) => Array.from({ length: count }, () => height);
const heading = (height: number, spaceBefore = 0) => block([height], spaceBefore, true);

describe('paginate', () => {
  it('keeps at least two lines each side of a split', () => {
    expect(MIN_LINES).toBe(2);
  });

  it('fills a page and starts the next', () => {
    const pages = paginate([block([30]), block([30]), block([30]), block([30])], 100);
    expect(pages).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 30 },
        { block: 2, from: 0, to: 1, top: 60 },
      ],
      [{ block: 3, from: 0, to: 1, top: 0 }],
    ]);
  });

  it('drops the space before a block at the top of a page', () => {
    const pages = paginate([block([40], 10), block([40], 10), block([40], 10)], 100);
    expect(pages).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 50 },
      ],
      [{ block: 2, from: 0, to: 1, top: 0 }],
    ]);
  });

  it('never splits a block of two or three lines', () => {
    // Two of the three lines would fit under the first block.
    expect(paginate([block([50]), block(lines(3, 20))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 3, top: 0 }],
    ]);
    expect(paginate([block([70]), block(lines(2, 20))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 2, top: 0 }],
    ]);
  });

  it('leaves at least two lines each side of a split', () => {
    // Three of four lines fit: two stay, two go.
    expect(paginate([block([70]), block(lines(4, 10))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 2, top: 70 },
      ],
      [{ block: 1, from: 2, to: 4, top: 0 }],
    ]);
    // Only one fits: the whole block moves.
    expect(paginate([block([85]), block(lines(4, 10))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 4, top: 0 }],
    ]);
    // Nine of ten fit: eight stay, two go.
    expect(paginate([block([10]), block(lines(10, 10))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 8, top: 10 },
      ],
      [{ block: 1, from: 8, to: 10, top: 0 }],
    ]);
    // A block longer than two pages splits on each.
    const pages = paginate([block(lines(25, 10))], 100);
    expect(pages.map((page) => page.map(({ from, to }) => [from, to]))).toEqual([
      [[0, 10]],
      [[10, 20]],
      [[20, 25]],
    ]);
  });

  it('moves a heading with the first two lines of what follows', () => {
    // 70 + 20 + two lines of 10 is past 100: the heading moves.
    expect(paginate([block([70]), heading(20), block(lines(5, 10))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [
        { block: 1, from: 0, to: 1, top: 0 },
        { block: 2, from: 0, to: 5, top: 20 },
      ],
    ]);
    // 60 + 20 + 20 fits: the heading stays, with two lines under it.
    expect(paginate([block([60]), heading(20), block(lines(5, 10))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 60 },
        { block: 2, from: 0, to: 2, top: 80 },
      ],
      [{ block: 2, from: 2, to: 5, top: 0 }],
    ]);
    // A block of three lines can't split, so all three must fit under the heading: two would.
    expect(paginate([block([60]), heading(20), block(lines(3, 10))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [
        { block: 1, from: 0, to: 1, top: 0 },
        { block: 2, from: 0, to: 3, top: 20 },
      ],
    ]);
  });

  it('moves a chain of headings with the first two lines of what follows', () => {
    // Both headings fit under the first block, but not with the two lines after them: both move.
    const pages = paginate(
      [block([50]), heading(20, 5), heading(20, 5), block(lines(4, 10), 5)],
      100,
    );
    expect(pages).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [
        { block: 1, from: 0, to: 1, top: 0 },
        { block: 2, from: 0, to: 1, top: 25 },
        { block: 3, from: 0, to: 4, top: 50 },
      ],
    ]);
  });

  it('a heading may end the document', () => {
    expect(paginate([block([70]), heading(20)], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 70 },
      ],
    ]);
    expect(paginate([block([90]), heading(20)], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 1, top: 0 }],
    ]);
  });

  it('fills the page when a block can’t keep its rules', () => {
    // A heading and the three lines after it are taller than a page: they fill it as they come.
    expect(paginate([block([30]), heading(30), block(lines(3, 40))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 30 },
        { block: 2, from: 0, to: 1, top: 60 },
      ],
      [{ block: 2, from: 1, to: 3, top: 0 }],
    ]);
    // A heading whose next two lines are each most of a page.
    expect(paginate([heading(20), block(lines(4, 90))], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 1, to: 2, top: 0 }],
      [{ block: 1, from: 2, to: 3, top: 0 }],
      [{ block: 1, from: 3, to: 4, top: 0 }],
    ]);
    // A three-line block taller than an empty page.
    expect(paginate([block([30]), block(lines(3, 40))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 30 },
      ],
      [{ block: 1, from: 1, to: 3, top: 0 }],
    ]);
    // A line taller than the page still gets a page of its own, and the walk ends.
    expect(paginate([block([30]), block([250]), block([30])], 100)).toEqual([
      [{ block: 0, from: 0, to: 1, top: 0 }],
      [{ block: 1, from: 0, to: 1, top: 0 }],
      [{ block: 2, from: 0, to: 1, top: 0 }],
    ]);
  });

  it('relaxes the rules only on the page a block shares with a heading it can’t keep', () => {
    // 60 + two lines of 25 is past 100: the block fills the heading's page with one line, then
    // splits by the usual rule, leaving two lines for the last page rather than one.
    expect(paginate([heading(60), block(lines(6, 25))], 100)).toEqual([
      [
        { block: 0, from: 0, to: 1, top: 0 },
        { block: 1, from: 0, to: 1, top: 60 },
      ],
      [{ block: 1, from: 1, to: 4, top: 0 }],
      [{ block: 1, from: 4, to: 6, top: 0 }],
    ]);
  });

  it('an empty document is one empty page', () => {
    expect(paginate([], 100)).toEqual([[]]);
  });
});
