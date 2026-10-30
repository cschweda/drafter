import type { Face } from './fonts';
import { STYLE } from './style';
import type { DocNode } from './tree';

/** A stretch of text in one style. */
export interface Run {
  text: string;
  face: Face;
  size: number;
  color: 'text' | 'muted' | 'link';
  underline: boolean;
  /** The address the text links to (a safe one, `safeLink`), or null. */
  link: string | null;
}

/** One block of a document, before it is broken into lines. */
export interface DocBlock {
  kind: 'heading' | 'text' | 'code' | 'raw' | 'rule';
  /** A heading's level, 1 to 6; null for every other block. */
  level: number | null;
  /** Points from the left margin (quotes and lists). */
  indent: number;
  /** The x of the centre of each enclosing quote's bar, points from the left margin, outermost first. */
  quoteBars: number[];
  /** Which quote each of `quoteBars` belongs to, numbered in reading order, so two quotes side by side keep two bars. */
  quotes: number[];
  /** A list item's first block: "•" or "3.", right-aligned to `indent − 6`. */
  marker: Run | null;
  /** A hard break is a Run with text '\n'. */
  runs: Run[];
  /** The block's line height: its text size, and the distance from one line to the next. */
  size: number;
  leading: number;
  /** Dropped at the top of a page. */
  spaceBefore: number;
  /** Headings: kept on a page with what follows. */
  keepWithNext: boolean;
  /** Code blocks: drawn on a panel. */
  panel: boolean;
}

/** Bullets by list depth, the last for every level below it (Call 6: Inter Tight has all three). */
const BULLETS = ['•', '◦', '▪'] as const;
/** How far a marker's right edge stands from the item's text. */
export const MARKER_GAP = 6;
const PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** The address a link may carry, or null (Call 10): http, https, and mailto, as `URL.href`. */
export function safeLink(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // relative paths, `#heading`s, and anything URL can't read
  }
  return PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
}

/** The inline style in force, from the block and the marks around the text. */
interface InlineStyle {
  bold: boolean;
  italic: boolean;
  size: number;
  color: Run['color'];
  /** undefined outside a link; null inside one with no safe address. */
  link: string | null | undefined;
}

/** Where a block sits: its indent, its quotes' bars, and how many lists hold it. */
interface Place {
  indent: number;
  quoteBars: number[];
  quotes: number[];
  lists: number;
}

/**
 * A container being walked, on the walk's own stack rather than the call stack, so no depth of
 * nesting can overflow it. `walking` is the block count before its current child, until that child's
 * blocks are all in.
 */
type Frame = { next: number; walking: number | null } & (
  | { kind: 'blocks'; nodes: DocNode[]; place: Place; space: number }
  | {
      kind: 'list';
      nodes: DocNode[];
      ordered: boolean;
      bullet: string;
      number: number;
      inner: Place;
      between: number;
      space: number;
    }
  | { kind: 'item'; nodes: DocNode[]; inner: Place; between: number; space: number; first: boolean }
);

const textFace = (bold: boolean, italic: boolean): Face =>
  bold ? (italic ? 'textBoldItalic' : 'textBold') : italic ? 'textItalic' : 'text';

/** A tab or a line ending in running text is a space. */
const flat = (text: string) => text.replace(/\r\n|[\r\n\t]/g, ' ');

/** Adds `run` to `runs`, joined to the last one when they look the same. */
function push(runs: Run[], run: Run): void {
  if (run.text === '') return;
  const last = runs.at(-1);
  if (
    last &&
    last.text !== '\n' &&
    run.text !== '\n' &&
    last.face === run.face &&
    last.size === run.size &&
    last.color === run.color &&
    last.underline === run.underline &&
    last.link === run.link
  ) {
    last.text += run.text;
  } else {
    runs.push({ ...run });
  }
}

/** The lines of code or raw HTML as runs, every space kept and each tab four spaces. */
function codeRuns(value: string, size: number): Run[] {
  const runs: Run[] = [];
  const lines = value.replace(/\t/g, ' '.repeat(STYLE.tabSpaces)).split(/\r\n|\r|\n/);
  lines.forEach((line, i) => {
    if (i > 0)
      runs.push({ text: '\n', face: 'code', size, color: 'text', underline: false, link: null });
    if (line !== '')
      runs.push({ text: line, face: 'code', size, color: 'text', underline: false, link: null });
  });
  return runs;
}

/** Every definition's address, by identifier; the first of a label wins, as CommonMark has it. */
function definitions(tree: DocNode): Map<string, string> {
  const found = new Map<string, string>();
  const stack = [tree];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (
      node.type === 'definition' &&
      node.identifier !== undefined &&
      !found.has(node.identifier)
    ) {
      found.set(node.identifier, node.url ?? '');
    }
    // Reversed, so the stack gives them back in document order.
    for (const child of [...(node.children ?? [])].reverse()) stack.push(child);
  }
  return found;
}

/**
 * The blocks of a document, in reading order. Link reference definitions are resolved and print
 * nothing. `textWidth`, the paper's, bounds the indent: it stops growing once the text would be
 * narrower than a quarter of it (Call 31). The walk keeps its own stack, so any depth of nesting is
 * read.
 */
export function documentBlocks(tree: DocNode, textWidth: number): DocBlock[] {
  const addresses = definitions(tree);
  const maxIndent = textWidth * 0.75;
  const blocks: DocBlock[] = [];
  /** A list item's marker, waiting for the item's first block. */
  let marker: Run | null = null;
  /** The quotes with a bar so far. */
  let quoteCount = 0;

  const deeper = (indent: number, step: number) =>
    indent + step <= maxIndent ? indent + step : indent;

  /** The space before a block, from what comes before it and the `space` its place calls for. */
  const spaceFor = (kind: DocBlock['kind'], level: number | null, space: number) => {
    const previous = blocks.at(-1)?.kind;
    if (kind === 'heading') return STYLE.headings[(level ?? 1) - 1]?.before ?? STYLE.between;
    if (kind === 'rule' || previous === 'rule') return STYLE.ruleClear;
    if (previous === 'heading') return STYLE.afterHeading;
    return space;
  };

  const emit = (
    place: Place,
    space: number,
    block: Pick<DocBlock, 'kind' | 'runs' | 'size' | 'leading'> &
      Partial<Pick<DocBlock, 'level' | 'panel'>>,
  ) => {
    const level = block.level ?? null;
    blocks.push({
      kind: block.kind,
      level,
      indent: place.indent,
      quoteBars: [...place.quoteBars],
      quotes: [...place.quotes],
      marker,
      runs: block.runs,
      size: block.size,
      leading: block.leading,
      spaceBefore: spaceFor(block.kind, level, space),
      keepWithNext: block.kind === 'heading',
      panel: block.panel ?? false,
    });
    marker = null;
  };

  /** Prints a marker still waiting, on a line of its own, before a block that can't carry it. */
  const flushMarker = (place: Place, space: number): boolean => {
    if (!marker) return false;
    emit(place, space, {
      kind: 'text',
      runs: [],
      size: STYLE.textSize,
      leading: STYLE.textLeading,
    });
    return true;
  };

  /** The runs of inline nodes, walked on a stack of their own: each mark gives its children its style. */
  const textRuns = (nodes: DocNode[] | undefined, outer: InlineStyle): Run[] => {
    const runs: Run[] = [];
    const stack: { node: DocNode; style: InlineStyle }[] = [];
    const within = (children: DocNode[] | undefined, style: InlineStyle) => {
      // Reversed, so the stack gives them back in reading order.
      for (const node of [...(children ?? [])].reverse()) stack.push({ node, style });
    };
    within(nodes, outer);
    for (let top = stack.pop(); top; top = stack.pop()) {
      const { node, style } = top;
      const linked = typeof style.link === 'string';
      const run = (text: string, face: Face, size: number, color: Run['color']) =>
        push(runs, {
          text,
          face,
          size,
          color: linked ? 'link' : color,
          underline: linked,
          link: linked ? (style.link as string) : null,
        });
      switch (node.type) {
        case 'text':
        case 'html': // inline HTML is the writer's text, as typed
          run(flat(node.value ?? ''), textFace(style.bold, style.italic), style.size, style.color);
          break;
        case 'inlineCode':
          run(
            flat(node.value ?? ''),
            'code',
            (style.size * STYLE.inlineCodeSize) / STYLE.textSize,
            style.color,
          );
          break;
        case 'break':
          run('\n', textFace(style.bold, style.italic), style.size, style.color);
          break;
        case 'emphasis':
          within(node.children, { ...style, italic: true });
          break;
        case 'strong':
          within(node.children, { ...style, bold: true });
          break;
        case 'image':
        case 'imageReference':
          run(
            `[Image: ${node.alt || 'no description'}]`,
            textFace(style.bold, true),
            style.size,
            'muted',
          );
          break;
        case 'link':
          within(node.children, {
            ...style,
            link: style.link === undefined ? safeLink(node.url) : style.link,
          });
          break;
        case 'linkReference': {
          const url = node.identifier === undefined ? undefined : addresses.get(node.identifier);
          // The parser makes a reference only when its definition exists; any other prints its text, plain.
          const link =
            style.link === undefined ? (url === undefined ? undefined : safeLink(url)) : style.link;
          within(node.children, { ...style, link });
          break;
        }
        default:
          if (node.children) within(node.children, style);
          else if (node.value)
            run(flat(node.value), textFace(style.bold, style.italic), style.size, style.color);
      }
    }
    return runs;
  };

  const plain: InlineStyle = {
    bold: false,
    italic: false,
    size: STYLE.textSize,
    color: 'text',
    link: undefined,
  };

  const stack: Frame[] = [];

  /** Adds a leaf node's blocks, or puts a container on the stack to walk its children. */
  const open = (node: DocNode, place: Place, space: number): void => {
    switch (node.type) {
      case 'heading': {
        const level = Math.min(6, Math.max(1, node.depth ?? 1));
        const heading = STYLE.headings[level - 1] as (typeof STYLE.headings)[number];
        const style: InlineStyle = {
          ...plain,
          bold: true,
          size: heading.size,
          color: heading.muted ? 'muted' : 'text',
        };
        emit(place, space, {
          kind: 'heading',
          level,
          runs: textRuns(node.children, style),
          size: heading.size,
          leading: heading.leading,
        });
        break;
      }
      case 'paragraph':
        emit(place, space, {
          kind: 'text',
          runs: textRuns(node.children, plain),
          size: STYLE.textSize,
          leading: STYLE.textLeading,
        });
        break;
      case 'code':
      case 'html': // a raw HTML block: the writer's text as typed, code-faced, no panel
        emit(place, space, {
          kind: node.type === 'code' ? 'code' : 'raw',
          runs: codeRuns(node.value ?? '', STYLE.codeSize),
          size: STYLE.codeSize,
          leading: STYLE.codeLeading,
          panel: node.type === 'code',
        });
        break;
      case 'thematicBreak':
        if (flushMarker(place, space)) space = STYLE.between;
        emit(place, space, { kind: 'rule', runs: [], size: 0, leading: STYLE.ruleThickness });
        break;
      case 'blockquote': {
        const indent = deeper(place.indent, STYLE.quoteIndent);
        // A quote too deep to indent draws no bar of its own, which would cross its text.
        const barred = indent !== place.indent;
        const quoteBars = barred
          ? [...place.quoteBars, place.indent + STYLE.quoteBar / 2]
          : place.quoteBars;
        const quotes = barred ? [...place.quotes, quoteCount++] : place.quotes;
        // A marker goes outside the quote's bar, on a line of its own.
        if (flushMarker(place, space)) space = STYLE.between;
        stack.push({
          kind: 'blocks',
          nodes: node.children ?? [],
          next: 0,
          walking: null,
          place: { ...place, indent, quoteBars, quotes },
          space,
        });
        break;
      }
      case 'list': {
        const between = node.spread ? STYLE.looseItem : 0;
        // A list that is its item's first block: the item's marker gets a line of its own.
        if (flushMarker(place, space)) space = between;
        stack.push({
          kind: 'list',
          nodes: node.children ?? [],
          next: 0,
          walking: null,
          ordered: node.ordered === true,
          bullet: BULLETS[Math.min(place.lists, BULLETS.length - 1)] as string,
          number: typeof node.start === 'number' ? node.start : 1,
          inner: {
            ...place,
            indent: deeper(place.indent, STYLE.listIndent),
            lists: place.lists + 1,
          },
          between,
          space,
        });
        break;
      }
      case 'definition':
        break;
      default:
        if (node.children) {
          stack.push({
            kind: 'blocks',
            nodes: node.children,
            next: 0,
            walking: null,
            place,
            space,
          });
        } else if (node.value) {
          emit(place, space, {
            kind: 'text',
            runs: textRuns([{ type: 'text', value: node.value }], plain),
            size: STYLE.textSize,
            leading: STYLE.textLeading,
          });
        }
    }
  };

  stack.push({
    kind: 'blocks',
    nodes: tree.children ?? [],
    next: 0,
    walking: null,
    place: { indent: 0, quoteBars: [], quotes: [], lists: 0 },
    space: STYLE.between,
  });
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    // The child walked last is done: whether it printed anything sets the space after it.
    if (frame.walking !== null) {
      const printed = blocks.length > frame.walking;
      frame.walking = null;
      if (frame.kind === 'blocks') {
        // A run of sibling blocks: the first has `space` before it, the rest the space between blocks.
        if (printed) frame.space = STYLE.between;
      } else if (frame.kind === 'item') {
        if (printed) frame.first = false;
      } else {
        // An empty item still prints its marker.
        flushMarker(frame.inner, frame.space);
        frame.space = frame.between;
      }
    }
    const node = frame.nodes[frame.next];
    if (!node) {
      stack.pop();
      continue;
    }
    frame.next++;
    frame.walking = blocks.length;
    if (frame.kind === 'blocks') open(node, frame.place, frame.space);
    else if (frame.kind === 'item') {
      // A list later in the item sits as close as this list's items do.
      const space = frame.first
        ? frame.space
        : node.type === 'list'
          ? frame.between
          : STYLE.between;
      open(node, frame.inner, space);
    } else {
      marker = {
        text: frame.ordered ? `${frame.number}.` : frame.bullet,
        face: 'text',
        size: STYLE.textSize,
        color: 'text',
        underline: false,
        link: null,
      };
      frame.number++;
      stack.push({
        kind: 'item',
        nodes: node.children ?? [],
        next: 0,
        walking: null,
        inner: frame.inner,
        between: frame.between,
        space: frame.space,
        first: true,
      });
    }
  }
  return blocks;
}
