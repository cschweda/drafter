import type { DocLine } from './lines';

/** The fewest lines a split block leaves on either page (Call 15). */
export const MIN_LINES = 2;

/** What pagination reads of a block. */
export interface PageBlock {
  lines: readonly DocLine[];
  spaceBefore: number;
  keepWithNext: boolean;
}

/** Lines `from` to `to` (exclusive) of block `block`, the first line's top `top` pt below the text area's top. */
export interface PageSlice {
  block: number;
  from: number;
  to: number;
  top: number;
}

/** Rounding room, so a block that fits exactly fits. */
const EPS = 1e-6;

/**
 * Which page each line of each block goes on (pure; the rules of design §4): no space at the top
 * of a page (Call 14); a split block leaves at least `MIN_LINES` on each page, so one of fewer than
 * twice that never splits (Call 15); a heading, with any headings directly under it, moves to the
 * next page unless what must follow it fits under it: the next block's first `MIN_LINES` lines, or
 * all of it when it is too short to split (Call 16). When a rule can't be kept (a heading and what
 * must follow it taller than a page, a block too short to split taller than a page), the lines fill
 * the page as they come (Call 17): a chain's headings, and the block after them on the page it shares
 * with the last heading only; on later pages that block splits by the usual rule. Every page but an empty document's holds at least one line, so
 * the walk always ends; it visits each line a bounded number of times, so it is linear.
 */
export function paginate(blocks: readonly PageBlock[], pageHeight: number): PageSlice[][] {
  let page: PageSlice[] = [];
  const pages: PageSlice[][] = [page];
  /** Points used on the page. */
  let used = 0;
  const newPage = () => {
    page = [];
    pages.push(page);
    used = 0;
  };
  const height = (lines: readonly DocLine[], from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += (lines[i] as DocLine).height;
    return sum;
  };

  /** Headings up to this block have had their chain checked. */
  let checkedThrough = -1;
  /** Blocks before this one fill the page as they come, and this one on its first page: their chain couldn't be kept. */
  let fillThrough = -1;

  for (let b = 0; b < blocks.length; b++) {
    const current = blocks[b] as PageBlock;
    const { lines } = current;
    const n = lines.length;
    if (n === 0) continue;

    if (current.keepWithNext && b > checkedThrough) {
      // The chain of headings from b, and what must follow it, measured once for the whole chain.
      let chain = height(lines, 0, n);
      let e = b + 1;
      for (; e < blocks.length; e++) {
        const next = blocks[e] as PageBlock;
        if (next.lines.length === 0) continue;
        if (!next.keepWithNext) break;
        chain += next.spaceBefore + height(next.lines, 0, next.lines.length);
      }
      const follower = blocks[e];
      if (follower) {
        const m = follower.lines.length;
        chain +=
          follower.spaceBefore + height(follower.lines, 0, m < 2 * MIN_LINES ? m : MIN_LINES);
      }
      checkedThrough = e - 1;
      if (chain > pageHeight + EPS) fillThrough = e;
      else if (page.length > 0 && used + current.spaceBefore + chain > pageHeight + EPS) newPage();
    }

    let from = 0;
    while (from < n) {
      const empty = page.length === 0;
      const space = empty ? 0 : current.spaceBefore;
      const room = pageHeight - used - space;
      const left = n - from;
      // How many of the remaining lines fit: one more is looked at, at most.
      let fit = 0;
      let fitHeight = 0;
      while (fit < left) {
        const h = (lines[from + fit] as DocLine).height;
        if (fitHeight + h > room + EPS) break;
        fitHeight += h;
        fit++;
      }
      // A chain that can't be kept fills as it comes, and so does the first slice of what follows
      // it, on the page it shares with the chain's last heading; after that page, the usual rules.
      const fill =
        b < fillThrough ||
        (b === fillThrough && from === 0 && !empty) ||
        (left < 2 * MIN_LINES && height(lines, from, n) > pageHeight + EPS);
      let take: number;
      if (fit === left) take = left;
      else if (fill) take = fit > 0 ? fit : empty ? 1 : 0;
      else if (left < 2 * MIN_LINES || fit < MIN_LINES) take = empty ? Math.max(fit, 1) : 0;
      else take = Math.min(fit, left - MIN_LINES);

      if (take > 0) {
        page.push({ block: b, from, to: from + take, top: used + space });
        used += space + height(lines, from, from + take);
        from += take;
      }
      if (from < n) newPage();
    }
  }
  return pages;
}
