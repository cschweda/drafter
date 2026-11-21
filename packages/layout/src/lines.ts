import type { Block, InlineRun, Span } from '@drafter/fountain';
import type { Role, RoleStyle } from '@drafter/templates';
import type { LayoutLine, LayoutRun } from './types';
import { type Cells, cellsOf, sliceCells, wrapCells } from './wrap';

/** Where a block prints and how wide: from its role style, or from a dual-dialogue column. */
export interface Frame {
  indent: number;
  width: number;
  align: 'left' | 'center' | 'right';
}

export const frameOf = (style: RoleStyle): Frame => ({
  indent: style.indent,
  width: style.width,
  align: style.align ?? 'left',
});

/** The columns a string takes: one per code point. */
export function columns(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; n++) i += (s.codePointAt(i) as number) > 0xffff ? 2 : 1;
  return n;
}

export const joined = (runs: readonly InlineRun[]) => runs.map((run) => run.text).join('');

export const isBlank = (line: LayoutLine) =>
  joined(line.runs).trim() === '' && (!line.right || joined(line.right.runs).trim() === '');

export function colFor(frame: Frame, length: number): number {
  if (frame.align === 'center') return frame.indent + Math.floor((frame.width - length) / 2);
  if (frame.align === 'right') return frame.indent + frame.width - length;
  return frame.indent;
}

/** A blank line; `at` is the source offset it stands at. */
export const blankLine = (at: number): LayoutLine => ({
  col: 0,
  runs: [],
  role: 'blank',
  blockIndex: -1,
  span: { from: at, to: at },
  synthetic: 'blank',
});

/** Text the engine adds, in the role's type style, standing at `at` in the source. */
export function addedRun(text: string, style: RoleStyle, at: number): LayoutRun {
  return {
    text,
    bold: style.style?.bold === true,
    italic: style.style?.italic === true,
    underline: style.style?.underline === true,
    span: { from: at, to: at },
    synthetic: true,
  };
}

/** From the first source run to the last; `fallback` for a line with no source text. */
export function spanOf(runs: readonly LayoutRun[], fallback: Span): Span {
  const source = runs.filter((run) => !run.synthetic);
  const first = source[0];
  const last = source[source.length - 1];
  return first && last ? { from: first.span.from, to: last.span.to } : { ...fallback };
}

/** A source run in a role: tabs become four spaces, the role's case and type style apply. */
function styled(run: InlineRun, style: RoleStyle): LayoutRun {
  const text = run.text.replaceAll('\t', '    ');
  return {
    text: style.case === 'upper' ? text.toUpperCase() : text,
    bold: run.bold || style.style?.bold === true,
    italic: run.italic || style.style?.italic === true,
    underline: run.underline || style.style?.underline === true,
    span: run.span,
  };
}

export interface BlockLinesOptions {
  blockIndex: number;
  role: Role;
  style: RoleStyle;
  frame: Frame;
  /** Text added at the end of the block, such as ` (CONT'D)`. */
  append?: string;
}

/**
 * One line of a block as the writer typed it, ready to print: its styled runs, and what every
 * printed line of it shares. Kept so that a page break can cut it at a sentence and wrap the rest
 * again (technical design §5.3).
 */
export interface Para {
  runs: LayoutRun[];
  frame: Frame;
  role: Role;
  blockIndex: number;
  /** The source line's span: the span of a printed line with no source text. */
  fallback: Span;
  /** `lineSpacing: 2`: a blank line stands between its printed lines. */
  double: boolean;
  /** In the lines it was first wrapped into, the index past its last. */
  end: number;
  /** Its text, and its text as cells with their offsets: made when a break first looks inside it. */
  text?: string;
  cells?: Required<Cells>;
}

/** Where a printed line came from: its paragraph, and which of the paragraph's cells it holds. */
export interface Origin {
  para: Para;
  start: number;
  end: number;
}

const cellsFor = (para: Para): Required<Cells> => {
  para.cells ??= cellsOf(para.runs, true) as Required<Cells>;
  return para.cells;
};

/** A paragraph's text: its runs, joined. */
export function textOf(para: Para): string {
  para.text ??= joined(para.runs);
  return para.text;
}

/** Where a cell starts in its paragraph's text. */
export const offsetOf = (para: Para, cell: number): number => cellsFor(para).at[cell] as number;

/** The cell of a paragraph that starts at `offset` in its text, or the first one after it. */
export function cellAt(para: Para, offset: number): number {
  const { at } = cellsFor(para);
  let lo = 0;
  let hi = at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((at[mid] as number) < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The first cell at or after `cell` that isn't a space: where the next line would start. */
export function pastSpaces(para: Para, cell: number): number {
  const { space } = cellsFor(para);
  let c = cell;
  while (space[c]) c++;
  return c;
}

/** Cells `start` to `end` of a paragraph as one printed line. */
export function paraLine(
  para: Para,
  start: number,
  end: number,
): { line: LayoutLine; origin: Origin } {
  const runs = sliceCells(para.runs, cellsFor(para), start, end);
  return {
    line: {
      col: colFor(para.frame, end - start),
      runs,
      role: para.role,
      blockIndex: para.blockIndex,
      span: spanOf(runs, para.fallback),
    },
    origin: { para, start, end },
  };
}

/**
 * Up to `limit` printed lines of a paragraph, wrapped from cell `start`: each line's cells, and
 * `next`, the cell the line after them starts at (null when the paragraph ends within them).
 */
export const paraWrap = (para: Para, start: number, limit: number) =>
  wrapCells(cellsFor(para), para.frame.width, start, limit);

/** How many cells a paragraph has. */
export const cellCount = (para: Para): number => cellsFor(para).run.length;

/**
 * The cell a paragraph is cut at for a page that starts at `offset` in the source: the first cell
 * that came from there or later, moved to the start of its word (back, when it is inside one; on,
 * past the spaces before one). The cell count when the paragraph ends before `offset`.
 */
export function cellAtSource(para: Para, offset: number): number {
  const cells = cellsFor(para);
  const n = cells.run.length;
  const source = (c: number) => {
    const run = para.runs[cells.run[c] as number] as LayoutRun;
    const scale = (run.span.to - run.span.from) / run.text.length;
    return run.span.from + Math.round((cells.from[c] as number) * scale);
  };
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (source(mid) < offset) lo = mid + 1;
    else hi = mid;
  }
  let c = lo;
  while (c > 0 && c < n && !cells.space[c] && !cells.space[c - 1]) c--;
  while (c < n && cells.space[c]) c++;
  return c;
}

/**
 * Cells `start` to `end` of a paragraph as a paragraph of its own, without the spaces it would end
 * with: a piece of one that a locked page's start cuts. Null when nothing is left of it.
 */
export function subPara(para: Para, start: number, end: number): Para | null {
  const cells = cellsFor(para);
  let to = end;
  while (to > start && cells.space[to - 1]) to--;
  if (to <= start) return null;
  const { frame, role, blockIndex, fallback, double } = para;
  const runs = sliceCells(para.runs, cells, start, to);
  return { runs, frame, role, blockIndex, fallback, double, end: 0 };
}

/**
 * Wraps a paragraph onto `lines`, with a blank line before each of its lines but the very first
 * when it is double-spaced, and where each came from onto `origins`, if given.
 */
export function pushPara(para: Para, lines: LayoutLine[], origins?: Array<Origin | null>): void {
  const { runs, frame, role, blockIndex } = para;
  // The cells are this call's only: a script's worth of them is not kept for a cut that is rare.
  const cells = cellsOf(runs);
  for (const [start, end] of wrapCells(cells, frame.width).ranges) {
    const piece = sliceCells(runs, cells, start, end);
    const span = spanOf(piece, para.fallback);
    if (lines.length > 0 && para.double) {
      lines.push(blankLine(span.from));
      origins?.push(null);
    }
    lines.push({ col: colFor(frame, end - start), runs: piece, role, blockIndex, span });
    origins?.push({ para, start, end });
  }
  para.end = lines.length;
}

/**
 * A block's printed lines (technical design §5.2). Each source line wraps on its own; lines
 * holding only notes or boneyard print nothing. The role's prefix and suffix, and any `append`,
 * become synthetic runs, and `lineSpacing: 2` puts a blank line between lines.
 *
 * With `origins`, where each line came from is added to it, one entry a line (null for a blank
 * line between double-spaced lines): what a break inside a printed line needs.
 */
export function blockLines(
  block: Block,
  options: BlockLinesOptions,
  origins?: Array<Origin | null>,
): LayoutLine[] {
  const { blockIndex, role, style, frame, append } = options;
  const source = block.lines.filter((line) => !line.transparent);
  const lines: LayoutLine[] = [];
  // A forced cue prints as typed: `@McCLANE` is how Fountain keeps a name's small letters. What
  // the layout adds to it, such as (CONT'D), still takes the role's case.
  const typed: RoleStyle =
    block.kind === 'character' && block.forced && style.case === 'upper'
      ? { ...style, case: 'as-is' }
      : style;
  const double = style.lineSpacing === 2;
  source.forEach((line, k) => {
    const runs = line.inline.map((run) => styled(run, typed));
    if (k === 0 && style.prefix) {
      runs.unshift(addedRun(style.prefix, style, runs[0]?.span.from ?? line.span.from));
    }
    if (k === source.length - 1) {
      const end = runs.findLast((run) => !run.synthetic)?.span.to ?? line.span.to;
      if (style.suffix) runs.push(addedRun(style.suffix, style, end));
      if (append) runs.push(addedRun(append, style, end));
    }
    pushPara(
      { runs, frame, role, blockIndex, fallback: line.span, double, end: 0 },
      lines,
      origins,
    );
  });
  return lines;
}
