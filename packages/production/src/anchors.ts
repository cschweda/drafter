import { changesOf, splitLines } from '@drafter/compare';
import type { LockedPage } from './types';

/** A locked page's start in the current text. */
export interface Anchor {
  label: string;
  /** Offset of the anchor line's start in the current text. */
  at: number;
  /** Printed-line offset into that line: what a page with no `char` starts by. */
  printed: number;
  /** How far into that line the page's first character is; absent for a page locked without one. */
  char?: number;
}

interface Mapped {
  line: number;
  printed: number;
  char?: number;
}

/**
 * Where character `char` of a line is after the line was edited: where it was when the change is
 * all after it, moved by the change's length when the change is all before it, and at the
 * change's start when its own words were rewritten.
 */
function charIn(before: string, after: string, char: number): number {
  const most = Math.min(before.length, after.length);
  let same = 0;
  while (same < most && before[same] === after[same]) same++;
  if (char <= same) return char;
  let tail = 0;
  while (tail < most - same && before[before.length - 1 - tail] === after[after.length - 1 - tail])
    tail++;
  return char >= before.length - tail ? char + after.length - before.length : same;
}

/** `m` with the page's character, when it has one. */
const withChar = (m: Mapped, char: number | undefined): Mapped =>
  char === undefined ? m : { ...m, char };

/** Maps baseline line indexes to current line indexes through the diff. */
function lineMapper(oldText: string, newText: string): (page: LockedPage) => Mapped {
  const changes = changesOf(oldText, newText);
  const oldLines = splitLines(oldText).lines;
  const newLines = splitLines(newText).lines;
  const newCount = newLines.length;
  return (page) => {
    let delta = 0;
    for (const c of changes) {
      if (page.line >= c.old[1]) {
        delta += c.new[1] - c.new[0] - (c.old[1] - c.old[0]);
        continue;
      }
      if (page.line < c.old[0]) break;
      // Inside this change.
      if (c.new[1] > c.new[0]) {
        const line = Math.min(c.new[0] + (page.line - c.old[0]), c.new[1] - 1);
        const char =
          page.char === undefined
            ? undefined
            : charIn(oldLines[page.line] ?? '', newLines[line] ?? '', page.char);
        return withChar({ line, printed: page.printed }, char);
      }
      const gone = { line: Math.min(c.new[0], newCount), printed: 0 };
      return withChar(gone, page.char === undefined ? undefined : 0);
    }
    return withChar({ line: page.line + delta, printed: page.printed }, page.char);
  };
}

/** How far into its line a page starts: by its character, or by its count of printed lines. */
const into = (m: { printed: number; char?: number }) => m.char ?? m.printed;

interface Placed extends Mapped {
  label: string;
  at: number;
  /** The line a rebase stores: for page 1 where its own anchor line maps, not the pin at 0. */
  stored: Mapped;
  /** False when the page collides with an earlier one (same line, no further into it) or has no text left. */
  kept: boolean;
}

function place(pages: readonly LockedPage[], oldText: string, newText: string): Placed[] {
  const map = lineMapper(oldText, newText);
  const { starts } = splitLines(newText);
  const out: Placed[] = [];
  let last = -1;
  let lastInto = 0;
  // Where page 1's own first line landed. A page that starts there or earlier means page 1's text is all cut.
  let own: { at: number; into: number } | undefined;
  for (const [k, page] of pages.entries()) {
    // The first locked page starts at the top of the script, whatever was added before it, so new
    // opening material flows into page 1 and overflows as 1A, 1B: no page ever prints as 1 twice.
    const m =
      k === 0
        ? withChar({ line: 0, printed: 0 }, page.char === undefined ? undefined : 0)
        : map(page);
    const at = starts[m.line] ?? newText.length;
    const o = k === 0 ? map(page) : m;
    if (k === 0) own = { at: starts[o.line] ?? newText.length, into: into(o) };
    // Nothing of page 1's own text is left before this page: it folds into page 1 (1-2).
    const emptied =
      k > 0 && own !== undefined && (at < own.at || (at === own.at && into(m) <= own.into));
    // A long paragraph or speech can hold several page starts, further into it each time.
    const after = at > last || (at === last && into(m) > lastInto);
    const kept = after && !emptied && at < newText.length;
    if (kept) {
      last = at;
      lastInto = into(m);
    }
    out.push({ ...m, label: page.label, at, stored: o, kept });
  }
  return out;
}

/**
 * Where each locked page starts in `current`. The first page is pinned to the text's start (material
 * added before it becomes its A-pages). A page that collides with an earlier one, or whose start
 * is at the end of the text (no text left), is dropped and its label reported so the caller can fold it.
 * `printed` is carried as locked and not clamped: paginate clamps it to the anchor block's printed-line count.
 * `char` follows an edit of its own line (`charIn`); paginate moves it to the start of the word it falls in.
 */
export function resolveAnchors(
  pages: readonly LockedPage[],
  baseline: string,
  current: string,
): { anchors: Anchor[]; dropped: string[] } {
  const placed = place(pages, baseline, current);
  return {
    anchors: placed
      .filter((p) => p.kept)
      .map((p): Anchor => {
        const anchor: Anchor = { label: p.label, at: p.at, printed: p.printed };
        if (p.char !== undefined) anchor.char = p.char;
        return anchor;
      }),
    dropped: placed.filter((p) => !p.kept).map((p) => p.label),
  };
}

/**
 * The pages with lines indexing `newBaseline`, for starting the next revision set. A collapsed page is
 * kept on the line of the page it folded into (printed 0), so the fold survives and a later resolve reports it.
 */
export function rebaseAnchors(
  pages: readonly LockedPage[],
  oldBaseline: string,
  newBaseline: string,
): LockedPage[] {
  const out: LockedPage[] = [];
  let folded: Placed | undefined;
  for (const p of place(pages, oldBaseline, newBaseline)) {
    if (p.kept) {
      folded = p;
      out.push({ label: p.label, ...p.stored });
    } else {
      const line = folded ? folded.stored.line : p.line;
      out.push({
        label: p.label,
        ...withChar({ line, printed: 0 }, p.char === undefined ? undefined : 0),
      });
    }
  }
  return out;
}
