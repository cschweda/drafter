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

// Letters count like spreadsheet columns: A..Z, then AA, AB.. AZ, BA.. ZZ, AAA.
// Shorter suffixes sort first, which is why 5Z comes before 5AA.
function nextLetters(letters: string): string {
  if (letters === '') return 'A';
  const chars = letters.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode((chars[i] as string).charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
  }
  return `A${chars.join('')}`;
}

function compareLetters(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Script order of two scene numbers: by digits, then prefix (A1 and AA1 come
 * before 1, the longer prefix earliest), then suffix (1 < 1A < 1B < 1Z < 1AA).
 * A number that is not in this shape (a writer's own scheme like 12.1) falls
 * back to a plain natural-number string compare.
 */
export function compareSceneNumbers(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.localeCompare(b, 'en', { numeric: true });
  const digits = Number(pa.digits) - Number(pb.digits);
  if (digits !== 0) return digits < 0 ? -1 : 1;
  if (pa.prefix !== pb.prefix) {
    return pa.prefix.length !== pb.prefix.length
      ? pb.prefix.length - pa.prefix.length
      : pa.prefix < pb.prefix
        ? -1
        : 1;
  }
  return compareLetters(pa.suffix, pb.suffix);
}

/**
 * The number for a scene added between two numbered scenes. `null` means
 * "nothing on that side" (before the first scene, or after the last).
 *
 * Limit: if the two neighbours are already adjacent in letters (5A and 5AA
 * have nothing between them), the result goes one level deeper than `before`
 * and so may not sort strictly between them. That is the brief's 5 / 5A -> 5AA.
 */
export function numberBetween(before: string | null, after: string | null): string {
  if (before === null) return after === null ? '1' : `A${after}`;
  const p = parse(before);
  // A writer's own scheme: we cannot count in it, so just hang a letter on it.
  if (!p) return `${before}A`;
  const next = `${p.prefix}${p.digits}${nextLetters(p.suffix)}`;
  if (after === null || compareSceneNumbers(next, after) < 0) return next;
  // No room at this level. Between a bare 5 and 5A the deeper level is 5AA.
  return p.suffix === '' ? `${before}AA` : `${before}A`;
}

/**
 * Fill in numbers for a script's scenes in order. Written numbers are kept;
 * each run of nulls is filled left to right, each new number chained from the
 * one before it (5A, 5B, 5C), always staying under the next written number.
 */
export function provisionalNumbers(numbers: readonly (string | null)[]): string[] {
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
    const made = numberBetween(previous, next);
    out.push(made);
    previous = made;
  }
  return out;
}
