import { findMarkdownMeta, wordsIn } from '@drafter/markdown';

// The structure of a novel in Markdown: parts (`# Part …`), chapters (`#`), and sections (`##`, or an
// untitled one at a scene break). One scan of the lines, tracking the open code fence.

export type NovelKind = 'part' | 'chapter' | 'section';

export interface NovelNode {
  /** `${kind}:${slug(title)}:${ordinal among all nodes of that kind and slug, in document order}`, unique in the book. */
  id: string;
  kind: NovelKind;
  /** The heading's text; `''` for a scene break. */
  title: string;
  /** The heading's lines, from its first character to the end of its last line (no line break). */
  heading: { from: number; to: number };
  /** From the heading's start to the next sibling-or-ancestor's heading, or the text's end. */
  span: { from: number; to: number };
  /** Words in the node's own text and everything under it. */
  words: number;
  /** Words in the title and between the heading and the first child (or the end of the span). */
  ownWords: number;
  children: NovelNode[];
}

export interface NovelTree {
  /** The text before the first heading. */
  preamble: { from: number; to: number } | null;
  /** Whether the book has parts. */
  parts: boolean;
  /**
   * Parts and chapters only. Chapters that come before the first part stay at the root beside the
   * parts, and a `##` heading (or setext `-` heading, or scene break) with no chapter open is a chapter. A part's children are always chapters.
   */
  nodes: NovelNode[];
  /** Every word before the metadata comment. */
  words: number;
}

const RANK: Record<NovelKind, number> = { part: 0, chapter: 1, section: 2 };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// One space or tab, then the rest: no two parts of the pattern can match the same characters, so a
// long run of spaces cannot make it backtrack. The title is trimmed by hand below.
const ATX = /^ {0,3}(#{1,6})(?:[ \t]([^\n]*))?$/;
const BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_1 = /^ {0,3}=+[ \t]*$/;
const SETEXT_2 = /^ {0,3}-+[ \t]*$/;
const NOT_PARAGRAPH_START = /^(?: {4}|\t|<!--)/;
// A blockquote or list item; the lines after it, to the next blank line, belong to it.
const CONTAINER_START = /^ {0,3}(?:>|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$))/;
const PART = /^part(?:\s|$)/i;

function isBlank(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\r';
}

/** An ATX heading's text: trimmed, without a closing run of `#` (which a space or tab must precede). */
function atxTitle(rest: string): string {
  let a = 0;
  let b = rest.length;
  while (a < b && isBlank(rest[a])) a++;
  while (b > a && isBlank(rest[b - 1])) b--;
  let c = b;
  while (c > a && rest[c - 1] === '#') c--;
  if (c < b && (c === a || isBlank(rest[c - 1]))) {
    b = c;
    while (b > a && isBlank(rest[b - 1])) b--;
  }
  return rest.slice(a, b);
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

interface Open {
  node: NovelNode;
}

/** Reads a novel's structure in one pass. The metadata comment, and what it holds, is not read. */
export function novelStructure(text: string): NovelTree {
  const end = findMarkdownMeta(text)?.from ?? text.length;
  const roots: NovelNode[] = [];
  const seen = new Map<string, number>();
  const stack: Open[] = [];
  let firstHeading = -1;
  let fence: { char: string; size: number } | null = null;
  // The start of the paragraph that the previous line belongs to, else -1.
  let paraStart = -1;
  let paraText = '';
  // Inside a blockquote or list item, whose lines can't start a setext heading.
  let container = false;

  const open = (wanted: NovelKind, title: string, from: number, to: number) => {
    if (firstHeading < 0) firstHeading = from;
    // With nothing open, or only a part, a section heading (an opening "## Prologue") or a scene
    // break is a chapter: a part's children are always chapters.
    const top = stack.length > 0 ? stack[stack.length - 1].node.kind : null;
    const kind = wanted === 'section' && (top === null || top === 'part') ? 'chapter' : wanted;
    while (stack.length > 0 && RANK[stack[stack.length - 1].node.kind] >= RANK[kind]) {
      const done = stack.pop() as Open;
      done.node.span.to = from;
    }
    const siblings = stack.length > 0 ? stack[stack.length - 1].node.children : roots;
    const key = `${kind}:${slug(title)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const node: NovelNode = {
      id: `${key}:${n}`,
      kind,
      title,
      heading: { from, to },
      span: { from, to: end },
      words: 0,
      ownWords: 0,
      children: [],
    };
    siblings.push(node);
    stack.push({ node });
  };

  let pos = 0;
  while (pos < end) {
    let eol = text.indexOf('\n', pos);
    if (eol < 0 || eol > end) eol = end;
    const next = eol < end ? eol + 1 : end;
    let lineEnd = eol;
    if (lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) lineEnd--;
    const line = text.slice(pos, lineEnd);

    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.size &&
        line.trim() === fenceMatch[1]
      ) {
        fence = null;
      }
      paraStart = -1;
    } else if (
      fenceMatch &&
      !(fenceMatch[1][0] === '`' && line.includes('`', fenceMatch[0].length))
    ) {
      fence = { char: fenceMatch[1][0], size: fenceMatch[1].length };
      paraStart = -1;
    } else if (line.trim() === '') {
      paraStart = -1;
      container = false;
    } else {
      const atx = ATX.exec(line);
      if (atx) {
        paraStart = -1;
        const level = atx[1].length;
        if (level <= 2) {
          const title = atxTitle(atx[2] ?? '');
          const kind: NovelKind = level === 2 ? 'section' : PART.test(title) ? 'part' : 'chapter';
          open(kind, title, pos, lineEnd);
        }
      } else if (paraStart >= 0 && SETEXT_1.test(line)) {
        open(PART.test(paraText) ? 'part' : 'chapter', paraText, paraStart, lineEnd);
        paraStart = -1;
      } else if (paraStart >= 0 && SETEXT_2.test(line)) {
        open('section', paraText, paraStart, lineEnd);
        paraStart = -1;
      } else if (BREAK.test(line)) {
        paraStart = -1;
        if (stack.length > 0) open('section', '', pos, lineEnd);
      } else if (CONTAINER_START.test(line)) {
        paraStart = -1;
        container = true;
      } else if (container) {
        // A lazy line of a quote or list item.
      } else if (paraStart >= 0) {
        paraText += ` ${line.trim()}`;
      } else if (!NOT_PARAGRAPH_START.test(line)) {
        paraStart = pos;
        paraText = line.trim();
      }
    }
    pos = next;
  }

  // Words, once each: a node's own text runs from its heading to its first child's heading.
  const count = (node: NovelNode): void => {
    const own = node.children.length > 0 ? node.children[0].heading.from : node.span.to;
    node.ownWords = wordsIn(node.title) + wordsIn(text.slice(node.heading.to, own));
    let words = node.ownWords;
    for (const child of node.children) {
      count(child);
      words += child.words;
    }
    node.words = words;
  };
  let words = 0;
  for (const node of roots) {
    count(node);
    words += node.words;
  }

  const stop = firstHeading < 0 ? end : firstHeading;
  const preamble = stop > 0 ? { from: 0, to: stop } : null;
  if (preamble) words += wordsIn(text.slice(0, stop));
  return { preamble, parts: roots.some((n) => n.kind === 'part'), nodes: roots, words };
}

/** The deepest node whose span holds `offset`. */
export function nodeAt(tree: NovelTree, offset: number): NovelNode | null {
  let list = tree.nodes;
  let found: NovelNode | null = null;
  for (;;) {
    let hit: NovelNode | null = null;
    // Siblings are in order: binary search for the last one starting at or before offset.
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].span.from <= offset) {
        hit = list[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (!hit || offset >= hit.span.to) return found;
    found = hit;
    list = hit.children;
  }
}

/** The node with this id, or null. */
export function findNode(tree: NovelTree, id: string): NovelNode | null {
  // Document order: pop from the end, so push children last-first.
  const stack = [...tree.nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as NovelNode;
    if (node.id === id) return node;
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return null;
}
