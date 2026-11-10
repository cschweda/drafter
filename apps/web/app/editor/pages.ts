import type { Block, Doc } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';

export interface PagePosition {
  /** A page's number: 0 is the title page. */
  current: number;
  /** The last page's number. */
  last: number;
  /** What the current page prints as its number (a locked script's `12A`); absent, the number. */
  label?: string;
  /** What the last page prints as its number. */
  lastLabel?: string;
}

/**
 * The page that holds a block, and the last page. `layout.index[i].page` is a page *number*, not an
 * index into `layout.pages` (the title page is 0), so pages are found by `number`, never by
 * position. Null before the first layout. The title page (block -1), an unknown block (null), and
 * a layout with no index put the cursor on the first page; a block past the end of a layout that
 * lags the text puts it on the last block's page.
 */
export function pageOf(layout: Layout | null, blockIndex: number | null): PagePosition | null {
  const first = layout?.pages[0];
  const last = layout?.pages.at(-1);
  if (!layout || !first || !last) return null;
  const at = (current: number): PagePosition => {
    const out: PagePosition = { current, last: last.number };
    // A page's label is what it prints (production design §7.2): "12A" on a locked script.
    const label = layout.pages.find((page) => page.number === current)?.label;
    if (label !== undefined) out.label = label;
    if (last.label !== undefined) out.lastLabel = last.label;
    return out;
  };
  if (blockIndex === null || blockIndex < 0) return at(first.number);
  const entry = layout.index[blockIndex] ?? layout.index.at(-1);
  return at(entry?.page ?? first.number);
}

/** "Page 2 of 5", or a locked script's "Page 12A of 118", or "Title page". */
export function pageLabel(page: PagePosition | null): string {
  if (!page) return '';
  if (page.current === 0) return 'Title page';
  return `Page ${page.label ?? page.current} of ${page.lastLabel ?? page.last}`;
}

/**
 * The block the cursor is in, or on a blank line the last block before it: -1 for the title page
 * and anything before the first block. The page bar reads it, so that a blank line, which is no
 * element, still has a page.
 */
export function blockIndexAt(doc: Doc, offset: number): number {
  if (doc.titlePage && offset <= doc.titlePage.span.to) return -1;
  let lo = 0;
  let hi = doc.blocks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((doc.blocks[mid] as Block).span.from <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
