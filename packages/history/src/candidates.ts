import type { ScenePrint } from './print';

/**
 * Items filed by what `sameScene` needs two versions to share before it can match them: the
 * hash, a value in both sketches, or, when one of them is empty, the heading key. Every rule but
 * the first two needs a value in both sketches (J above 0 does, as does C above 0), so the items
 * filed with any of a version's are every one it could match, and usually a handful. A version
 * with words is looked for under its heading among the empty ones only, so a heading the script
 * comes back to often (`INT. CAR - NIGHT`) doesn't make every version under it a candidate.
 */
export class Candidates<T> {
  private readonly byHash = new Map<string, T[]>();
  private readonly byKey = new Map<string, T[]>();
  private readonly emptyByKey = new Map<string, T[]>();
  private readonly bySketch = new Map<number, T[]>();
  /** Each item's place in the order items were first added. */
  private readonly order = new Map<T, number>();

  add(print: ScenePrint, item: T): void {
    if (!this.order.has(item)) this.order.set(item, this.order.size);
    this.file(this.byHash, print.hash, item);
    this.file(this.byKey, print.headingKey, item);
    if (print.shingles === 0) this.file(this.emptyByKey, print.headingKey, item);
    for (const value of print.sketch) this.file(this.bySketch, value, item);
  }

  /**
   * The items filed with one of `print`'s, once each, nearest to `near` (a place in the order
   * items were first added; the newest when left out) first. Every one of them while there are at most
   * `CANDIDATES_MAX`; past that (many nearly identical scenes or sections, where each filing
   * holds most of them), the `CANDIDATES_MAX` filed with the most of `print`'s, nearest first on
   * a tie, so the work for each stays bounded and the whole stays linear.
   */
  of(print: ScenePrint, near = Number.POSITIVE_INFINITY): T[] {
    const lists: T[][] = [];
    const hash = this.byHash.get(print.hash);
    if (hash) lists.push(hash);
    const byKey = (print.shingles === 0 ? this.byKey : this.emptyByKey).get(print.headingKey);
    if (byKey) lists.push(byKey);
    for (const value of print.sketch) {
      const list = this.bySketch.get(value);
      if (list) lists.push(list);
    }
    const hits = new Map<T, number>();
    for (const list of lists) {
      for (const item of this.nearest(list, near)) hits.set(item, (hits.get(item) ?? 0) + 1);
    }
    const distance = (item: T) => Math.abs((this.order.get(item) as number) - near);
    const all = [...hits.keys()];
    if (all.length > CANDIDATES_MAX) {
      all.sort(
        (a, b) => (hits.get(b) as number) - (hits.get(a) as number) || distance(a) - distance(b),
      );
      all.length = CANDIDATES_MAX;
    }
    return all.sort((a, b) => distance(a) - distance(b));
  }

  /** A filing's items, or its `CANDIDATES_MAX` nearest to `near` when it holds more. */
  private nearest(list: readonly T[], near: number): readonly T[] {
    if (list.length <= CANDIDATES_MAX) return list;
    const at = (i: number) => this.order.get(list[i] as T) as number;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at(mid) < near) lo = mid + 1;
      else hi = mid;
    }
    let left = lo - 1;
    let right = lo;
    const out: T[] = [];
    while (out.length < CANDIDATES_MAX && (left >= 0 || right < list.length)) {
      const takeRight = right < list.length && (left < 0 || at(right) - near <= near - at(left));
      out.push(list[takeRight ? right++ : left--] as T);
    }
    return out;
  }

  private file<K>(map: Map<K, T[]>, key: K, item: T): void {
    const list = map.get(key);
    if (!list) map.set(key, [item]);
    else if (list[list.length - 1] !== item) list.push(item);
  }
}

/** The most candidates a lookup gives, and the most it takes from any one filing. */
export const CANDIDATES_MAX = 64;
