import type { Doc, TextChange } from '@drafter/fountain';
import { contentEnd } from './scene-index';
import type { OutlineItem, SceneIndex } from './types';

// Moving scenes and sections (Phase 2 design §6.2–6.3). A move is two changes, a delete and an
// insert, in the text as it is, for one editor transaction. The scene's (or the section's whole)
// text moves as it is, with everything inside it; it is cut together with the gap before it, and
// arrives as a blank line and the text after the place it goes. So a scene moved and moved back
// comes back exactly, wherever scenes are one blank line apart, as Drafter writes them.

/**
 * Where a move lands: just after a scene, just after a section's heading and the blocks before
 * its first child (the section's start), or at the start of the script, after the preamble.
 */
export type MoveTarget = { after: number } | { start: true };

export interface Move {
  /** A delete and an insert, in the offsets of the text as it is. */
  changes: TextChange[];
  /** Every scene or section heading inside the moved text: its offset before, and after. */
  moved: Array<{ from: number; to: number }>;
  /** The moved heading's offset after the move. */
  at: number;
}

/** The script's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
export function lineBreakOf(source: string): string {
  const at = source.indexOf('\n');
  return at > 0 && source[at - 1] === '\r' ? '\r\n' : '\n';
}

const itemAt = (index: SceneIndex, block: number) => index.items.find((i) => i.block === block);

/** The end of the item's own unit: a scene's end, or a section's heading and intro. */
const unitEnd = (item: OutlineItem) => (item.kind === 'scene' ? item.span.to : item.introEnd);

/** The last item inside `item`'s span (itself, for a scene or a section with nothing in it). */
function lastWithin(index: SceneIndex, item: OutlineItem): OutlineItem {
  let last = item;
  for (const other of index.items) {
    if (other.span.from > item.span.from && other.span.from < item.span.to) last = other;
  }
  return last;
}

/** The target that puts an item just before `item`: after the item before it, or at the start. */
function before(index: SceneIndex, item: OutlineItem): MoveTarget {
  const previous = index.items[index.items.indexOf(item) - 1];
  return previous ? { after: previous.block } : { start: true };
}

/** The section a scene or section sits in directly, or null at the top. */
const parentOf = (item: OutlineItem): number | null =>
  item.kind === 'scene' ? (item.sections[item.sections.length - 1] ?? null) : item.parent;

/** The items that share `item`'s parent, in order. */
const siblingsOf = (index: SceneIndex, item: OutlineItem) =>
  index.items.filter((other) => parentOf(other) === parentOf(item));

/**
 * One place up (design §6.2): a scene goes before the scene before it, or, first in its section,
 * to the end of the section before; a section goes before its previous sibling, or out past its
 * parent's start. Null when there is nowhere to go (nothing moves above the preamble).
 */
export function upTarget(index: SceneIndex, block: number): MoveTarget | null {
  const item = itemAt(index, block);
  if (!item) return null;
  if (item.kind === 'scene') {
    const previous = index.items[index.items.indexOf(item) - 1];
    return previous ? before(index, previous) : null;
  }
  // Its parent's own scenes, and deeper sections, would become part of it, so a section passes
  // only sections as shallow as itself.
  const siblings = siblingsOf(index, item).filter(
    (other) => other === item || (other.kind === 'section' && other.depth <= item.depth),
  );
  const previous = siblings[siblings.indexOf(item) - 1];
  if (previous) return before(index, previous);
  const parent = item.parent === null ? undefined : itemAt(index, item.parent);
  return parent ? before(index, parent) : null;
}

/**
 * One place down: a scene goes after the next scene, or, last in its section, to the start of
 * the section after; a section goes after its next sibling, or past its parent's end to the start
 * of what follows. Null when there is nowhere to go.
 */
export function downTarget(index: SceneIndex, block: number): MoveTarget | null {
  const item = itemAt(index, block);
  if (!item) return null;
  if (item.kind === 'scene') {
    const next = index.items[index.items.indexOf(item) + 1];
    return next ? { after: next.block } : null;
  }
  const siblings = siblingsOf(index, item);
  const next = siblings[siblings.indexOf(item) + 1];
  if (next) return { after: lastWithin(index, next).block };
  const after = index.items[index.items.indexOf(lastWithin(index, item)) + 1];
  return after ? { after: after.block } : null;
}

/**
 * Where a drop line just below `row` puts an item: after a scene; at the start of an open
 * section; after the whole of a closed one. Above the first row (`null`), the start.
 */
export function targetAfterRow(
  index: SceneIndex,
  row: OutlineItem | null,
  open: boolean,
): MoveTarget {
  if (!row) return { start: true };
  if (row.kind === 'section' && !open) return { after: lastWithin(index, row).block };
  return { after: row.block };
}

/**
 * Moves the scene or section whose heading is block `block` to `target`, as text changes. Null
 * when the move would change nothing, when the target is inside the moved section, or when
 * `block` is no scene or section.
 */
export function moveItem(
  doc: Doc,
  index: SceneIndex,
  block: number,
  target: MoveTarget,
): Move | null {
  const item = itemAt(index, block);
  if (!item) return null;
  const { source, blocks } = doc;
  const nl = lineBreakOf(source);
  const gap = nl + nl;
  const range = item.span;
  const text = source.slice(range.from, range.to);

  // Where it goes, and what is written there.
  let at: number;
  let insert: string;
  let offset: number; // where the moved text starts within `insert`
  if ('after' in target) {
    const after = itemAt(index, target.after);
    if (!after) return null;
    at = unitEnd(after);
    insert = gap + text;
    offset = gap.length;
  } else if (index.preamble) {
    at = index.preamble.to;
    insert = gap + text;
    offset = gap.length;
  } else {
    const first = index.items[0];
    if (!first || first === item) return null;
    at = first.span.from;
    insert = text + gap;
    offset = 0;
  }
  // A section can't sit before a scene or a deeper section that isn't its own: in Fountain it
  // would become part of it. So it goes past those that follow the place it was given, to the
  // next section as shallow as itself, or the end.
  if (item.kind === 'section') {
    for (const next of index.items) {
      if (next.span.from < at || (next.span.from >= range.from && next.span.from < range.to)) {
        continue;
      }
      if (next.kind === 'section' && next.depth <= item.depth) break;
      at = next.span.to;
      insert = gap + text;
      offset = gap.length;
    }
  }
  // Inside itself, or just after itself, is no move.
  if (at > range.from && at <= range.to) return null;

  // What is cut: the text and the gap before it, or, with nothing before it, the gap after.
  const first = blocks.findIndex((b) => b.span.from === range.from);
  const end = first > 0 ? blocks[first - 1]?.span.to : doc.titlePage?.span.to;
  const previousEnd = end === undefined ? undefined : contentEnd(source, end);
  let cut: { from: number; to: number };
  if (previousEnd !== undefined) {
    if (at === previousEnd) return null;
    cut = { from: previousEnd, to: range.to };
  } else {
    const next = blocks.find((b) => b.span.from >= range.to);
    cut = { from: range.from, to: next ? next.span.from : range.to };
  }
  if (at > cut.from && at < cut.to) return null;

  const start = (at <= cut.from ? at : at - (cut.to - cut.from)) + offset;
  const changes: TextChange[] = [
    { from: cut.from, to: cut.to, insert: '' },
    { from: at, to: at, insert },
  ].sort((a, b) => a.from - b.from);
  const moved = index.items
    .filter((other) => other.span.from >= range.from && other.span.from < range.to)
    .map((other) => ({ from: other.span.from, to: start + (other.span.from - range.from) }));
  return { changes, moved, at: start };
}
