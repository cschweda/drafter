/** One revision set. The last in `Production.sets` is the open one; closed sets carry `lines` and `gaps`. */
export interface ProductionSet {
  name: string;
  /** The swatch for the screen, as `#rrggbb`. */
  color: string;
  /** ISO date the set started. */
  date: string;
  /** The id of the frozen draft that is this set's baseline. */
  draft: string;
  /** Fingerprints of the lines this set marked (closed sets only). */
  lines?: string[];
  /** Fingerprints of the lines that carry a removal's mark (closed sets only). */
  gaps?: string[];
}

/**
 * Where a locked page starts. In the file this is the tuple `[label, line, printed]`, as v0.27.1
 * and earlier read it, with `char` beside the tuples, in the block's `chars`.
 */
export interface LockedPage {
  label: string;
  /** 0-based source line in the baseline text. */
  line: number;
  /**
   * Printed-line offset into that source line, for a page that starts partway into a paragraph or
   * speech: how many of its printed lines, wrapped the plain way, come before the page. What a
   * page locked by v0.27.1 or earlier starts by, and what those versions read from a later lock.
   */
  printed: number;
  /**
   * How far into that source line the page's first character is. A page can start inside a printed
   * line, where a sentence does, which a count of printed lines can't say. Absent on a page
   * locked by v0.27.1 or earlier.
   */
  char?: number;
}

export interface Production {
  /** ISO date of the lock. */
  lockedAt: string;
  firstScene: number;
  /** Every scene number the lock has issued, in script order. */
  numbers: string[];
  pages: LockedPage[];
  /** The last is the open set. */
  sets: ProductionSet[];
  /** Gzip, then base64, of the open set's baseline text. */
  baseline: string;
  /**
   * The production's own revision header, in place of "Blue Revision — 12 November 2026" on the
   * revised pages and the full PDF (design §8); absent, the default. Trimmed, 1 to `MAX_HEADER`
   * characters, with no control characters.
   */
  header?: string;
}
