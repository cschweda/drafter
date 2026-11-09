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

/** Where each locked page starts in `current`; collisions keep the first and report the later labels as dropped. */
export function resolveAnchors(
  pages: readonly LockedPage[],
  baseline: string,
  current: string,
): { anchors: Anchor[]; dropped: string[] } {
  const map = lineMapper(baseline, current);
  const { starts } = splitLines(current);
  const anchors: Anchor[] = [];
  const dropped: string[] = [];
  let last = -1;
  for (const page of pages) {
    const m = map(page);
    const at = starts[m.line] ?? current.length;
    if (at <= last) {
      dropped.push(page.label);
      continue;
    }
    last = at;
    anchors.push({ label: page.label, at, printed: m.printed });
  }
  return { anchors, dropped };
}

/** The pages with lines indexing `newBaseline`, for starting the next revision set; collapsed pages are omitted. */
export function rebaseAnchors(
  pages: readonly LockedPage[],
  oldBaseline: string,
  newBaseline: string,
): LockedPage[] {
  const map = lineMapper(oldBaseline, newBaseline);
  const { starts } = splitLines(newBaseline);
  const out: LockedPage[] = [];
  let last = -1;
  for (const page of pages) {
    const m = map(page);
    const at = starts[m.line] ?? newBaseline.length;
    if (at <= last) continue;
    last = at;
    out.push({ label: page.label, line: m.line, printed: m.printed });
  }
  return out;
}
