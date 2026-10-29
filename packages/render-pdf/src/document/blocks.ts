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

/** US Letter's text width (612 pt less two margins), the default paper's. */
const LETTER_TEXT_WIDTH = 612 - 2 * STYLE.margin;
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
  lists: number;
}

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
  const visit = (node: DocNode) => {
    if (
      node.type === 'definition' &&
      node.identifier !== undefined &&
      !found.has(node.identifier)
    ) {
      found.set(node.identifier, node.url ?? '');
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return found;
}

/**
 * The blocks of a document, in reading order. Link reference definitions are resolved and print
 * nothing. `textWidth` (US Letter's by default) bounds the indent: it stops growing once the text
 * would be narrower than a quarter of it (Call 31).
 */
export function documentBlocks(tree: DocNode, textWidth: number = LETTER_TEXT_WIDTH): DocBlock[] {
  const addresses = definitions(tree);
  const maxIndent = textWidth * 0.75;
  const blocks: DocBlock[] = [];
  /** A list item's marker, waiting for the item's first block. */
  let marker: Run | null = null;

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

  const inlines = (nodes: DocNode[] | undefined, style: InlineStyle, runs: Run[]) => {
    for (const node of nodes ?? []) inline(node, style, runs);
  };

  const inline = (node: DocNode, style: InlineStyle, runs: Run[]): void => {
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
        return;
      case 'inlineCode':
        run(
          flat(node.value ?? ''),
          'code',
          (style.size * STYLE.inlineCodeSize) / STYLE.textSize,
          style.color,
        );
        return;
      case 'break':
        run('\n', textFace(style.bold, style.italic), style.size, style.color);
        return;
      case 'emphasis':
        inlines(node.children, { ...style, italic: true }, runs);
        return;
      case 'strong':
        inlines(node.children, { ...style, bold: true }, runs);
        return;
      case 'image':
      case 'imageReference':
        run(
          `[Image: ${node.alt || 'no description'}]`,
          textFace(style.bold, true),
          style.size,
          'muted',
        );
        return;
      case 'link':
        inlines(
          node.children,
          { ...style, link: style.link === undefined ? safeLink(node.url) : style.link },
          runs,
        );
        return;
      case 'linkReference': {
        const url = node.identifier === undefined ? undefined : addresses.get(node.identifier);
        // The parser makes a reference only when its definition exists; any other prints its text, plain.
        const link =
          style.link === undefined ? (url === undefined ? undefined : safeLink(url)) : style.link;
        inlines(node.children, { ...style, link }, runs);
        return;
      }
      default:
        if (node.children) inlines(node.children, style, runs);
        else if (node.value)
          run(flat(node.value), textFace(style.bold, style.italic), style.size, style.color);
    }
  };

  const textRuns = (nodes: DocNode[] | undefined, style: InlineStyle) => {
    const runs: Run[] = [];
    inlines(nodes, style, runs);
    return runs;
  };

  const plain: InlineStyle = {
    bold: false,
    italic: false,
    size: STYLE.textSize,
    color: 'text',
    link: undefined,
  };

  /** Walks a run of sibling blocks: the first has `space` before it, the rest the space between blocks. */
  const children = (nodes: DocNode[] | undefined, place: Place, space: number) => {
    for (const node of nodes ?? []) {
      if (block(node, place, space)) space = STYLE.between;
    }
  };

  /** Adds a node's blocks; false when it prints nothing. */
  const block = (node: DocNode, place: Place, space: number): boolean => {
    const before = blocks.length;
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
        const quoteBars =
          indent === place.indent
            ? place.quoteBars
            : [...place.quoteBars, place.indent + STYLE.quoteBar / 2];
        // A marker goes outside the quote's bar, on a line of its own.
        if (flushMarker(place, space)) space = STYLE.between;
        children(node.children, { ...place, indent, quoteBars }, space);
        break;
      }
      case 'list':
        list(node, place, space);
        break;
      case 'definition':
        break;
      default:
        if (node.children) children(node.children, place, space);
        else if (node.value) {
          emit(place, space, {
            kind: 'text',
            runs: textRuns([{ type: 'text', value: node.value }], plain),
            size: STYLE.textSize,
            leading: STYLE.textLeading,
          });
        }
    }
    return blocks.length > before;
  };

  const list = (node: DocNode, place: Place, space: number) => {
    const between = node.spread ? STYLE.looseItem : 0;
    const bullet = BULLETS[Math.min(place.lists, BULLETS.length - 1)] as string;
    let number = typeof node.start === 'number' ? node.start : 1;
    const inner: Place = {
      ...place,
      indent: deeper(place.indent, STYLE.listIndent),
      lists: place.lists + 1,
    };
    // A list that is its item's first block: the item's marker gets a line of its own.
    if (flushMarker(place, space)) space = between;
    for (const item of node.children ?? []) {
      marker = {
        text: node.ordered ? `${number}.` : bullet,
        face: 'text',
        size: STYLE.textSize,
        color: 'text',
        underline: false,
        link: null,
      };
      number++;
      let first = true;
      for (const child of item.children ?? []) {
        // A list later in the item sits as close as this list's items do.
        const childSpace = first ? space : child.type === 'list' ? between : STYLE.between;
        if (block(child, inner, childSpace)) first = false;
      }
      // An empty item still prints its marker.
      flushMarker(inner, space);
      space = between;
    }
  };

  children(tree.children, { indent: 0, quoteBars: [], lists: 0 }, STYLE.between);
  return blocks;
}
