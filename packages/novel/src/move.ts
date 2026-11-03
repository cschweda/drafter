import { findMarkdownMeta } from '@drafter/markdown';
import { findNode, type NovelNode, type NovelTree } from './structure';

// Moving a part, a chapter, or a section. A node is cut together with the blank lines around it
// and written again at its new place, so that exactly one empty line (in the file's own line
// break) stands at each seam. The node's own text (its heading to its last non-blank line) moves
// byte for byte. Nothing is read or written past the trailing metadata comment.

export type NovelTarget = { before: string } | { after: string } | { into: string };

export interface NovelMove {
  /** Replacements in the offsets of the text as it is, in order and not overlapping. */
  changes: Array<{ from: number; to: number; insert: string }>;
  /** The moved heading's offset after the move. */
  at: number;
}

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** The end of the last non-blank line before `pos` (without its line break), or -1 if none. */
function contentEndBefore(text: string, pos: number): number {
  let k = pos - 1;
  while (k >= 0 && isWs(text[k])) k--;
  if (k < 0) return -1;
  let e = k + 1;
  while (e < pos && text[e] !== '\n' && text[e] !== '\r') e++;
  return e;
}

function contains(node: NovelNode, id: string): boolean {
  return node.id === id || node.children.some((c) => contains(c, id));
}

function parentOf(tree: NovelTree, id: string): NovelNode | null {
  const walk = (list: NovelNode[], parent: NovelNode | null): NovelNode | null | undefined => {
    for (const n of list) {
      if (n.id === id) return parent;
      const r = walk(n.children, n);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(tree.nodes, null) ?? null;
}

/** The kinds a move may use: what each kind may sit beside, and inside. */
function fits(node: NovelNode, target: NovelNode, how: 'before' | 'after' | 'into'): boolean {
  if (how === 'into') {
    return (
      (node.kind === 'section' && target.kind === 'chapter') ||
      (node.kind === 'chapter' && target.kind === 'part')
    );
  }
  return node.kind === target.kind;
}

/**
 * Moves the part, chapter, or section `id` to `target` as text changes, or returns null when it
 * would change nothing, the target is inside the node, the kinds don't fit, or an id is unknown.
 */
export function moveNode(
  text: string,
  tree: NovelTree,
  id: string,
  target: NovelTarget,
): NovelMove | null {
  const node = findNode(tree, id);
  if (!node) return null;
  const how = 'before' in target ? 'before' : 'after' in target ? 'after' : 'into';
  const targetId =
    'before' in target ? target.before : 'after' in target ? target.after : target.into;
  const dest = findNode(tree, targetId);
  if (!dest || contains(node, targetId) || !fits(node, dest, how)) return null;

  const end = findMarkdownMeta(text)?.from ?? text.length;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const gap = nl + nl;

  // The node's unit: its heading to its last non-blank line.
  const uf = node.span.from;
  const ue = Math.max(contentEndBefore(text, node.span.to), node.heading.to);
  const unit = text.slice(uf, ue);
  const prevEnd = contentEndBefore(text, uf); // -1: nothing before it
  const nextFrom = node.span.to < end ? node.span.to : -1;

  // The cut.
  let cut: { from: number; to: number; insert: string };
  if (prevEnd >= 0) {
    cut =
      nextFrom >= 0
        ? { from: prevEnd, to: nextFrom, insert: gap }
        : { from: prevEnd, to: ue, insert: '' };
  } else if (nextFrom >= 0) {
    cut = { from: uf, to: nextFrom, insert: '' };
  } else {
    return null;
  }

  // The place: after the content ending at `ip` (-1: none) and before the heading at `nf` (-1: none).
  let ip: number;
  let nf: number;
  if (how === 'before' || (how === 'into' && dest.children.length > 0)) {
    const first = how === 'into' ? dest.children[0] : dest;
    nf = first.span.from;
    ip = contentEndBefore(text, nf);
  } else {
    ip = Math.max(contentEndBefore(text, dest.span.to), dest.heading.to);
    nf = dest.span.to < end ? dest.span.to : -1;
  }

  // Where it already is, or inside itself, is no move.
  if (ip === prevEnd || ip === ue || (ip > cut.from && ip < cut.to)) return null;
  if (prevEnd < 0 && nf === uf) return null;

  let place: { from: number; to: number; insert: string };
  let offset: number;
  if (ip >= 0 && nf >= 0) {
    place = { from: ip, to: nf, insert: gap + unit + gap };
    offset = gap.length;
  } else if (ip >= 0) {
    place = { from: ip, to: ip, insert: gap + unit };
    offset = gap.length;
  } else {
    place = { from: nf, to: nf, insert: unit + gap };
    offset = 0;
  }
  // The two regions are gaps between blocks and cannot overlap; if they did, nothing moves.
  if (place.from < cut.to && cut.from < place.to) return null;
  if (place.from === cut.to || place.to === cut.from) return null;

  const changes = [cut, place].sort((a, b) => a.from - b.from);
  const shift = cut.from < place.from ? cut.insert.length - (cut.to - cut.from) : 0;
  return { changes, at: place.from + offset + shift };
}

const chaptersOf = (tree: NovelTree): NovelNode[] =>
  tree.nodes.flatMap((n) => (n.kind === 'part' ? n.children : [n]));

/** The target that moves a node one place up, or null at the top. */
export function upTarget(tree: NovelTree, id: string): NovelTarget | null {
  const node = findNode(tree, id);
  if (!node) return null;
  const parent = parentOf(tree, id);
  const siblings = parent ? parent.children : tree.nodes;
  const previous = siblings[siblings.indexOf(node) - 1];
  if (node.kind === 'part') return previous?.kind === 'part' ? { before: previous.id } : null;
  if (previous && previous.kind === node.kind) return { before: previous.id };
  if (node.kind === 'section') {
    const chapters = chaptersOf(tree);
    const before = chapters[chapters.indexOf(parent as NovelNode) - 1];
    if (!before) return null;
    const last = before.children[before.children.length - 1];
    return last ? { after: last.id } : { into: before.id };
  }
  // A chapter first in its part goes to the end of the part before.
  if (parent) {
    const parts = tree.nodes.filter((n) => n.kind === 'part');
    const before = parts[parts.indexOf(parent) - 1];
    if (!before) return null;
    const last = before.children[before.children.length - 1];
    return last ? { after: last.id } : { into: before.id };
  }
  return null;
}

/** The target that moves a node one place down, or null at the bottom. */
export function downTarget(tree: NovelTree, id: string): NovelTarget | null {
  const node = findNode(tree, id);
  if (!node) return null;
  const parent = parentOf(tree, id);
  const siblings = parent ? parent.children : tree.nodes;
  const next = siblings[siblings.indexOf(node) + 1];
  if (node.kind === 'part') return next?.kind === 'part' ? { after: next.id } : null;
  if (next && next.kind === node.kind) return { after: next.id };
  if (node.kind === 'section') {
    const chapters = chaptersOf(tree);
    const after = chapters[chapters.indexOf(parent as NovelNode) + 1];
    return after ? { into: after.id } : null;
  }
  // A chapter last in its part (or before the first part) goes into the next part.
  const parts = tree.nodes.filter((n) => n.kind === 'part');
  const after = parent ? parts[parts.indexOf(parent) + 1] : parts[0];
  return after ? { into: after.id } : null;
}
