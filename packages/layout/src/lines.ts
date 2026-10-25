import type { Block, InlineRun, Span } from '@drafter/fountain';
import type { Role, RoleStyle } from '@drafter/templates';
import type { LayoutLine, LayoutRun } from './types';
import { wrap } from './wrap';

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
 * A block's printed lines (technical design §5.2). Each source line wraps on
 * its own; lines holding only notes or boneyard print nothing. The role's
 * prefix and suffix, and any `append`, become synthetic runs, and
 * `lineSpacing: 2` puts a blank line between lines.
 */
export function blockLines(block: Block, options: BlockLinesOptions): LayoutLine[] {
  const { blockIndex, role, style, frame, append } = options;
  const source = block.lines.filter((line) => !line.transparent);
  const out: LayoutLine[] = [];
  source.forEach((line, k) => {
    const runs = line.inline.map((run) => styled(run, style));
    if (k === 0 && style.prefix) {
      runs.unshift(addedRun(style.prefix, style, runs[0]?.span.from ?? line.span.from));
    }
    if (k === source.length - 1) {
      const end = runs.findLast((run) => !run.synthetic)?.span.to ?? line.span.to;
      if (style.suffix) runs.push(addedRun(style.suffix, style, end));
      if (append) runs.push(addedRun(append, style, end));
    }
    for (const piece of wrap(joined(runs), runs, frame.width)) {
      const span = spanOf(piece, line.span);
      if (out.length > 0 && style.lineSpacing === 2) out.push(blankLine(span.from));
      out.push({ col: colFor(frame, columns(joined(piece))), runs: piece, role, blockIndex, span });
    }
  });
  return out;
}
