import type { InlineRun } from '@drafter/fountain';
import type { Layout, LayoutLine, Page } from '@drafter/layout';

export const text = (line: LayoutLine | undefined) =>
  (line?.runs ?? []).map((run) => run.text).join('');

/** The text that came from the source: without runs the engine added, such as `(CONT'D)`. */
export const sourceText = (line: LayoutLine) =>
  line.runs
    .filter((run) => !run.synthetic)
    .map((run) => run.text)
    .join('');

export const style = (run: InlineRun) =>
  `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.underline ? 'u' : ''}`;

/** A row's parts: the line itself and, for a row with two columns, its right part. */
export const parts = (line: LayoutLine): LayoutLine[] => (line.right ? [line, line.right] : [line]);

/** A row that prints nothing. */
export const isBlank = (line: LayoutLine) => parts(line).every((part) => text(part).trim() === '');

export const pageNumbered = (layout: Layout, number: number): Page | undefined =>
  layout.pages.find((page) => page.number === number);

/** The part of a block's first printed row that belongs to the block. */
export function firstPart(layout: Layout, blockIndex: number): LayoutLine | undefined {
  const at = layout.index[blockIndex];
  if (!at) return undefined;
  const row = pageNumbered(layout, at.page)?.lines[at.line];
  return row ? parts(row).find((part) => part.blockIndex === blockIndex) : undefined;
}

/** 1-based line number of a source offset. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/** `n` numbered lines of filler action. */
export const filler = (n: number, label = 'F') =>
  Array.from(
    { length: n },
    (_, i) => `${label} line ${String(i + 1).padStart(2, '0')}: the room is quiet.`,
  ).join('\n');
