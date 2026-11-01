// Whole percents for a share of the whole (seeing-the-script design §4.3): the Stats tab's
// Characters table, Scaffold, and the story map round with this one function, so they agree.

/**
 * Whole percents of `amounts`' total, by largest remainder, so they add up to 100: each is rounded
 * down, then the points left go one each to the largest remainders, the earlier first on a tie.
 * All zeros (or none) share nothing.
 */
export function shares(amounts: readonly number[]): number[] {
  const total = amounts.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((n) => (n * 100) / total);
  const whole = exact.map(Math.floor);
  let left = 100 - whole.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, i) => ({ i, rest: n - (whole[i] as number) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    whole[i] = (whole[i] as number) + 1;
    left--;
  }
  return whole;
}
