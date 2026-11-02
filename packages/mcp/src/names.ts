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

/** Names longer than this (in code points) are never compared: no one is called that. */
export const NAME_COMPARE_MAX = 40;

/** Two rows of the edit table, reused by every comparison (one thread, one at a time). */
let rowA: number[] = [];
let rowB: number[] = [];

/**
 * Whether code-point arrays `x` and `y` are within `max` edits. Only the band of the table within
 * `max` of its diagonal is ever touched (the cells just outside it read as too far), in two
 * reused rows: O(len × max) time, nothing allocated past the rows' first growth.
 */
function within(x: readonly string[], y: readonly string[], max: number): boolean {
  if (Math.abs(x.length - y.length) > max) return false;
  const far = max + 1;
  if (rowA.length < y.length + 2) {
    rowA = new Array<number>(y.length + 2).fill(far);
    rowB = new Array<number>(y.length + 2).fill(far);
  }
  // prev[j]: the distance from x's first i - 1 letters to y's first j, capped at `far`.
  let prev = rowA;
  let cur = rowB;
  const top = Math.min(y.length, max);
  for (let j = 0; j <= top; j++) prev[j] = j;
  prev[top + 1] = far;
  for (let i = 1; i <= x.length; i++) {
    const from = Math.max(1, i - max);
    const to = Math.min(y.length, i + max);
    // The cell just left of the band.
    cur[from - 1] = from - 1 === 0 && i <= max ? i : far;
    let best = cur[from - 1] as number;
    const letter = x[i - 1];
    for (let j = from; j <= to; j++) {
      const cost = letter === y[j - 1] ? 0 : 1;
      let value = (prev[j - 1] as number) + cost;
      const up = (prev[j] as number) + 1;
      if (up < value) value = up;
      const left = (cur[j - 1] as number) + 1;
      if (left < value) value = left;
      if (value > far) value = far;
      cur[j] = value;
      if (value < best) best = value;
    }
    // The cell just right of the band, which the next row reads.
    cur[to + 1] = far;
    // Every way through this row is already too far.
    if (best > max) return false;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return (prev[y.length] as number) <= max;
}

/** A name as compared: NFC, so an accent typed as one character or as two is the same letter. */
const normal = (name: string) => name.normalize('NFC');

/** Whether a and b (upper-cased cast keys) are within `max` edits, counted by code point after NFC; bounded, O(len × max). */
export function withinEdits(a: string, b: string, max: number): boolean {
  return within(Array.from(normal(a)), Array.from(normal(b)), max);
}

/**
 * Pairs of names that look like spellings of each other: one edit for names of up to SHORT_NAME
 * letters, two above (by the shorter name's code points); never a name with itself (nor with
 * the same name in another Unicode form). Names over NAME_COMPARE_MAX code points are passed
 * over. Each pair in the order the names were given (as first given), and the pairs in that order.
 */
export function neighbours(names: readonly string[]): Array<[string, string]> {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = normal(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  const unique = [...seen.values()];
  const letters = [...seen.keys()].map((key) => Array.from(key));
  // By length, so each name is compared only with names at most two letters longer.
  const order = unique
    .map((_, i) => i)
    .filter((i) => {
      const length = (letters[i] as string[]).length;
      return length > 0 && length <= NAME_COMPARE_MAX;
    })
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
      if (within(x, y, max)) found.push(i < j ? [i, j] : [j, i]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return found.map(([i, j]) => [unique[i] as string, unique[j] as string]);
}
