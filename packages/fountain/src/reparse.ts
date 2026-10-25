import { parse } from './parse';
import type { Doc, TextChange } from './types';

/**
 * Applies `changes` to the document's source and parses the result in full
 * (technical design §2.7). Changes are in old-document offsets, sorted, and
 * non-overlapping; ranges may touch, and their inserts then apply in order.
 */
export function reparse(doc: Doc, changes: readonly TextChange[]): Doc {
  const { source } = doc;
  let out = '';
  let pos = 0;
  for (const { from, to, insert } of changes) {
    if (!(from >= pos && to >= from && to <= source.length)) {
      throw new RangeError(
        `Invalid change ${from}–${to}: changes must be sorted, non-overlapping, and within 0–${source.length}.`,
      );
    }
    out += source.slice(pos, from) + insert;
    pos = to;
  }
  return parse(out + source.slice(pos));
}
