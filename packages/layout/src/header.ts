import type { InlineRun } from '@drafter/fountain';
import type { Template } from '@drafter/templates';
import { wrap } from './wrap';

/** Splits `s` into code points, so a surrogate pair is never cut. */
const points = (s: string) => [...s];

/** `text` in at most `max` code points: as it is when it fits, else cut to end in `…`. */
const cut = (text: string, max: number) =>
  points(text).length <= max
    ? text
    : `${points(text)
        .slice(0, max - 1)
        .join('')}…`;

/**
 * A locked script's revision header as it prints under the page number (production design §8): one
 * line when it fits in `width` columns (the printable width), else two, word-wrapped; when the words
 * would need a third, broken at the edge instead, and what still doesn't fit ends in `…`. With
 * room for only one line (`rows`: a custom template whose body starts two lines under the page
 * number, ruling F5), one, cut to end in `…`. Each line is right-aligned by the caller. `renderPdf`
 * and the HTML file's pages both use it, so both print the same lines.
 */
export function headerLines(text: string, width: number, rows = 2): string[] {
  const max = Math.max(1, Math.floor(width));
  const header = text.trim();
  if (points(header).length <= max) return [header];
  if (rows < 2) return [cut(header, max)];
  const wrapped = wrap<InlineRun>(header, [], max).map((runs) =>
    runs
      .map((run) => run.text)
      .join('')
      .trim(),
  );
  if (wrapped.length <= 2) return wrapped;
  const all = points(header);
  const first = all.slice(0, max).join('').trimEnd();
  const rest = all.slice(max).join('').trimStart();
  return [first, cut(rest, max)];
}

/**
 * How many lines the revision header has under the page number before the body starts: two, or one
 * in a custom template whose body starts two lines (or fewer) under the page number
 * (`margin.top - numbering.line < 3`), so a second line never lands on the body (ruling F5).
 */
export function headerRows(page: Pick<Template['page'], 'margin' | 'numbering'>): number {
  return page.margin.top - page.numbering.line < 3 ? 1 : 2;
}
