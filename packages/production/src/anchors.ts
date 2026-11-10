import { changesOf, splitLines } from '@drafter/compare';
import type { LockedPage } from './types';

/** A locked page's start in the current text. */
export interface Anchor {
  label: string;
  /** Offset of the anchor line's start in the current text. */
  at: number;
  /** Printed-line offset into that line. */
  printed: number;
}

interface Mapped {
  line: number;
  printed: number;
}

/** Maps baseline line indexes to current line indexes through the diff. */
function lineMapper(oldText: string, newText: string): (page: LockedPage) => Mapped {
  const changes = changesOf(oldText, newText);
  const newCount = splitLines(newText).lines.length;
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
        return { line, printed: page.printed };
      }
      return { line: Math.min(c.new[0], newCount), printed: 0 };
    }
    return { line: page.line + delta, printed: page.printed };
  };
}

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
  let lastPrinted = 0;
  // Where page 1's own first line landed. A page that starts there or earlier means page 1's text is all cut.
  let own: { at: number; printed: number } | undefined;
  for (const [k, page] of pages.entries()) {
    // The first locked page starts at the top of the script, whatever was added before it, so new
    // opening material flows into page 1 and overflows as 1A, 1B: no page ever prints as 1 twice.
    const m = k === 0 ? { line: 0, printed: 0 } : map(page);
    const at = starts[m.line] ?? newText.length;
    const o = k === 0 ? map(page) : m;
    if (k === 0) own = { at: starts[o.line] ?? newText.length, printed: o.printed };
    // Nothing of page 1's own text is left before this page: it folds into page 1 (1-2).
    const emptied =
      k > 0 && own !== undefined && (at < own.at || (at === own.at && m.printed <= own.printed));
    // A long paragraph or speech can hold several page starts, further into it each time.
    const after = at > last || (at === last && m.printed > lastPrinted);
    const kept = after && !emptied && at < newText.length;
    if (kept) {
      last = at;
      lastPrinted = m.printed;
    }
    out.push({ label: page.label, line: m.line, printed: m.printed, at, stored: o, kept });
  }
  return out;
}

/**
 * Where each locked page starts in `current`. The first page is pinned to the text's start (material
 * added before it becomes its A-pages). A page that collides with an earlier one, or whose start
 * is at the end of the text (no text left), is dropped and its label reported so the caller can fold it.
 * `printed` is carried as locked and not clamped: paginate clamps it to the anchor block's printed-line count.
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
      .map((p) => ({ label: p.label, at: p.at, printed: p.printed })),
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
  let into: Placed | undefined;
  for (const p of place(pages, oldBaseline, newBaseline)) {
    if (p.kept) {
      into = p;
      out.push({ label: p.label, line: p.stored.line, printed: p.stored.printed });
    } else {
      out.push({ label: p.label, line: into ? into.stored.line : p.line, printed: 0 });
    }
  }
  return out;
}
