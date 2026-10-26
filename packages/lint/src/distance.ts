/**
 * Whether `a` from index `i` is the same as `b` from index `j`: the same number of code points
 * left, and the same ones.
 */
function sameFrom(a: readonly string[], i: number, b: readonly string[], j: number): boolean {
  if (a.length - i !== b.length - j) return false;
  for (; i < a.length; i++, j++) {
    if (a[i] !== b[j]) return false;
  }
  return true;
}

/**
 * Whether the restricted Damerau-Levenshtein distance between two strings is at most 1: they are
 * the same, or one edit apart. An edit is one substitution, one insertion or deletion, or one
 * swap of two neighbours. It counts code points, so an emoji or any other character outside the
 * Basic Multilingual Plane, which takes two UTF-16 units, is one.
 *
 * It needs no table. The strings can only be within one edit if they agree up to some index and
 * differ there, so it finds that index once and checks that what follows is what one edit would
 * leave.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const x = Array.from(a);
  const y = Array.from(b);
  const gap = x.length - y.length;
  if (gap > 1 || gap < -1) return false;

  // They agree before `i`. (The shorter one may end there.)
  const shared = Math.min(x.length, y.length);
  let i = 0;
  while (i < shared && x[i] === y[i]) i++;

  if (gap === 0) {
    // One substitution at `i`, or the code points at `i` and `i + 1` swapped.
    return (
      sameFrom(x, i + 1, y, i + 1) ||
      (x[i] === y[i + 1] && x[i + 1] === y[i] && sameFrom(x, i + 2, y, i + 2))
    );
  }
  // One insertion at `i`: the longer one is the shorter one with a code point put in.
  return gap > 0 ? sameFrom(x, i + 1, y, i) : sameFrom(x, i, y, i + 1);
}
