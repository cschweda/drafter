// A long document read in pieces. The parser (micromark) is linear, but slow on a long text: it
// keeps every token of the whole document in one array, so a 1.5 MB novel of 20,000 parts took a
// second, much of it garbage collection. Read in pieces of a few kilobytes, the same text takes
// half that; and a piece of nothing but headings, breaks, and plain prose is read without the
// parser at all (`readPlain`), which took that novel to a few tens of milliseconds. A piece can
// be read on its own only where nothing before the cut reaches past it, so the cuts are made only
// where that is certain, and a document where it is not is read whole, as before.

import type { MdNode } from './types';

/** The size a piece grows to before it is cut, in characters. */
export const PIECE = 4096;

/**
 * Whether the line at `at` is an ATX heading: one to six `#`, then a space, a tab, a line break,
 * or the end. Called only at the start of a line.
 */
function isAtxHeading(text: string, at: number): boolean {
  let n = 0;
  while (n < 7 && text.charCodeAt(at + n) === 35 /* # */) n++;
  if (n === 0 || n > 6) return false;
  const after = text.charCodeAt(at + n);
  return Number.isNaN(after) || after === 32 || after === 9 || after === 10 || after === 13;
}

/** The line that ends with the `\n` at `end`, without that `\n` or one `\r` before it. */
function lineBefore(text: string, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', end - 1) + 1;
  return { from, to: text.charCodeAt(end - 1) === 13 && end - 1 >= from ? end - 1 : end };
}

/**
 * Where `text` may be cut into pieces of about `piece` characters that each read exactly as they
 * do in the whole: the start of each piece after the first, or none when it is short or it may
 * not be cut at all.
 *
 * A cut is made only before a heading line (`#` at the line's start) that follows a blank line or
 * another heading line. Such a line is always a heading of the document itself, and it closes
 * whatever was open before it: a paragraph, a list, a block quote, indented code. Two things are
 * not closed by it, and a document holding either is never cut: a fenced code block (``` or ~~~)
 * and an HTML block (any `<`), which run until their own end, past blank lines and headings. And
 * one thing reaches back across the whole document: a definition (`[label]: …`, `[^note]: …`), so
 * a document with any `]:` is never cut either. These tests over-refuse (a `<` in a sentence is
 * no HTML block), which costs only speed.
 */
export function cutsOf(text: string, piece = PIECE): number[] {
  if (text.length < 2 * piece) return [];
  // A second byte-order mark: micromark skips it without counting it, so later pieces' offsets would be one off.
  if (text.charCodeAt(0) === 0xfeff) return [];
  if (text.includes('```') || text.includes('~~~') || text.includes('<') || text.includes(']:'))
    return [];
  const cuts: number[] = [];
  let from = piece;
  for (;;) {
    let nl = text.indexOf('\n#', from - 1);
    let cut = -1;
    while (nl >= 0) {
      const at = nl + 1;
      if (isAtxHeading(text, at)) {
        const line = lineBefore(text, nl);
        const before = text.slice(line.from, line.to);
        if (before === '' || (!before.includes('\r') && isAtxHeading(text, line.from))) {
          cut = at;
          break;
        }
      }
      nl = text.indexOf('\n#', at);
    }
    if (cut < 0 || cut >= text.length) return cuts;
    cuts.push(cut);
    from = cut + piece;
    if (from >= text.length) return cuts;
  }
}

/** The line endings in `text` from `from` to `to`, counted as the parser counts them. */
function lineEndings(text: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) n++;
    else if (code === 13 && text.charCodeAt(i + 1) !== 10) n++;
  }
  return n;
}

interface Point {
  line: number;
  column: number;
  offset?: number;
}
interface Positioned {
  position?: { start: Point; end: Point };
  children?: Positioned[];
}

const moved = (point: Point, lines: number, offset: number): Point => ({
  line: point.line + lines,
  column: point.column,
  ...(point.offset === undefined ? {} : { offset: point.offset + offset }),
});

/**
 * Every position in `node` and below moved down `lines` lines and on `offset` characters, in
 * place: the parser makes each node's points its own (a test reads a cut tree against the whole,
 * which a shared point, moved twice, would fail), and new ones would double the garbage.
 */
function move(node: Positioned, lines: number, offset: number): void {
  const stack = [node];
  for (let each = stack.pop(); each; each = stack.pop()) {
    const position = each.position;
    if (position) {
      position.start.line += lines;
      position.end.line += lines;
      if (position.start.offset !== undefined) position.start.offset += offset;
      if (position.end.offset !== undefined) position.end.offset += offset;
    }
    if (each.children) for (const child of each.children) stack.push(child);
  }
}

/**
 * `text` read by `read` in the pieces `cuts` gives, as one tree: the same tree, positions and all,
 * as reading it whole. Each piece starts a line, so its columns are already the document's; its
 * lines and offsets move down by what came before it.
 */
export function readInPieces(
  text: string,
  cuts: readonly number[],
  read: (piece: string) => MdNode,
): MdNode {
  if (cuts.length === 0) return read(text);
  const starts = [0, ...cuts];
  const children: MdNode[] = [];
  let lines = 0;
  let root: (MdNode & Positioned) | null = null;
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i] as number;
    const to = i + 1 < starts.length ? (starts[i + 1] as number) : text.length;
    const tree = read(text.slice(from, to)) as MdNode & Positioned;
    for (const child of tree.children ?? []) {
      move(child as Positioned, lines, from);
      children.push(child as MdNode);
    }
    if (i === 0) root = { ...tree };
    // The whole document ends where its last piece does.
    if (i + 1 === starts.length && root?.position && tree.position)
      root.position = { start: root.position.start, end: moved(tree.position.end, lines, from) };
    lines += lineEndings(text, from, to);
  }
  return { ...(root as MdNode), children };
}

/**
 * A character that may mean more than itself somewhere in a line: emphasis, code, links and
 * notes, escapes and references, HTML, headings' closing marks, and every control character
 * (a tab's width, a NUL the parser replaces, a lone CR that ends a line).
 */
const MARKS = new Set([...'*_`[]\\&<>~#'].map((c) => c.charCodeAt(0)));
const isMarkup = (code: number) => code < 32 || code === 0x7f || code === 0xfeff || MARKS.has(code);

/** Whether `text` holds any of them. */
function hasMarkup(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (isMarkup(text.charCodeAt(i))) return true;
  return false;
}

/** Text the parser reads as just itself: no markup, and no space at either end to trim. */
const plain = (text: string) =>
  text !== '' &&
  !hasMarkup(text) &&
  text.charCodeAt(0) !== 32 &&
  text.charCodeAt(text.length - 1) !== 32;

/**
 * A line of a paragraph: plain, and not starting as a block would (a list's `-` or `+`, an
 * ordered list's number, a setext underline's `=` or `-`).
 */
const prose = (line: string) => plain(line) && !/^[-+=0-9]/.test(line);

const at = (line: number, column: number, offset: number) => ({ line, column, offset });

/**
 * A piece made only of the plainest blocks, read without the parser: blank lines, `#` headings,
 * `***` breaks, and paragraphs of plain prose, which is how most of a long draft of parts and
 * chapters looks. The tree is the parser's own, node for node and position for position (a test
 * reads many documents both ways); anything else in the piece, even one mark of emphasis, is
 * null, and the parser reads it. Linear, and many times faster than the parser.
 */
export function readPlain(text: string): MdNode | null {
  const lines = text.split('\n');
  const children: MdNode[] = [];
  let paragraph: {
    from: ReturnType<typeof at>;
    lines: string[];
    to: ReturnType<typeof at>;
  } | null = null;
  const close = () => {
    const open = paragraph;
    if (!open) return;
    const position = () => ({ start: { ...open.from }, end: { ...open.to } });
    children.push({
      type: 'paragraph',
      children: [{ type: 'text', value: open.lines.join('\n'), position: position() }],
      position: position(),
    } as MdNode);
    paragraph = null;
  };
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const n = i + 1;
    const end = at(n, line.length + 1, offset + line.length);
    if (line === '') close();
    else if (line.charCodeAt(0) === 35 /* # */) {
      let depth = 1;
      while (line.charCodeAt(depth) === 35) depth++;
      if (depth > 6) return null;
      const words: MdNode[] = [];
      if (line.length > depth) {
        const value = line.slice(depth + 1);
        if (line.charCodeAt(depth) !== 32 || !plain(value)) return null;
        words.push({
          type: 'text',
          value,
          position: { start: at(n, depth + 2, offset + depth + 1), end: { ...end } },
        } as MdNode);
      }
      close();
      // In the parser's own order of keys: type, depth, children, position.
      children.push({
        type: 'heading',
        depth,
        children: words,
        position: { start: at(n, 1, offset), end },
      } as MdNode);
    } else if (line === '***') {
      close();
      children.push({
        type: 'thematicBreak',
        position: { start: at(n, 1, offset), end },
      } as MdNode);
    } else if (!prose(line)) return null;
    else if (paragraph) {
      paragraph.lines.push(line);
      paragraph.to = end;
    } else paragraph = { from: at(n, 1, offset), lines: [line], to: end };
    offset += line.length + 1;
  }
  close();
  const last = lines[lines.length - 1] as string;
  return {
    type: 'root',
    children,
    position: { start: at(1, 1, 0), end: at(lines.length, last.length + 1, text.length) },
  } as MdNode;
}
