import type { DocLine } from './lines';
import { STYLE } from './style';

/** The fewest lines a split block leaves on either page (Call 15). */
export const MIN_LINES = 2;

/** What pagination reads of a block. */
export interface PageBlock {
  lines: readonly DocLine[];
  spaceBefore: number;
  keepWithNext: boolean;
  /** The footnotes each line carries to its page's foot (indexes into the notes), when any. */
  notes?: readonly (readonly number[] | undefined)[];
}

/** What pagination reads of a block of a footnote. */
export interface NoteBlock {
  lines: readonly DocLine[];
  spaceBefore: number;
}

/** Lines `from` to `to` of block `block` of note `note`, the first line's top `top` pt below the top of the foot's notes. */
export interface FootSlice {
  note: number;
  block: number;
  from: number;
  to: number;
  top: number;
}

/** A page's foot: its notes, and its height from the bottom margin to the top of its rule's space; 0 when it has none. */
export interface Foot {
  slices: FootSlice[];
  height: number;
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
  return paginateWithNotes(blocks, pageHeight, []).pages;
}

/**
 * `paginate`, with footnotes at the foot of each page (DECISIONS, Footnotes). A line's notes go on
 * the page where the line prints, with every line of every note it carries: when they don't fit
 * under the lines already there, the line goes to the next page, and the usual rules take it from
 * there, each line now as tall as it is with its notes. Only a line that is first on its page and
 * still can't fit all its notes is placed anyway: as many of the notes' lines as fit go under it,
 * and the rest continue at the foot of the next page, before that page's own notes, and nothing
 * more goes on the page. A page's foot is `STYLE.notes.ruleSpace` (the rule's) and its notes, the
 * last note's bottom on the bottom margin, and the text above never reaches into it. A page may hold
 * only the rest of a note too long for a whole page. With no notes, every page is `paginate`'s.
 */
export function paginateWithNotes(
  blocks: readonly PageBlock[],
  pageHeight: number,
  notes: readonly (readonly NoteBlock[])[],
): { pages: PageSlice[][]; feet: Foot[] } {
  const { ruleSpace, between } = STYLE.notes;
  /** Each note's lines in order, with the space before each (a block's first line but the note's first has its block's). */
  const noteLines = notes.map((note) =>
    note.flatMap((block, b) =>
      block.lines.map((line, i) => ({
        block: b,
        line: i,
        gap: i === 0 && b > 0 ? block.spaceBefore : 0,
        height: line.height,
      })),
    ),
  );
  /** Each note's height, its first line's space left out. */
  const noteHeights = noteLines.map((lines) =>
    lines.reduce((sum, line, i) => sum + (i > 0 ? line.gap : 0) + line.height, 0),
  );
  /** The foot's height with whole `added` notes under a foot of `foot`. */
  const footWith = (foot: number, added: readonly number[] | undefined) => {
    for (const k of added ?? [])
      foot = (foot === 0 ? ruleSpace : foot + between) + (noteHeights[k] ?? 0);
    return foot;
  };

  let page: PageSlice[] = [];
  const pages: PageSlice[][] = [page];
  let footSlices: FootSlice[] = [];
  const feet: Foot[] = [{ slices: footSlices, height: 0 }];
  /** Points used on the page by the text, and by the foot. */
  let used = 0;
  let foot = 0;
  /** A note is cut at this page's foot: nothing more goes on the page. */
  let full = false;
  /** Notes waiting for room at a foot, in order: the first may be partly printed already. */
  const waiting: { note: number; line: number }[] = [];

  /** Puts a note's line in the foot, if the page has room for it (a page's first always fits). */
  const footLine = (note: number, index: number): boolean => {
    const line = noteLines[note]?.[index];
    if (!line) return true;
    const top = foot === 0 ? ruleSpace : foot + (index === 0 ? between : line.gap);
    if (used + top + line.height > pageHeight + EPS && (used > 0 || foot > 0)) return false;
    const last = footSlices.at(-1);
    if (last && last.note === note && last.block === line.block && last.to === line.line) last.to++;
    else
      footSlices.push({
        note,
        block: line.block,
        from: line.line,
        to: line.line + 1,
        top: top - ruleSpace,
      });
    foot = top + line.height;
    (feet.at(-1) as Foot).height = foot;
    return true;
  };
  /** Prints the notes waiting, as far as they fit. */
  const flush = () => {
    while (waiting.length > 0) {
      const next = waiting[0] as { note: number; line: number };
      if (!footLine(next.note, next.line)) {
        full = true;
        return;
      }
      next.line++;
      if (next.line >= (noteLines[next.note]?.length ?? 0)) waiting.shift();
    }
  };
  const newPage = () => {
    page = [];
    pages.push(page);
    footSlices = [];
    feet.push({ slices: footSlices, height: 0 });
    used = 0;
    foot = 0;
    full = false;
    flush();
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
      // The chain of headings from b, and what must follow it, measured once for the whole chain,
      // with the notes its lines carry.
      const carried: number[] = [];
      const carry = (block: PageBlock, to: number) => {
        for (let i = 0; i < to; i++) carried.push(...(block.notes?.[i] ?? []));
      };
      let chain = height(lines, 0, n);
      carry(current, n);
      let e = b + 1;
      for (; e < blocks.length; e++) {
        const next = blocks[e] as PageBlock;
        if (next.lines.length === 0) continue;
        if (!next.keepWithNext) break;
        chain += next.spaceBefore + height(next.lines, 0, next.lines.length);
        carry(next, next.lines.length);
      }
      const follower = blocks[e];
      if (follower) {
        const m = follower.lines.length;
        const k = m < 2 * MIN_LINES ? m : MIN_LINES;
        chain += follower.spaceBefore + height(follower.lines, 0, k);
        carry(follower, k);
      }
      checkedThrough = e - 1;
      if (chain + footWith(0, carried) > pageHeight + EPS) fillThrough = e;
      else if (
        (page.length > 0 || foot > 0) &&
        used + (page.length > 0 ? current.spaceBefore : 0) + chain + footWith(foot, carried) >
          pageHeight + EPS
      )
        newPage();
    }

    let from = 0;
    while (from < n) {
      const empty = page.length === 0;
      const space = empty ? 0 : current.spaceBefore;
      const room = pageHeight - used - space;
      const left = n - from;
      // How many of the remaining lines fit, each with the notes it carries: one more is looked at, at most.
      let fit = 0;
      let fitHeight = 0;
      let fitFoot = foot;
      while (fit < left && !full) {
        const h = (lines[from + fit] as DocLine).height;
        const withNotes = footWith(fitFoot, current.notes?.[from + fit]);
        if (fitHeight + h + withNotes > room + EPS) break;
        fitHeight += h;
        fitFoot = withNotes;
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
      // A line first on its page whose notes don't all fit: placed, unless the page's foot holds
      // the rest of an earlier note (it goes on the next page, whose foot that note leaves free).
      const forced = take > fit;
      if (forced) {
        const h = (lines[from] as DocLine).height;
        const first = current.notes?.[from]?.[0];
        const firstLine = first === undefined ? undefined : noteLines[first]?.[0];
        const needs =
          h + (firstLine ? foot + (foot === 0 ? ruleSpace : between) + firstLine.height : foot);
        if (full || (foot > 0 && needs > pageHeight + EPS)) take = 0;
      }

      if (take > 0) {
        page.push({ block: b, from, to: from + take, top: used + space });
        used += space + height(lines, from, from + take);
        for (let i = from; i < from + take; i++) {
          for (const k of current.notes?.[i] ?? []) waiting.push({ note: k, line: 0 });
        }
        flush();
        from += take;
      }
      if (from < n) newPage();
    }
  }
  // The rest of a note too long for its page's foot.
  while (waiting.length > 0) newPage();
  return { pages, feet };
}
