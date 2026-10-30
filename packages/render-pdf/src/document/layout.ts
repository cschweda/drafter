import { PAPER_POINTS, type Paper } from '@drafter/templates';
import { type DocBlock, documentBlocks, type Run } from './blocks';
import type { Face } from './fonts';
import { type DocLine, wrapBlock } from './lines';
import type { Measure } from './measure';
import { footnotes } from './notes';
import { type PageSlice, paginateWithNotes } from './paginate';
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
      /** A footnote's reference: the note it refers to. */
      note?: number;
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
  /** The top of the page's footnotes (their rule's space), which the text above never passes; null with none. */
  footTop: number | null;
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

/** A block whose sizes are `scale` of `block`'s: a footnote's, at the notes' size. */
function scaled(block: DocBlock, scale: number): DocBlock {
  const run = (r: Run): Run => ({
    ...r,
    size: r.size * scale,
    ...(r.rise === undefined ? {} : { rise: r.rise * scale }),
  });
  return {
    ...block,
    runs: block.runs.map(run),
    marker: block.marker && run(block.marker),
    size: block.size * scale,
    leading: block.leading * scale,
    spaceBefore: block.spaceBefore * scale,
  };
}

/**
 * Draws `slices` of `blocks` (broken into `lines`) into `items`, the first slice's top `origin`
 * points from the page's bottom, less its own `top`. Each slice's part of a code panel is one
 * rectangle, and each quote's bar one line, from the top of the quote's first line on the page (or
 * of its space, when the block before it is in the same quote) to the bottom of its last.
 */
function drawSlices(
  items: DocItem[],
  slices: readonly PageSlice[],
  blocks: readonly DocBlock[],
  lines: readonly (readonly DocLine[])[],
  origin: number,
  geometry: { margin: number; right: number; textWidth: number },
): void {
  const { margin, right, textWidth } = geometry;
  /** The bars open, outermost first. */
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
    const sliceTop = origin - slice.top;
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
          y: baseline + (fragment.rise ?? 0),
          text: fragment.text,
          face: fragment.face,
          size: fragment.size,
          color: fragment.color,
          ...(fragment.note === undefined ? {} : { note: fragment.note }),
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
}

/**
 * A document laid out on pages of `paper`: its blocks (`documentBlocks`, at the paper's text width),
 * wrapped into lines (`wrapBlock`), and broken into pages (`paginateWithNotes`). A link's fragment
 * gives a link rectangle its line's height and an underline. Pages are numbered at the foot (Call
 * 18) when there are two or more.
 *
 * Footnotes (DECISIONS, Footnotes): a reference is its number, raised; its note prints at the foot
 * of the page the reference's line prints on, under a short rule, at `STYLE.notes.size`, as a
 * numbered list item ("1.") of the note's blocks. The first line to refer to a note carries it, with
 * the notes first referenced inside it (numbered right after it, `footnotes`), so each note prints
 * once, in number order down the pages.
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

  const notes = footnotes(tree);
  const blocks = documentBlocks(tree, textWidth, notes.numbers);
  // Each note as a numbered list of one item, so its number hangs as a list's does, at the notes' size.
  const scale = STYLE.notes.size / STYLE.textSize;
  const noteBlocks = notes.notes.map((note, k) =>
    documentBlocks(
      {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: true,
            start: k + 1,
            spread: false,
            children: [{ type: 'listItem', children: note.children ?? [] }],
          },
        ],
      },
      textWidth,
      notes.numbers,
    ).map((block) => scaled(block, scale)),
  );
  const allNoteBlocks = noteBlocks.flat();
  /** Where each note's blocks start in `allNoteBlocks`. */
  const noteStarts: number[] = [];
  noteBlocks.reduce((start, note) => {
    noteStarts.push(start);
    return start + note.length;
  }, 0);

  const missing = new Set<string>();
  const total = blocks.length + allNoteBlocks.length;
  let done = 0;
  opts.onProgress?.(0, total);
  const wrap = (block: DocBlock) => {
    const wrapped = wrapBlock(block, textWidth, opts.measure, missing);
    opts.onProgress?.(++done, total);
    return wrapped;
  };
  const lines = blocks.map(wrap);
  const noteLines = allNoteBlocks.map(wrap);

  // The notes each line carries: from the first one it refers to that no line before it has, to the
  // last note inside the last such note.
  let through = 0;
  const carried = lines.map((blockLines) =>
    blockLines.map((line) => {
      const mine: number[] = [];
      for (const fragment of line.fragments) {
        if (fragment.note === undefined || fragment.note <= through) continue;
        const to = Math.max(fragment.note, notes.last[fragment.note - 1] ?? fragment.note);
        for (let k = through; k < to; k++) mine.push(k);
        through = to;
      }
      return mine.length > 0 ? mine : undefined;
    }),
  );
  // Every numbered note is referred to by a line; should one not be, it goes with the last line.
  const lastLines = carried.findLast((block) => block.length > 0);
  if (through < notes.notes.length && lastLines) {
    const rest = Array.from({ length: notes.notes.length - through }, (_, i) => through + i);
    lastLines[lastLines.length - 1] = [...(lastLines.at(-1) ?? []), ...rest];
  }

  const placed = paginateWithNotes(
    blocks.map((block, i) => ({
      lines: lines[i] as DocLine[],
      spaceBefore: block.spaceBefore,
      keepWithNext: block.keepWithNext,
      notes: carried[i],
    })),
    height - 2 * margin,
    noteBlocks.map((note, k) =>
      note.map((block, b) => ({
        lines: noteLines[(noteStarts[k] as number) + b] as DocLine[],
        spaceBefore: block.spaceBefore,
      })),
    ),
  );

  const geometry = { margin, right, textWidth };
  const pages = placed.pages.map((slices, p): DocPage => {
    const items: DocItem[] = [];
    drawSlices(items, slices, blocks, lines, textTop, geometry);
    const foot = placed.feet[p];
    if (!foot || foot.height === 0) return { items, footTop: null };
    const footTop = margin + foot.height;
    const y = footTop - STYLE.notes.ruleSpace / 2;
    items.push({
      kind: 'line',
      x1: margin,
      y1: y,
      x2: margin + STYLE.notes.ruleWidth,
      y2: y,
      thickness: STYLE.ruleThickness,
      color: 'rule',
    });
    drawSlices(
      items,
      foot.slices.map((slice) => ({
        block: (noteStarts[slice.note] as number) + slice.block,
        from: slice.from,
        to: slice.to,
        top: slice.top,
      })),
      allNoteBlocks,
      noteLines,
      footTop - STYLE.notes.ruleSpace,
      geometry,
    );
    return { items, footTop };
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
