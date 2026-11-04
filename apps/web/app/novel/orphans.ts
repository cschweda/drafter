import type { Text } from '@codemirror/state';
import { orphanedFacts, readFacts } from '@drafter/novel';
import { docIsNovel, structureOf } from './carry';

/** The Problems rule a novel's orphaned facts are listed under (advice, not a fault). */
export const ORPHAN_RULE = 'novel-orphaned-notes';

/** "1 passage's notes no longer match a chapter or section." / "N passages' notes …", or null. */
export function orphanMessage(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 passage's notes no longer match a chapter or section."
    : `${count} passages' notes no longer match a chapter or section.`;
}

/**
 * Whether the document could hold a novel's kept facts: its last line is the metadata comment
 * naming the novel template and mentioning `nodes`. A cheap look, so a book without facts (or any
 * other document) costs nothing to check.
 */
export function mayHaveOrphans(doc: Text): boolean {
  if (!docIsNovel(doc)) return false;
  let n = doc.lines;
  while (n > 1 && doc.line(n).text.trim() === '') n--;
  return doc.line(n).text.includes('"nodes"');
}

/**
 * How many passages have facts kept (status, synopsis, or a target) but no chapter or section now:
 * a heading renamed or removed outside Drafter. Reads the whole book, so callers ask only after
 * `mayHaveOrphans`, and not on every keystroke.
 */
export function orphanCount(doc: Text): number {
  if (!mayHaveOrphans(doc)) return 0;
  const text = doc.toString();
  return orphanedFacts(readFacts(text), structureOf(doc, text)).length;
}
