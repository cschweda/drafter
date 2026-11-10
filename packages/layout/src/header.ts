import type { InlineRun } from '@drafter/fountain';
import { wrap } from './wrap';

/** Splits `s` into code points, so a surrogate pair is never cut. */
const points = (s: string) => [...s];

/**
 * A locked script's revision header as it prints under the page number (production design §8): one
 * line when it fits in `width` columns (the printable width), else two, word-wrapped; when the words
 * would need a third, broken at the edge instead, and what still doesn't fit ends in `…`. Each
 * line is right-aligned by the caller. `renderPdf` and the HTML file's pages both use it, so both
 * print the same lines.
 */
export function headerLines(text: string, width: number): string[] {
  const max = Math.max(1, Math.floor(width));
  const header = text.trim();
  if (points(header).length <= max) return [header];
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
  const second =
    points(rest).length <= max
      ? rest
      : `${points(rest)
          .slice(0, max - 1)
          .join('')}…`;
  return [first, second];
}
