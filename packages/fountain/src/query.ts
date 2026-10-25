import type { Block, Doc, Span } from './types';

/** The block whose span contains `offset`, counting the end of its last line. */
export function blockAt(doc: Doc, offset: number): { block: Block; index: number } | null {
  let lo = 0;
  let hi = doc.blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const block = doc.blocks[mid] as Block;
    if (offset < block.span.from) hi = mid - 1;
    else if (offset > block.span.to) lo = mid + 1;
    else return { block, index: mid };
  }
  return null;
}

/** Every character name, in order of first appearance, with its number of cues. */
export function characters(doc: Doc): Array<{ name: string; count: number; lastSpan: Span }> {
  const byName = new Map<string, { name: string; count: number; lastSpan: Span }>();
  for (const block of doc.blocks) {
    if (block.kind !== 'character') continue;
    const { name } = block.sem;
    const lastSpan = { ...(block.lines[0] ?? block).span };
    const entry = byName.get(name);
    if (entry) {
      entry.count++;
      entry.lastSpan = lastSpan;
    } else {
      byName.set(name, { name, count: 1, lastSpan });
    }
  }
  return [...byName.values()];
}

/** Every scene-heading location, in order of first appearance, with its count. */
export function locations(doc: Doc): Array<{ text: string; count: number }> {
  const counts = new Map<string, number>();
  for (const block of doc.blocks) {
    if (block.kind !== 'scene_heading' || !block.sem.location) continue;
    counts.set(block.sem.location, (counts.get(block.sem.location) ?? 0) + 1);
  }
  return [...counts].map(([text, count]) => ({ text, count }));
}
