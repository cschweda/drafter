import type { Fix } from '@drafter/lint';

/**
 * The source with a fix made. Its changes are in the offsets of the source as it
 * stands, so they go in from last to first and none moves the ones before it.
 */
export function applyFix(source: string, fix: Fix): string {
  let out = source;
  for (const { from, to, insert } of [...fix.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, from) + insert + out.slice(to);
  }
  return out;
}
