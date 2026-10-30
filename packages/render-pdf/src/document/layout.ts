import { PAPER_POINTS, type Paper } from '@drafter/templates';
import { type DocBlock, documentBlocks, type Run } from './blocks';
import type { Face } from './fonts';
import { type DocLine, wrapBlock } from './lines';
import type { Measure } from './measure';
import { paginate } from './paginate';
import { STYLE } from './style';
import type { DocNode } from './tree';

/** What a page draws, in PDF points from the page's bottom-left corner. A text item's `y` is its baseline. */
export type DocItem =
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      face: Face;
      size: number;
      color: Run['color'];
    }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness: number;
      color: 'rule' | 'link';
    }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; color: 'panel' }
  | { kind: 'link'; x: number; y: number; width: number; height: number; uri: string };

export interface DocPage {
  items: DocItem[];
}

export interface DocLayout {
  width: number;
  height: number;
  /** At least one. */
  pages: DocPage[];
  /** Characters the fonts lack, printed as `?`, in the order they were first seen. */
  missing: string[];
}

/** A quote's bar being drawn down a page. */
interface Bar {
  quote: number;
  x: number;
  top: number;
  bottom: number;
}

/**
 * A document laid out on pages of `paper`: its blocks (`documentBlocks`, at the paper's text width),
 * wrapped into lines (`wrapBlock`), and broken into pages (`paginate`). Each page's part of a code
 * panel is one rectangle, and each quote's bar one line, from the top of the quote's first line on
 * the page (or of its space, when the block before it on the page is in the same quote) to the
 * bottom of its last. A link's fragment gives a link rectangle its line's height and an underline.
 * Pages are numbered at the foot (Call 18) when there are two or more.
 */
export function layoutDocument(
  tree: DocNode,
  opts: {
    paper: Paper;
    measure: Measure;
    /** Called with the blocks broken into lines so far, of all of them: 0 first, the total last. */
    onProgress?: (done: number, total: number) => void;
  },
): DocLayout {
  const { width, height } = PAPER_POINTS[opts.paper];
  const margin = STYLE.margin;
  const textWidth = width - 2 * margin;
  const textTop = height - margin;
  const right = width - margin;

  const blocks = documentBlocks(tree, textWidth);
  const missing = new Set<string>();
  opts.onProgress?.(0, blocks.length);
  const lines = blocks.map((block, i) => {
    const wrapped = wrapBlock(block, textWidth, opts.measure, missing);
    opts.onProgress?.(i + 1, blocks.length);
    return wrapped;
  });
  const placed = paginate(
    blocks.map((block, i) => ({
      lines: lines[i] as DocLine[],
      spaceBefore: block.spaceBefore,
      keepWithNext: block.keepWithNext,
    })),
    height - 2 * margin,
  );

  const pages = placed.map((slices): DocPage => {
    const items: DocItem[] = [];
    /** The bars open on this page, outermost first. */
    let bars: Bar[] = [];
    const close = (from: number) => {
      for (const bar of bars.slice(from)) {
        items.push({
          kind: 'line',
          x1: margin + bar.x,
          y1: bar.top,
          x2: margin + bar.x,
          y2: bar.bottom,
          thickness: STYLE.quoteBar,
          color: 'rule',
        });
      }
      bars = bars.slice(0, from);
    };

    for (const slice of slices) {
      const block = blocks[slice.block] as DocBlock;
      const blockLines = lines[slice.block] as DocLine[];
      const sliceTop = textTop - slice.top;
      let top = sliceTop;
      for (let i = slice.from; i < slice.to; i++) {
        const line = blockLines[i] as DocLine;
        const baseline = top - line.ascent;
        if (block.kind === 'rule') {
          const y = top - line.height / 2;
          items.push({
            kind: 'line',
            x1: margin + block.indent,
            y1: y,
            x2: right,
            y2: y,
            thickness: STYLE.ruleThickness,
            color: 'rule',
          });
        }
        for (const fragment of line.fragments) {
          const x = margin + fragment.x;
          items.push({
            kind: 'text',
            x,
            y: baseline,
            text: fragment.text,
            face: fragment.face,
            size: fragment.size,
            color: fragment.color,
          });
          if (fragment.underline) {
            const y = baseline - STYLE.underline.drop;
            items.push({
              kind: 'line',
              x1: x,
              y1: y,
              x2: x + fragment.width,
              y2: y,
              thickness: STYLE.underline.thickness,
              color: 'link',
            });
          }
          if (fragment.link !== null) {
            items.push({
              kind: 'link',
              x,
              y: top - line.height,
              width: fragment.width,
              height: line.height,
              uri: fragment.link,
            });
          }
        }
        top -= line.height;
      }
      const sliceBottom = top;

      if (block.panel) {
        items.push({
          kind: 'rect',
          x: margin + block.indent,
          y: sliceBottom,
          width: textWidth - block.indent,
          height: sliceTop - sliceBottom,
          color: 'panel',
        });
      }

      // A bar runs on through the space between blocks of its quote; a new quote starts a new bar.
      let depth = 0;
      while (depth < bars.length && bars[depth]?.quote === block.quotes[depth]) {
        (bars[depth] as Bar).bottom = sliceBottom;
        depth++;
      }
      close(depth);
      for (let d = depth; d < block.quotes.length; d++) {
        bars.push({
          quote: block.quotes[d] as number,
          x: block.quoteBars[d] as number,
          top: sliceTop,
          bottom: sliceBottom,
        });
      }
    }
    close(0);
    return { items };
  });

  if (pages.length > 1) {
    const { size, baselineFromBottom } = STYLE.pageNumber;
    pages.forEach((page, i) => {
      const text = String(i + 1);
      page.items.push({
        kind: 'text',
        x: (width - opts.measure.width(text, 'text', size)) / 2,
        y: baselineFromBottom,
        text,
        face: 'text',
        size,
        color: 'muted',
      });
    });
  }

  return { width, height, pages, missing: [...missing] };
}
