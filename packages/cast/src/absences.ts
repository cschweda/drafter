import type { Scene, StripBlock } from '@drafter/outline';
import type { Presence } from './presence';

// Long absences (seeing-the-script design §3.5, Call 11): the gaps between two scenes a character
// is in, on the Structure strip's page axis, from the end of one to the start of the next.

/** A gap this many pages long or longer is a long absence. */
export const LONG_ABSENCE_PAGES = 20;

/**
 * A gap between two of a character's scenes. `pages` is the fractional gap on the strip's axis,
 * and it alone decides whether the gap is long; a view prints `to.page − from.page`, the whole
 * pages, so a gap of 19.9 pages prints as 19 and one of 20.0 as 20.
 */
export interface Absence {
  /** The scene they leave, and the page the gap starts on. */
  from: { scene: number; page: number };
  /** The scene they come back in, and the page it starts on. */
  to: { scene: number; page: number };
  /** The gap on the page axis, in pages (fractional). */
  pages: number;
}

/**
 * The long gaps between the scenes in `scenes` (a character's, in order), and the longest gap of
 * any length; nothing before the first or after the last. `spans` are the strip's scene blocks
 * on its page axis, one per scene.
 */
export function absencesOf(
  scenes: readonly Presence[],
  spans: readonly StripBlock[],
  all: readonly Scene[],
): { long: Absence[]; longest: Absence | null } {
  const long: Absence[] = [];
  let longest: Absence | null = null;
  for (let i = 1; i < scenes.length; i++) {
    const a = (scenes[i - 1] as Presence).scene;
    const b = (scenes[i] as Presence).scene;
    const end = spans[a]?.to;
    const start = spans[b]?.from;
    if (end === undefined || start === undefined) continue;
    const pages = start - end;
    if (!(pages > 0)) continue;
    const absence: Absence = {
      from: { scene: a, page: Math.floor(end) + 1 },
      to: { scene: b, page: all[b]?.pages?.page ?? Math.floor(start) + 1 },
      pages,
    };
    if (pages >= LONG_ABSENCE_PAGES) long.push(absence);
    if (!longest || pages > longest.pages) longest = absence;
  }
  return { long, longest };
}
