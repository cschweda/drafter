import { footnotes, type MdNode } from '@drafter/markdown';
import type { ManuscriptDetails, ManuscriptFont } from './facts';
import { type NovelNode, novelStructure } from './structure';

// One description of a novel's standard manuscript, with no format in it: the PDF and the Word file
// both render these blocks, so they cannot disagree about what is in the book.

/**
 * A stretch of text with one set of marks. In a `body`, `quote`, `list`, or `heading` paragraph the
 * text never holds a line break: a soft or hard break in the source is one space. (A `code`
 * paragraph is one line of a code block.)
 */
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
      /**
       * A paragraph, a list item, a quoted paragraph, one line of a code block, or one row of a
       * table (a `body` paragraph whose cells are joined by ' | ').
       */
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

/** A soft line break and the spaces around it, as one space. */
function flat(text: string): string {
  return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
}

/** Inline nodes as runs. Marks nest, so a bold word inside italics has both flags. */
function inline(
  nodes: MdNode[],
  marks: Omit<Run, 'text'>,
  numbers: Map<string, number>,
  out: Run[],
  keep = false,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        push(out, { text: keep ? (node.value ?? '') : flat(node.value ?? ''), ...marks });
        break;
      case 'emphasis':
        inline(node.children ?? [], { ...marks, italic: true }, numbers, out, keep);
        break;
      case 'strong':
        inline(node.children ?? [], { ...marks, bold: true }, numbers, out, keep);
        break;
      case 'inlineCode':
        push(out, { text: flat(node.value ?? ''), ...marks, code: true });
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
        if (node.children) inline(node.children, marks, numbers, out, keep);
        else if (node.value) push(out, { text: flat(node.value), ...marks });
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

const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** A row of a table as one run list: outer pipes dropped, cells joined by ' | '. */
function rowRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) push(out, { ...run, text: run.text.replace(/\s*\|\s*/g, ' | ') });
  if (out.length > 0 && out[0].text.startsWith(' | ')) out[0].text = out[0].text.slice(3);
  const last = out[out.length - 1];
  if (last) last.text = last.text.replace(/ \| $/, '').replace(/\s+$/, '');
  return out.filter((r) => r.text !== '');
}

/** The runs split at their line breaks, one run list per line. */
function linesOf(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const run of runs) {
    run.text.split(/\r?\n/).forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  return lines;
}

/** The rows of a pipe table written as a paragraph (the parser has no table syntax), else null. */
function tableRows(raw: Run[]): Run[][] | null {
  const lines = linesOf(raw);
  if (lines.length < 2) return null;
  const texts = lines.map((l) => l.map((r) => r.text).join(''));
  if (!texts.every((t) => t.includes('|'))) return null;
  if (!DELIMITER_ROW.test(texts[1]) || !texts[1].includes('-')) return null;
  return lines.filter((_, i) => i !== 1).map(rowRuns);
}

/**
 * The book, block by block. A top-level heading is a part, a chapter, or a section by the same
 * reading `novelStructure` makes, so the outline and the manuscript never disagree.
 */
export function manuscriptOf(source: string, tree: MdNode, details: ResolvedDetails): Manuscript {
  const structure = novelStructure(source);
  // The structure keys its nodes by the start of the heading's line in the source; the parser's
  // offsets skip indentation and a leading byte-order mark, so a heading is found by its line.
  const bom = source.charCodeAt(0) === 0xfeff ? 1 : 0;
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

  // A break sets off a section from the text before it; none goes straight after a chapter, a part,
  // or another break, so a chapter's first section, right under its heading, has none.
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
      case 'paragraph': {
        const rows = tableRows(raw(node));
        if (rows) {
          for (const row of rows) paragraph(style, row);
        } else {
          paragraph(style, runsOf(node.children ?? [], numbers), marker);
        }
        break;
      }
      case 'table':
        for (const row of node.children ?? []) {
          const cells = (row.children ?? []).map((cell) => runsOf(cell.children ?? [], numbers));
          const runs: Run[] = [];
          cells.forEach((cell, i) => {
            if (i > 0) push(runs, { text: ' | ' });
            for (const run of cell) push(runs, run);
          });
          paragraph(style, runs);
        }
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
      case 'heading':
        // Only a top-level heading is structure (`structural` below); inside a quote or a list it is
        // a heading-styled paragraph. A thematic break there prints nothing.
        paragraph('heading', runsOf(node.children ?? [], numbers));
        break;
      default:
        // HTML, footnote definitions, and anything else print nothing here.
        break;
    }
  };

  const raw = (node: MdNode): Run[] => {
    const out: Run[] = [];
    inline(node.children ?? [], {}, numbers, out, true);
    return out;
  };

  // A top-level heading or thematic break is structure only where `novelStructure` says so.
  const structural = (node: MdNode): void => {
    if (node.type === 'thematicBreak') {
      addBreak();
      return;
    }
    const at = startOf(node);
    const lineStart = at === undefined ? -1 : source.lastIndexOf('\n', at + bom - 1) + 1;
    const found = (node.depth ?? 1) <= 2 ? byOffset.get(lineStart) : undefined;
    const title = plain(runsOf(node.children ?? [], numbers)).trim();
    if (found?.kind === 'part') {
      blocks.push({ kind: 'part', title });
    } else if (found?.kind === 'chapter') {
      blocks.push({ kind: 'chapter', title });
    } else if (found) {
      addBreak();
    } else {
      paragraph('heading', runsOf(node.children ?? [], numbers));
    }
  };

  for (const node of tree.children ?? []) {
    if (node.type === 'heading' || node.type === 'thematicBreak') structural(node);
    else block(node, 'body');
  }
  blocks.push({ kind: 'end' });
  // A break sits between two runs of text: one before a chapter, a part, the end, or another break
  // (a `***` closing a chapter) is dropped.
  const kept = blocks.filter((b, i) => b.kind !== 'break' || blocks[i + 1]?.kind === 'paragraph');

  return {
    ...details,
    words: structure.words,
    wordsLabel: wordsLabel(structure.words),
    blocks: kept,
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
