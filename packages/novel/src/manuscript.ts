import { footnotes, type MdNode } from '@drafter/markdown';
import type { ManuscriptDetails, ManuscriptFont } from './facts';
import { type NovelNode, novelStructure } from './structure';

// One description of a novel's standard manuscript, with no format in it: the PDF and the Word file
// both render these blocks, so they cannot disagree about what is in the book.

/** A stretch of text with one set of marks. */
export interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
  code?: boolean;
}

export type ManuscriptBlock =
  | { kind: 'part'; title: string }
  | { kind: 'chapter'; title: string }
  | { kind: 'break' }
  | {
      kind: 'paragraph';
      style: 'body' | 'quote' | 'list' | 'code' | 'heading';
      runs: Run[];
      marker?: string;
    }
  | { kind: 'end' };

/** The title page's and running header's details, every one filled in. */
export interface ResolvedDetails {
  title: string;
  byline: string;
  legalName: string;
  contact: string[];
  surname: string;
  shortTitle: string;
  font: ManuscriptFont;
}

export interface Manuscript extends ResolvedDetails {
  words: number;
  wordsLabel: string;
  blocks: ManuscriptBlock[];
  /** The footnotes, in number order: note n is `notes[n - 1]`. */
  notes: Run[][];
}

// A heading that is only a chapter's number ("Chapter 2", "IV", "Seven") names nothing.
const ONLY_A_NUMBER =
  /^(?:chapter\s+)?(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/i;

function firstTitle(source: string): string | undefined {
  const find = (nodes: NovelNode[]): string | undefined => {
    for (const node of nodes) {
      if (node.kind === 'part') {
        const inner = find(node.children);
        if (inner !== undefined) return inner;
      } else if (node.kind === 'chapter') {
        const title = node.title.trim();
        if (title !== '' && !ONLY_A_NUMBER.test(title)) return title;
      }
    }
    return undefined;
  };
  return find(novelStructure(source).nodes);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w !== '');
}

/** The details the title page and header print: what the writer kept, else a default from the book. */
export function resolveDetails(
  source: string,
  fileTitle: string,
  kept: ManuscriptDetails,
): ResolvedDetails {
  const title = kept.title ?? firstTitle(source) ?? fileTitle;
  const byline = kept.byline ?? '';
  const legalName = kept.legalName ?? byline;
  const surname = kept.surname ?? words(byline).pop() ?? words(legalName).pop() ?? '';
  const shortTitle = kept.shortTitle ?? words(title).slice(0, 3).join(' ').toUpperCase();
  return {
    title,
    byline,
    legalName,
    contact: kept.contact ?? [],
    surname,
    shortTitle,
    font: kept.font ?? 'times',
  };
}

/** "about 87,000 words": rounded to the hundred under a thousand, else to the thousand; half rounds up. */
export function wordsLabel(count: number): string {
  if (count <= 0) return '0 words';
  const step = count < 1000 ? 100 : 1000;
  const rounded = Math.max(step, Math.floor(count / step + 0.5) * step);
  return `about ${rounded.toLocaleString('en-US')} words`;
}

type Style = 'body' | 'quote' | 'list' | 'code' | 'heading';

function push(runs: Run[], run: Run): void {
  if (run.text === '') return;
  const last = runs[runs.length - 1];
  if (
    last &&
    !!last.italic === !!run.italic &&
    !!last.bold === !!run.bold &&
    !!last.code === !!run.code
  ) {
    last.text += run.text;
  } else {
    runs.push(run);
  }
}

/** Inline nodes as runs. Marks nest, so a bold word inside italics has both flags. */
function inline(
  nodes: MdNode[],
  marks: Omit<Run, 'text'>,
  numbers: Map<string, number>,
  out: Run[],
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        push(out, { text: node.value ?? '', ...marks });
        break;
      case 'emphasis':
        inline(node.children ?? [], { ...marks, italic: true }, numbers, out);
        break;
      case 'strong':
        inline(node.children ?? [], { ...marks, bold: true }, numbers, out);
        break;
      case 'inlineCode':
        push(out, { text: node.value ?? '', ...marks, code: true });
        break;
      case 'break':
        push(out, { text: ' ', ...marks });
        break;
      case 'image':
        push(out, { text: node.alt ? `[Image: ${node.alt}]` : '[Image]', ...marks });
        break;
      case 'footnoteReference': {
        const n = numbers.get(node.identifier ?? '');
        if (n !== undefined) push(out, { text: `[${n}]`, ...marks });
        break;
      }
      case 'html':
        break;
      default:
        // A link prints its text; anything else with children prints what is in it.
        if (node.children) inline(node.children, marks, numbers, out);
        else if (node.value) push(out, { text: node.value, ...marks });
    }
  }
}

function runsOf(nodes: MdNode[], numbers: Map<string, number>): Run[] {
  const out: Run[] = [];
  inline(nodes, {}, numbers, out);
  return out;
}

/** The text of a heading node, without its marks. */
function plain(runs: Run[]): string {
  return runs.map((r) => r.text).join('');
}

function startOf(node: MdNode): number | undefined {
  return node.position?.start?.offset ?? node.from;
}

/**
 * The book, block by block. A top-level heading is a part, a chapter, or a section by the same
 * reading `novelStructure` makes, so the outline and the manuscript never disagree.
 */
export function manuscriptOf(source: string, tree: MdNode, details: ResolvedDetails): Manuscript {
  const structure = novelStructure(source);
  const byOffset = new Map<number, NovelNode>();
  const index = (nodes: NovelNode[]): void => {
    for (const node of nodes) {
      byOffset.set(node.heading.from, node);
      index(node.children);
    }
  };
  index(structure.nodes);

  const { numbers, notes: definitions } = footnotes(tree);
  const blocks: ManuscriptBlock[] = [];

  // Whether the open chapter has had a section already: only a later one is set off by a break.
  let sectioned = false;

  const addBreak = (): void => {
    const last = blocks[blocks.length - 1];
    if (last && last.kind !== 'part' && last.kind !== 'chapter' && last.kind !== 'break') {
      blocks.push({ kind: 'break' });
    }
  };

  const paragraph = (style: Style, runs: Run[], marker?: string): void => {
    if (runs.length === 0) return;
    blocks.push(
      marker === undefined
        ? { kind: 'paragraph', style, runs }
        : { kind: 'paragraph', style, runs, marker },
    );
  };

  const container = (nodes: MdNode[], style: Style, marker?: string): void => {
    let first = true;
    for (const node of nodes) {
      const before = blocks.length;
      block(node, style, first ? marker : undefined);
      if (blocks.length > before) first = false;
    }
  };

  const block = (node: MdNode, style: Style, marker?: string): void => {
    switch (node.type) {
      case 'paragraph':
        paragraph(style, runsOf(node.children ?? [], numbers), marker);
        break;
      case 'blockquote':
        container(node.children ?? [], 'quote');
        break;
      case 'list': {
        let n = node.start ?? 1;
        for (const item of node.children ?? []) {
          container(item.children ?? [], 'list', node.ordered ? `${n}.` : '•');
          n++;
        }
        break;
      }
      case 'code':
        for (const line of (node.value ?? '').split('\n')) {
          blocks.push({ kind: 'paragraph', style: 'code', runs: [{ text: line, code: true }] });
        }
        break;
      case 'thematicBreak':
        sectioned = true;
        addBreak();
        break;
      case 'heading': {
        const depth = node.depth ?? 1;
        const found = depth <= 2 ? byOffset.get(startOf(node) ?? -1) : undefined;
        const title = plain(runsOf(node.children ?? [], numbers)).trim();
        if (depth > 2) {
          paragraph('heading', runsOf(node.children ?? [], numbers));
        } else if (found?.kind === 'part') {
          sectioned = false;
          blocks.push({ kind: 'part', title });
        } else if (found?.kind === 'chapter' || (!found && depth === 1)) {
          sectioned = false;
          blocks.push({ kind: 'chapter', title });
        } else {
          if (sectioned) addBreak();
          sectioned = true;
        }
        break;
      }
      default:
        // HTML, footnote definitions, and anything else print nothing here.
        break;
    }
  };

  for (const node of tree.children ?? []) block(node, 'body');
  blocks.push({ kind: 'end' });

  return {
    ...details,
    words: structure.words,
    wordsLabel: wordsLabel(structure.words),
    blocks,
    notes: definitions.map((def) => {
      const out: Run[] = [];
      for (const child of def.children ?? []) {
        if (out.length > 0) push(out, { text: ' ' });
        inline(child.children ?? [], {}, numbers, out);
      }
      return out;
    }),
  };
}
