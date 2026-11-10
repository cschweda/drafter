import type { Layout, Page } from '@drafter/layout';

/**
 * Which pages a revised-pages PDF prints (design §8): the pages with the current revision's marks,
 * the pages with any revision's, or the pages from one label to another.
 */
export type RevisedChoice =
  | { kind: 'current' }
  | { kind: 'all' }
  | { kind: 'range'; from: string; to: string };

/** Whether a page has a line carrying a mark, in either column. */
const marked = (page: Page) => page.lines.some((line) => line.mark || line.right?.mark);

/** A typed label, as labels are compared: no spaces round it, capitals (`12a` is `12A`). */
const typed = (label: string) => label.trim().toUpperCase();

/** Whether `typedLabel` names the page labelled `label`: itself, or either end of a range (`13-14`). */
function matches(label: string, typedLabel: string): boolean {
  const want = typed(typedLabel);
  if (want === '') return false;
  return label === want || label.split('-').includes(want);
}

/**
 * The pages from `from` to `to` among `labels` (body pages' labels, in page order), as indexes into
 * `labels`: from the first page either label names to the last, inclusive, so the ends may come
 * either way round; none when either label isn't a page's. A range label (`13-14`) is named by
 * either end; `12a` is `12A`.
 */
export function labelRange(labels: readonly string[], from: string, to: string): number[] {
  const named = (typedLabel: string) =>
    labels.flatMap((label, i) => (matches(label, typedLabel) ? [i] : []));
  const froms = named(from);
  const tos = named(to);
  if (froms.length === 0 || tos.length === 0) return [];
  const first = Math.min(froms[0] as number, tos[0] as number);
  const last = Math.max(froms.at(-1) as number, tos.at(-1) as number);
  return labels.flatMap((_, i) => (i >= first && i <= last ? [i] : []));
}

/**
 * The body pages a revised-pages PDF keeps, as indexes into `layout.pages`, in page order; never
 * the title page. `current` and `all` keep the pages with any mark in `chooseBy` (the caller lays it
 * out with the current set's marks, or every set's); `range` keeps the pages `labelRange` names.
 */
export function revisedIndexes(chooseBy: Layout, which: RevisedChoice): number[] {
  const body = chooseBy.pages.flatMap((page, i) => (page.number === 0 ? [] : [i]));
  if (which.kind !== 'range') return body.filter((i) => marked(chooseBy.pages[i] as Page));
  const labels = body.map((i) => (chooseBy.pages[i] as Page).label);
  return labelRange(labels, which.from, which.to).map((k) => body[k] as number);
}

/**
 * A layout of only the chosen pages (`revisedIndexes`), as they print in the full PDF: their
 * labels, marks, and numbers kept. Pages are chosen by `chooseBy`'s marks, laid out on the same
 * pages as `layout` with other marks (the current set's pages, printed with every set's
 * asterisks); by default `layout` itself. The result's block index is empty: its pages no longer
 * run in order from the first block.
 */
export function revisedPages(
  layout: Layout,
  which: RevisedChoice,
  chooseBy: Layout = layout,
): Layout {
  const pages = revisedIndexes(chooseBy, which)
    .map((i) => layout.pages[i])
    .filter((page): page is Page => page !== undefined);
  return { pages, index: [], diagnostics: layout.diagnostics };
}

/**
 * What an export with no pages to print says, before any file is made: the open set's name for the
 * current revision ("There are no Blue changes to print."), otherwise revised pages.
 */
export function noRevisedPages(which: RevisedChoice, openSet: string): string {
  return which.kind === 'current'
    ? `There are no ${openSet} changes to print.`
    : 'There are no revised pages to print.';
}
