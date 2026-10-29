import type { Span } from '@drafter/fountain';
import { splitLines } from './lines';
import { diffLines } from './myers';

/** One place where the newer text differs from the older. Ranges are half-open line ranges. */
export interface Change {
  /** `changed` is lines removed and others added in their place. */
  kind: 'added' | 'changed' | 'removed';
  /** Lines of the older text (`[k, k]` when added). */
  old: [number, number];
  /** Lines of the newer text (`[k, k]` when removed: it goes before line k). */
  new: [number, number];
  /** The newer text's offsets of `new`, without the last line's break (empty at line k's start when removed). */
  span: Span;
  /** The older lines it took out, as they were. */
  removed: string[];
}

/** The changes from `older` to `newer`, in order, by lines; `\r\n` and `\n` read the same. */
export function changesOf(older: string, newer: string): Change[] {
  const a = splitLines(older).lines;
  const { lines: b, starts } = splitLines(newer);
  const changes: Change[] = [];
  let pending: Change | null = null;
  for (const run of diffLines(a, b)) {
    if (run.kind === 'same') {
      pending = null;
      continue;
    }
    if (run.kind === 'removed') {
      const at = starts[run.new[0]] ?? newer.length;
      pending = {
        kind: 'removed',
        old: [...run.old],
        new: [...run.new],
        span: { from: at, to: at },
        removed: a.slice(run.old[0], run.old[1]),
      };
      changes.push(pending);
      continue;
    }
    const last = run.new[1] - 1;
    const span = { from: starts[run.new[0]], to: starts[last] + b[last].length };
    if (pending) {
      // An addition right after a removal replaces it.
      pending.kind = 'changed';
      pending.new = [...run.new];
      pending.span = span;
      pending = null;
    } else {
      changes.push({ kind: 'added', old: [...run.old], new: [...run.new], span, removed: [] });
    }
  }
  return changes;
}
