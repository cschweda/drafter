// Names that look like spellings of each other (§3, tool 10: Dale and Dell), and the limits of the
// tools that work across files. Edits are counted by code point, never by UTF-16 unit, so an
// accented letter, a character in Japanese, or an emoji is one letter. Names are compared as the
// cast keys them (upper case), so two names that differ only in case are the same name, never
// neighbours.

/** The limits of a search (§3, tool 8). */
export const SEARCH_LIMITS = {
  /** Hits a page. */
  perPage: 50,
  /** Hits in all, over every page. */
  total: 500,
  /** Files searched in all. */
  files: 200,
  /** Bytes of files searched in all. */
  bytes: 100 * 1024 * 1024,
  /** The most UTF-16 units of text around a hit (so at most as many characters). */
  around: 200,
} as const;

/** The most scripts a series overview reads. */
export const SERIES_MAX = 30;

/**
 * Names this many letters long or shorter may differ by one edit; longer names by two. The spec
 * says five, but its own example (Dale and Dell, two edits in four letters) needs three: see the
 * task report.
 */
export const SHORT_NAME = 3;

/** The bytes of not-yet-parsed files one page of a search parses, at most (one file always). */
export const PAGE_PARSE_BYTES = 20 * 1024 * 1024;
/** The bytes of scripts one series overview reads, at most. */
export const SERIES_READ_BYTES = 20 * 1024 * 1024;

/** What a call may read and parse; tests make them smaller, so they needn't make 100 MB of files. */
const limits = {
  searchBytes: SEARCH_LIMITS.bytes as number,
  pageParseBytes: PAGE_PARSE_BYTES,
  seriesBytes: SERIES_READ_BYTES,
};

/** The bytes a search may read, a page of it parse, and a series read. */
export function readLimits(): Readonly<typeof limits> {
  return limits;
}

/** For tests only: smaller limits; undefined puts them all back. */
export function __setLimitsForTests(given: Partial<typeof limits> | undefined): void {
  limits.searchBytes = given?.searchBytes ?? SEARCH_LIMITS.bytes;
  limits.pageParseBytes = given?.pageParseBytes ?? PAGE_PARSE_BYTES;
  limits.seriesBytes = given?.seriesBytes ?? SERIES_READ_BYTES;
}

/** Whether code-point arrays `x` and `y` are within `max` edits: a band of the table, O(len × max). */
function within(x: readonly string[], y: readonly string[], max: number): boolean {
  if (Math.abs(x.length - y.length) > max) return false;
  const far = max + 1;
  // row[j] is the distance from x's first i letters to y's first j, capped at `far`.
  let row = Array.from({ length: y.length + 1 }, (_, j) => (j <= max ? j : far));
  for (let i = 1; i <= x.length; i++) {
    const next = new Array<number>(y.length + 1).fill(far);
    const from = Math.max(1, i - max);
    const to = Math.min(y.length, i + max);
    next[0] = i <= max ? i : far;
    let best = next[0] as number;
    for (let j = from; j <= to; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const value = Math.min(
        (row[j] as number) + 1,
        (next[j - 1] as number) + 1,
        (row[j - 1] as number) + cost,
        far,
      );
      next[j] = value;
      if (value < best) best = value;
    }
    // Every way through this row is already too far.
    if (best > max) return false;
    row = next;
  }
  return (row[y.length] as number) <= max;
}

/** Whether a and b (upper-cased cast keys) are within `max` edits, counted by code point; bounded, O(len × max). */
export function withinEdits(a: string, b: string, max: number): boolean {
  return within(Array.from(a), Array.from(b), max);
}

/**
 * Pairs of names that look like spellings of each other: one edit for names of up to SHORT_NAME
 * letters, two above (by the shorter name's code points); never a name with itself. Each pair in
 * the order the names were given, and the pairs in that order too.
 */
export function neighbours(names: readonly string[]): Array<[string, string]> {
  const unique = [...new Set(names)];
  const letters = unique.map((name) => Array.from(name));
  // By length, so each name is compared only with names at most two letters longer.
  const order = unique
    .map((_, i) => i)
    .sort((a, b) => {
      const d = (letters[a] as string[]).length - (letters[b] as string[]).length;
      return d !== 0 ? d : a - b;
    });
  const found: Array<[number, number]> = [];
  for (let p = 0; p < order.length; p++) {
    const i = order[p] as number;
    const x = letters[i] as string[];
    const max = x.length <= SHORT_NAME ? 1 : 2;
    for (let q = p + 1; q < order.length; q++) {
      const j = order[q] as number;
      const y = letters[j] as string[];
      if (y.length - x.length > max) break;
      if (x.length === 0) continue;
      if (within(x, y, max)) found.push(i < j ? [i, j] : [j, i]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return found.map(([i, j]) => [unique[i] as string, unique[j] as string]);
}
