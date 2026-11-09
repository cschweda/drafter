// A-numbers: the numbers a scene gets when it is added after the script's
// scene numbers were locked. Locked numbers never change, so a new scene
// between 5 and 6 becomes 5A, and one before scene 1 becomes A1.

// A scene number is: optional letter prefix, digits, optional letter suffix.
const SHAPE = /^([A-Z]*)(\d+)([A-Z]*)$/;

interface Parsed {
  prefix: string;
  digits: string;
  suffix: string;
}

function parse(value: string): Parsed | null {
  const m = SHAPE.exec(value);
  return m ? { prefix: m[1] ?? '', digits: m[2] ?? '', suffix: m[3] ?? '' } : null;
}

// Suffix letters sort in plain dictionary order, empty first:
// 5 < 5A < 5AA < 5AB < 5B < ... < 5Z < 5ZA. Plain string comparison does that.
function compareLetters(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Add one to the last letter (A -> B). Z cannot go up, and an empty suffix
// starts at A, so those return null and the caller appends a letter instead.
function bumpLast(letters: string): string | null {
  if (letters === '') return 'A';
  const last = letters.charAt(letters.length - 1);
  if (last === 'Z') return null;
  return letters.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
}

/**
 * Script order of two scene numbers: digits numerically, then the letter
 * suffix in dictionary order (5 < 5A < 5AA < 5AB < 5B < 5Z < 5ZA), then the
 * prefix with the longer one first (AA1 < A1 < 1, and A5A < 5A). A number not
 * in this shape (a writer's own scheme like 12.1) falls back to a plain
 * natural-number string compare.
 */
export function compareSceneNumbers(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.localeCompare(b, 'en', { numeric: true });
  const digits = Number(pa.digits) - Number(pb.digits);
  if (digits !== 0) return digits < 0 ? -1 : 1;
  const suffix = compareLetters(pa.suffix, pb.suffix);
  if (suffix !== 0) return suffix;
  if (pa.prefix === pb.prefix) return 0;
  if (pa.prefix.length !== pb.prefix.length) return pb.prefix.length - pa.prefix.length;
  return pa.prefix < pb.prefix ? -1 : 1;
}

/**
 * The number for a scene added between two numbered scenes. `null` means
 * "nothing on that side" (before the first scene, or after the last).
 *
 * 1. Find the shortest suffix strictly between the neighbours' suffixes,
 *    preferring to bump the last letter, else appending an A:
 *    5/6 -> 5A, 5A/6 -> 5B, 5A/5B -> 5AA, 5Z/6 -> 5ZA.
 * 2. If no suffix fits (nothing lies between 5 and 5A), put a longer letter
 *    prefix on `after`: 5/5A -> A5A, then 5/A5A -> AA5A. When `before` is
 *    already prefixed, step its prefix up instead: A5A/5A -> B5A.
 * 3. Before the first scene, prefix `after`: A1, then AA1.
 * Every answer sorts strictly between the two neighbours.
 *
 * `issued` holds numbers the lock has already given out. Once issued, a number never revives, even
 * when its scene was deleted: an issued answer is stepped past (5A issued: 5B), going a level
 * deeper the same way when a level is used up (5A..5Z issued: 5ZA).
 */
export function numberBetween(
  before: string | null,
  after: string | null,
  issued?: ReadonlySet<string>,
): string {
  let candidate = nextBetween(before, after);
  // Each step lands strictly past the last (or appends a letter), so this ends; the cap only
  // guards against a hostile issued list.
  for (let i = 0; issued?.has(candidate) && i < 10_000; i++) {
    candidate = nextBetween(candidate, after);
  }
  return candidate;
}

function nextBetween(before: string | null, after: string | null): string {
  if (before === null) return after === null ? '1' : `A${after}`;
  const p = parse(before);
  // A writer's own scheme: we cannot count in it, so just hang a letter on it.
  if (!p) return `${before}A`;
  const fits = (candidate: string) =>
    compareSceneNumbers(before, candidate) < 0 &&
    (after === null || compareSceneNumbers(candidate, after) < 0);
  const stem = `${p.prefix}${p.digits}`;
  const bumped = bumpLast(p.suffix);
  for (const letters of [bumped, `${p.suffix}A`]) {
    if (letters !== null && fits(`${stem}${letters}`)) return `${stem}${letters}`;
  }
  const q = after === null ? null : parse(after);
  if (q) {
    const tail = `${q.digits}${q.suffix}`;
    // First try stacking more A's on the front of `after`'s own prefix. A
    // longer prefix sorts earlier, so this lands just after `before` when
    // `before` has a shorter prefix (5/5A -> A5A, 5/A5A -> AA5A).
    for (let k = 1; k <= 8; k++) {
      const candidate = `${'A'.repeat(k)}${q.prefix}${tail}`;
      if (fits(candidate)) return candidate;
    }
    // Otherwise `before` already carries a prefix (A5A, just before 5A). Same-
    // length prefixes sort alphabetically, so step the last letter up
    // (A5A/5A -> B5A -> C5A) while it stays under `after`.
    const stepped = bumpLast(p.prefix);
    if (p.prefix !== '' && stepped !== null && fits(`${stepped}${tail}`)) {
      return `${stepped}${tail}`;
    }
  }
  // No sensible number found: unparseable neighbours, or a run of 26+ scenes
  // squeezed into one gap. Hang a letter on `before`; this may not sort
  // strictly between the neighbours.
  return `${before}A`;
}

/**
 * Fill in numbers for a script's scenes in order. Written numbers are kept;
 * each run of nulls is filled left to right, each new number chained from the
 * one before it (5A, 5B, 5C), always staying under the next written number,
 * and never giving out a number in `issued` again.
 */
export function provisionalNumbers(
  numbers: readonly (string | null)[],
  issued?: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i] ?? null;
    if (n !== null) {
      out.push(n);
      previous = n;
      continue;
    }
    // The next written number after this run, which the new one must stay under.
    let next: string | null = null;
    for (let j = i + 1; j < numbers.length; j++) {
      const m = numbers[j] ?? null;
      if (m !== null) {
        next = m;
        break;
      }
    }
    const made = numberBetween(previous, next, issued);
    out.push(made);
    previous = made;
  }
  return out;
}
