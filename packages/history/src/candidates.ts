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

  add(print: ScenePrint, item: T): void {
    file(this.byHash, print.hash, item);
    file(this.byKey, print.headingKey, item);
    if (print.shingles === 0) file(this.emptyByKey, print.headingKey, item);
    for (const value of print.sketch) file(this.bySketch, value, item);
  }

  /** Every item filed with one of `print`'s, once each. */
  of(print: ScenePrint): Set<T> {
    const out = new Set<T>(this.byHash.get(print.hash));
    const byKey = print.shingles === 0 ? this.byKey : this.emptyByKey;
    for (const item of byKey.get(print.headingKey) ?? []) out.add(item);
    for (const value of print.sketch)
      for (const item of this.bySketch.get(value) ?? []) out.add(item);
    return out;
  }
}

function file<K, T>(map: Map<K, T[]>, key: K, item: T): void {
  const list = map.get(key);
  if (!list) map.set(key, [item]);
  else if (list[list.length - 1] !== item) list.push(item);
}
