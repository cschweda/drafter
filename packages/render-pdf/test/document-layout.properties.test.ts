import { PAPER_POINTS, type Paper } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { documentBlocks } from '../src/document/blocks';
import { type DocItem, type DocLayout, layoutDocument } from '../src/document/layout';
import { type DocLine, wrapBlock } from '../src/document/lines';
import { MIN_LINES, type PageSlice, paginate } from '../src/document/paginate';
import { STYLE } from '../src/document/style';
import { fixedMeasure, md } from './document-helpers';

// Invented words, so no sample text comes from anywhere else.
const WORDS = [
  'vorn',
  'taleb',
  'quisp',
  'marrowy',
  'ost',
  'plenk',
  'dravish',
  'ulm',
  'senner',
  'ka',
];
const arbWords = (min: number, max: number) =>
  fc.array(fc.constantFrom(...WORDS), { minLength: min, maxLength: max }).map((w) => w.join(' '));
const arbInline = fc.oneof(
  { weight: 6, arbitrary: arbWords(1, 6) },
  { weight: 1, arbitrary: arbWords(1, 3).map((w) => `**${w}**`) },
  { weight: 1, arbitrary: arbWords(1, 3).map((w) => `*${w}*`) },
  { weight: 1, arbitrary: arbWords(1, 2).map((w) => `\`${w}\``) },
  { weight: 1, arbitrary: arbWords(1, 8).map((w) => `[${w}](https://example.com/${w.length})`) },
  // A word too long for any line: it breaks at the edge.
  { weight: 1, arbitrary: fc.integer({ min: 40, max: 160 }).map((n) => 'z'.repeat(n)) },
);
const arbParagraph = fc
  .array(arbInline, { minLength: 1, maxLength: 24 })
  .chain((parts) => fc.boolean().map((hard) => parts.join(hard ? '  \n' : ' ')));
const arbHeading = fc
  .tuple(fc.integer({ min: 1, max: 6 }), arbWords(1, 12))
  .map(([level, text]) => `${'#'.repeat(level)} ${text}`);
const arbCode = fc
  .array(fc.integer({ min: 0, max: 140 }), { minLength: 1, maxLength: 40 })
  .map((lengths) => `\`\`\`\n${lengths.map((n) => 'q'.repeat(n)).join('\n')}\n\`\`\``);
const arbList = fc
  .tuple(
    fc.boolean(),
    fc.boolean(),
    fc.array(fc.tuple(arbParagraph, fc.option(arbParagraph)), { minLength: 1, maxLength: 6 }),
  )
  .map(([ordered, loose, items]) =>
    items
      .map(([text, inner], i) => {
        const mark = ordered ? `${i + 1}.` : '-';
        const pad = ' '.repeat(mark.length + 1);
        const nested = inner === null ? '' : `\n${pad}- ${inner}`;
        return `${mark} ${text}${nested}`;
      })
      .join(loose ? '\n\n' : '\n'),
  );
const arbQuote = fc
  .tuple(fc.integer({ min: 1, max: 3 }), fc.array(arbParagraph, { minLength: 1, maxLength: 3 }))
  .map(([depth, paragraphs]) =>
    paragraphs.map((p) => `${'> '.repeat(depth)}${p}`).join(`\n${'>'.repeat(depth)}\n`),
  );
const arbBlock = fc.oneof(
  { weight: 5, arbitrary: arbParagraph },
  { weight: 2, arbitrary: arbList },
  { weight: 2, arbitrary: arbQuote },
  { weight: 1, arbitrary: arbCode },
  { weight: 1, arbitrary: fc.constant('---') },
);
/** Sections of up to three headings in a row, then up to four other blocks: headings often fall near a page's foot. */
const arbSection = fc
  .tuple(fc.array(arbHeading, { maxLength: 3 }), fc.array(arbBlock, { maxLength: 4 }))
  .map(([headings, rest]) => [...headings, ...rest]);
const arbDocument = fc
  .array(arbSection, { maxLength: 16 })
  .map((sections) => sections.flat().join('\n\n'));
const arbPaper = fc.constantFrom<Paper>('letter', 'a4');

const RUNS = { numRuns: 80 };
const RAW_RUNS = { numRuns: 400 };
/**
 * Pagination's input straight, on a page of 100: headings and blocks of lines from 5 to 45 pt, so
 * chains taller than a page, and blocks that can't keep their rules, come up often (and any two
 * lines fit an empty page, as in a real document).
 */
const arbPageBlocks: fc.Arbitrary<Placement> = fc
  .array(
    fc.record({
      heights: fc.array(fc.integer({ min: 5, max: 45 }), { minLength: 1, maxLength: 9 }),
      spaceBefore: fc.integer({ min: 0, max: 12 }),
      keepWithNext: fc.boolean(),
    }),
    { maxLength: 14 },
  )
  .map((specs) => {
    const blocks = specs.map((spec) => ({
      lines: spec.heights.map((height): DocLine => ({ fragments: [], height, ascent: 0 })),
      spaceBefore: spec.spaceBefore,
      keepWithNext: spec.keepWithNext,
    }));
    return {
      blocks,
      lines: blocks.map((block) => block.lines),
      pages: paginate(blocks, 100),
      pageHeight: 100,
    };
  });
const EPS = 1e-6;

const area = (paper: Paper) => {
  const { width, height } = PAPER_POINTS[paper];
  const m = STYLE.margin;
  return { width, height, left: m, right: width - m, bottom: m, top: height - m };
};

/** What pagination was given and what it gave back. */
interface Placement {
  blocks: readonly { spaceBefore: number; keepWithNext: boolean }[];
  lines: readonly (readonly DocLine[])[];
  pages: PageSlice[][];
  pageHeight: number;
}

/** The page's blocks, lines, and slices, as `layoutDocument` computes them. */
function placement(source: string, paper: Paper): Placement {
  const { width, height } = PAPER_POINTS[paper];
  const textWidth = width - 2 * STYLE.margin;
  const blocks = documentBlocks(md(source), textWidth);
  const lines = blocks.map((block) => wrapBlock(block, textWidth, fixedMeasure, new Set()));
  const pageHeight = height - 2 * STYLE.margin;
  const pages = paginate(
    blocks.map((block, i) => ({
      lines: lines[i] ?? [],
      spaceBefore: block.spaceBefore,
      keepWithNext: block.keepWithNext,
    })),
    pageHeight,
  );
  return { blocks, lines, pages, pageHeight };
}

/**
 * The chain of headings that block `b` is in (design §4: a heading, with any headings directly
 * under it), the block after it, and whether the chain with what must follow it (the next block's
 * first 2 lines, or all of it when it has 3 or fewer) is taller than a page. Undefined when `b`
 * isn't a heading.
 */
function chainOf(p: Placement, b: number) {
  const { blocks, lines, pageHeight } = p;
  if (!blocks[b]?.keepWithNext) return undefined;
  const height = (i: number, count = Number.POSITIVE_INFINITY) =>
    (lines[i] ?? []).slice(0, count).reduce((sum, line) => sum + line.height, 0);
  let start = b;
  while (start > 0 && blocks[start - 1]?.keepWithNext) start--;
  let total = 0;
  let e = start;
  for (; e < blocks.length && blocks[e]?.keepWithNext; e++)
    total += (e > start ? (blocks[e]?.spaceBefore ?? 0) : 0) + height(e);
  if (e < blocks.length) {
    const n = lines[e]?.length ?? 0;
    total += (blocks[e]?.spaceBefore ?? 0) + height(e, n < 2 * MIN_LINES ? n : MIN_LINES);
  }
  return { follower: e < blocks.length ? e : undefined, tooTall: total > pageHeight + EPS };
}

/** Page numbers are the only text in the bottom margin. */
const isPageNumber = (layout: DocLayout, item: DocItem) =>
  layout.pages.length > 1 && item.kind === 'text' && item.y === STYLE.pageNumber.baselineFromBottom;
const isMarker = (text: string) => /^(•|◦|▪|\d+\.)$/.test(text);

function numbers(item: DocItem): number[] {
  return Object.values(item).filter((value): value is number => typeof value === 'number');
}

describe('layoutDocument, over random documents', () => {
  it('every line of every block is placed exactly once, in order', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const { lines, pages } = placement(source, paper);
        // A cursor through the document's lines: each slice must start exactly where it stands.
        let block = 0;
        let line = 0;
        for (const slice of pages.flat()) {
          if (line === (lines[block]?.length ?? 0)) {
            block++;
            line = 0;
          }
          expect([slice.block, slice.from]).toEqual([block, line]);
          expect(slice.to).toBeGreaterThan(slice.from);
          expect(slice.to).toBeLessThanOrEqual(lines[block]?.length ?? 0);
          line = slice.to;
        }
        if (lines.length > 0)
          expect([block, line]).toEqual([lines.length - 1, lines.at(-1)?.length]);
        else expect(pages).toEqual([[]]);

        // And layoutDocument draws every fragment of every line, in that order.
        const layout = layoutDocument(md(source), { paper, measure: fixedMeasure });
        const drawn = layout.pages.flatMap((page) =>
          page.items.flatMap((item) =>
            item.kind === 'text' && !isPageNumber(layout, item) ? [item.text] : [],
          ),
        );
        const fragments = pages.flatMap((page) =>
          page.flatMap((s) =>
            (lines[s.block] ?? [])
              .slice(s.from, s.to)
              .flatMap((l) => l.fragments.map((f) => f.text)),
          ),
        );
        expect(drawn).toEqual(fragments);
        expect(layout.pages.length).toBe(pages.length);
      }),
      RUNS,
    );
  });

  it('no page ends with a heading unless the document does', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const p = placement(source, paper);
        for (const page of p.pages.slice(0, -1)) {
          const last = page.at(-1);
          if (!last || !p.blocks[last.block]?.keepWithNext) continue;
          // Design §4: a heading never ends a page unless it is the document's last block, or its
          // rule can't be kept, which is when it is part of a chain taller than a page.
          expect(chainOf(p, last.block)?.tooTall).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('no page is empty, and none starts with space', () => {
    const check = (p: Placement) => {
      if (p.lines.every((l) => l.length === 0)) {
        expect(p.pages).toEqual([[]]);
        return;
      }
      for (const page of p.pages) {
        expect(page.length).toBeGreaterThan(0);
        // Call 14: a block's space before is dropped at the top of a page.
        expect(page[0]?.top).toBe(0);
      }
    };
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => check(placement(source, paper))),
      RUNS,
    );
    fc.assert(
      fc.property(arbPageBlocks, (p) => check(p)),
      RAW_RUNS,
    );
  });

  it('a split leaves at least two lines on each page unless its rule can’t be kept', () => {
    const check = (p: Placement) => {
      const slices = p.pages.flat();
      for (let i = 0; i + 1 < slices.length; i++) {
        const before = slices[i] as PageSlice;
        const after = slices[i + 1] as PageSlice;
        if (before.block !== after.block) continue;
        const b = before.block;
        const blockLines = p.lines[b] ?? [];
        // Design §4 and Call 17: the rules give way only when they can't be kept, and then only
        // (a) for a heading in a chain taller than a page,
        if (p.blocks[b]?.keepWithNext && chainOf(p, b)?.tooTall) continue;
        // (b) for the block after such a chain, on the page it shares with the chain's last heading,
        const chain = chainOf(p, b - 1);
        if (chain?.follower === b && chain.tooTall && before.from === 0) continue;
        // (c) and for a block with too few lines left to split that is taller than a page.
        const rest = blockLines.slice(before.from);
        const restHeight = rest.reduce((sum, line) => sum + line.height, 0);
        if (rest.length < 2 * MIN_LINES && restHeight > p.pageHeight + EPS) continue;
        expect(before.to - before.from, JSON.stringify(slices)).toBeGreaterThanOrEqual(MIN_LINES);
        expect(blockLines.length - after.from).toBeGreaterThanOrEqual(MIN_LINES);
      }
    };
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => check(placement(source, paper))),
      RUNS,
    );
    fc.assert(
      fc.property(arbPageBlocks, (p) => check(p)),
      RAW_RUNS,
    );
  });

  it('no item lies outside the text area, except the page number in the bottom margin', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const a = area(paper);
        const layout = layoutDocument(md(source), { paper, measure: fixedMeasure });
        for (const page of layout.pages) {
          for (const item of page.items) {
            if (item.kind === 'text' && isPageNumber(layout, item)) {
              expect(item.y).toBeLessThan(a.bottom);
              continue;
            }
            const box =
              item.kind === 'text'
                ? {
                    x1: item.x,
                    x2: item.x + fixedMeasure.width(item.text, item.face, item.size),
                    y1: item.y - 0.2 * item.size,
                    y2: item.y + 0.8 * item.size,
                  }
                : item.kind === 'line'
                  ? {
                      x1: Math.min(item.x1, item.x2),
                      x2: Math.max(item.x1, item.x2),
                      y1: Math.min(item.y1, item.y2),
                      y2: Math.max(item.y1, item.y2),
                    }
                  : { x1: item.x, x2: item.x + item.width, y1: item.y, y2: item.y + item.height };
            expect(box.y1).toBeGreaterThanOrEqual(a.bottom - EPS);
            expect(box.y2).toBeLessThanOrEqual(a.top + EPS);
            expect(box.x2).toBeLessThanOrEqual(a.right + EPS);
            if (box.x1 < a.left - EPS) {
              // A list's marker hangs left of its text, and may pass the margin, never the paper.
              expect(item.kind === 'text' && isMarker(item.text)).toBe(true);
              expect(box.x1).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }),
      RUNS,
    );
  });

  it('no two text items on a page overlap', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const layout = layoutDocument(md(source), { paper, measure: fixedMeasure });
        for (const page of layout.pages) {
          const boxes = page.items.flatMap((item) =>
            item.kind === 'text' && item.text.trim() !== ''
              ? [
                  {
                    x1: item.x,
                    x2: item.x + fixedMeasure.width(item.text, item.face, item.size),
                    y1: item.y - 0.2 * item.size,
                    y2: item.y + 0.8 * item.size,
                  },
                ]
              : [],
          );
          boxes.sort((p, q) => p.y1 - q.y1);
          for (let i = 0; i < boxes.length; i++) {
            const p = boxes[i] as (typeof boxes)[number];
            for (let j = i + 1; j < boxes.length; j++) {
              const q = boxes[j] as (typeof boxes)[number];
              if (q.y1 >= p.y2 - EPS) break;
              const overlap = Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1);
              expect(overlap).toBeLessThanOrEqual(EPS);
            }
          }
        }
      }),
      RUNS,
    );
  });

  it('page numbers run 1, 2, 3… and only with two or more pages', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const { width } = PAPER_POINTS[paper];
        const layout = layoutDocument(md(source), { paper, measure: fixedMeasure });
        const atFoot = layout.pages.map((page) =>
          page.items.filter(
            (item): item is Extract<DocItem, { kind: 'text' }> =>
              item.kind === 'text' && item.y < STYLE.margin,
          ),
        );
        if (layout.pages.length === 1) {
          expect(atFoot[0]).toEqual([]);
          return;
        }
        atFoot.forEach((found, i) => {
          expect(found).toHaveLength(1);
          const number = found[0] as Extract<DocItem, { kind: 'text' }>;
          expect(number.text).toBe(String(i + 1));
          expect(number).toMatchObject({
            y: 36,
            face: 'text',
            size: STYLE.pageNumber.size,
            color: 'muted',
          });
          const w = fixedMeasure.width(number.text, 'text', STYLE.pageNumber.size);
          expect(number.x + w / 2).toBeCloseTo(width / 2, 6);
        });
      }),
      RUNS,
    );
  });

  it('no number is NaN or infinite', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, (source, paper) => {
        const layout = layoutDocument(md(source), { paper, measure: fixedMeasure });
        expect(layout.pages.length).toBeGreaterThanOrEqual(1);
        for (const page of layout.pages)
          for (const item of page.items)
            for (const value of numbers(item)) expect(Number.isFinite(value)).toBe(true);
      }),
      RUNS,
    );
  });
});
