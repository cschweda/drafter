import type { MdNode } from '@drafter/markdown';
// The parser-free entries: the file is built from a tree the caller parsed, so importing this
// package (as `drafter build --html` will, for scripts) loads no Markdown parser.
import { footnotes } from '@drafter/markdown/notes';
import { countWords } from '@drafter/markdown/words';
import { el, escapeHtml } from './escape';
import { headerHtml, htmlShell } from './shell';

/** What a Markdown document's file is made from. */
export interface DocumentHtmlInput {
  /** The document as `parseMarkdown` reads it: the tree the Preview draws. */
  tree: MdNode;
  /** The file's title, as plain text: the document's first heading, else the file's name. */
  title: string;
  lang: string;
  /** For `<meta name="generator">`, e.g. "Drafter 0.22.0". */
  generator: string;
}

/** Reading speed for the header's "N min read" (design §4). */
export const WORDS_PER_MINUTE = 230;

/**
 * The deepest tree the file is built from. The parser refuses containers nested past 48, but nests
 * emphasis as deep as the text asks (`*a *a *a … a* a* a*`), and the drawing goes down the tree a
 * call per level; no real document comes near this.
 */
export const MAX_TREE_DEPTH = 1000;

/** The schemes a writer's link may have to be a link: everything else is its text. */
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * A writer's link's address as the file writes it, or undefined when it is shown as text: an
 * `http:`, `https:`, or `mailto:` URL as `new URL` reads it (and normalizes it, so nothing in it
 * is markup), never a relative path or a `#heading` (the file's ids are its own).
 */
function linkHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  return LINK_SCHEMES.has(parsed.protocol) ? parsed.href : undefined;
}

/** How many levels deep `tree` goes, counted without recursion; stops past `limit`. */
function treeDepth(tree: MdNode, limit: number): number {
  let deepest = 0;
  const stack: [MdNode, number][] = [[tree, 1]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [node, depth] = top;
    if (depth > deepest) {
      deepest = depth;
      if (deepest > limit) return deepest;
    }
    for (const child of node.children ?? []) stack.push([child, depth + 1]);
  }
  return deepest;
}

/** `n` with its thousands grouped by commas, as the header says it: 1,240. */
function grouped(n: number): string {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** The header's kind line: "Document · 1,240 words · 6 min read". */
function kindLine(words: number): string {
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return `Document · ${grouped(words)} ${words === 1 ? 'word' : 'words'} · ${minutes} min read`;
}

/** A heading's words as read: its text and code, an image's description, no footnote marks. */
function plainText(node: MdNode): string {
  if (node.type === 'footnoteReference') return '';
  if (node.type === 'image' || node.type === 'imageReference') {
    return `[Image: ${node.alt || 'no description'}]`;
  }
  if (node.children) return node.children.map(plainText).join('');
  return node.value ?? '';
}

/** One open heading on the outline: the level the writer gave it and the level it is drawn at. */
interface Open {
  depth: number;
  level: number;
}

/**
 * Heading levels as the writer wrote them, never skipping one: a heading is drawn at its own
 * level, or one under the nearest open heading shallower than it if that is less (`### A` first,
 * under the header's h1, is an h2). `parent` is the level a heading with none open sits under,
 * and `lowest` the highest level it may take.
 */
class Outline {
  readonly #open: Open[] = [];
  constructor(
    private readonly parent: number,
    private readonly lowest: number,
  ) {}

  level(written: number): number {
    const depth = Math.min(6, Math.max(1, written));
    while ((this.#open.at(-1)?.depth ?? 0) >= depth) this.#open.pop();
    const above = this.#open.at(-1)?.level ?? this.parent;
    const level = Math.min(6, Math.max(this.lowest, Math.min(depth, above + 1)));
    this.#open.push({ depth, level });
    return level;
  }
}

/** A link in the row of section links. */
interface Section {
  id: string;
  text: string;
}

/** What drawing the document carries along. */
interface Draw {
  numbers: Map<string, number>;
  /** Link reference definitions' addresses by identifier, the first of each. */
  addresses: Map<string, string>;
  /** The notes whose first reference is drawn already (it carries `fnref-n`). */
  referenced: Set<number>;
  outline: Outline;
  /** Whether headings get ids: the body's do, the notes' don't. */
  body: boolean;
  headings: number;
  /** The level of root headings the section links go to (2, else 1), and the links so far. */
  sectionDepth: number;
  sections: Section[];
  /**
   * For an EPUB: the part being drawn, and the part each note is in. A note goes at the end of the
   * part that refers to it first (one referred to only inside another note goes with that note),
   * and `placed` lists the notes the current part has taken, in the order they were placed.
   */
  epub?: { file: string; noteFiles: Map<number, string>; placed: number[] };
}

function inline(node: MdNode, draw: Draw, inLink: boolean): string {
  const children = () => inlines(node.children, draw, inLink);
  switch (node.type) {
    case 'text':
    case 'html':
      // Raw HTML in a line is the writer's text.
      return escapeHtml(node.value ?? '');
    case 'inlineCode':
      return el('code', {}, escapeHtml(node.value ?? ''));
    case 'break':
      return el('br', {});
    case 'emphasis':
      return el('em', {}, children());
    case 'strong':
      return el('strong', {}, children());
    case 'footnoteReference': {
      const n = node.identifier === undefined ? undefined : draw.numbers.get(node.identifier);
      // The parser makes a reference only when its note exists, and every such note is numbered.
      if (n === undefined) return '';
      const first = !draw.referenced.has(n);
      draw.referenced.add(n);
      const id = first ? `fnref-${n}` : undefined;
      let href = `#fn-${n}`;
      const { epub } = draw;
      if (epub) {
        if (!epub.noteFiles.has(n)) {
          epub.noteFiles.set(n, epub.file);
          epub.placed.push(n);
        }
        const file = epub.noteFiles.get(n) as string;
        if (file !== epub.file) href = `${file}${href}`;
      }
      // Inside a link the number can't be a link too; it is still the note's way back.
      if (inLink) return el('sup', { class: 'fnref', id }, String(n));
      return el(
        'sup',
        { class: 'fnref' },
        el(
          'a',
          epub
            ? {
                href,
                id,
                'epub:type': 'noteref',
                role: 'doc-noteref',
                'aria-label': `Footnote ${n}`,
              }
            : { href, id, 'aria-label': `Footnote ${n}` },
          String(n),
        ),
      );
    }
    case 'image':
    case 'imageReference':
      // Nothing is fetched: an image is its description, as the Preview shows it.
      return el('span', { class: 'image' }, escapeHtml(`[Image: ${node.alt || 'no description'}]`));
    case 'link':
    case 'linkReference': {
      const url =
        node.type === 'link'
          ? node.url
          : node.identifier === undefined
            ? undefined
            : draw.addresses.get(node.identifier);
      const href = inLink ? undefined : linkHref(url);
      if (href === undefined) return children();
      return el(
        'a',
        { href, target: '_blank', rel: 'noopener noreferrer' },
        inlines(node.children, draw, true),
      );
    }
    default:
      if (node.children) return children();
      return node.value ? escapeHtml(node.value) : '';
  }
}

const inlines = (nodes: MdNode[] | undefined, draw: Draw, inLink = false) =>
  (nodes ?? []).map((node) => inline(node, draw, inLink)).join('');

function block(node: MdNode, draw: Draw, tight: boolean, top = false): string {
  switch (node.type) {
    case 'heading': {
      const level = draw.outline.level(node.depth ?? 1);
      const id = draw.body ? `h-${++draw.headings}` : undefined;
      if (id && top && node.depth === draw.sectionDepth) {
        const text = squeezed(plainText(node));
        if (text) draw.sections.push({ id, text });
      }
      return el(`h${level}`, { id }, inlines(node.children, draw));
    }
    case 'paragraph':
      // A tight list's item holds its text directly, as the Preview draws it.
      return tight ? inlines(node.children, draw) : el('p', {}, inlines(node.children, draw));
    case 'blockquote':
      return el('blockquote', {}, blocks(node.children, draw, false));
    case 'list': {
      const start =
        node.ordered && typeof node.start === 'number' && node.start !== 1 ? node.start : undefined;
      const items = (node.children ?? [])
        .map((item) => el('li', {}, blocks(item.children, draw, !node.spread)))
        .join('');
      return el(node.ordered ? 'ol' : 'ul', { start }, items);
    }
    case 'code':
      return el('pre', {}, el('code', {}, escapeHtml(node.value ?? '')));
    case 'thematicBreak':
      return el('hr', {});
    case 'html':
      // A raw HTML block is the writer's text, kept as typed.
      return el('p', { class: 'raw' }, escapeHtml(node.value ?? ''));
    case 'definition':
    case 'footnoteDefinition': // drawn at the end, if it is referenced
      return '';
    default:
      // A kind it doesn't know: its blocks, or its text as a paragraph, as Reading's fallback
      // does; nothing is dropped.
      if (node.children?.some((child) => BLOCKS.has(child.type))) {
        return blocks(node.children, draw, tight);
      }
      if (node.children) return el('p', {}, inlines(node.children, draw));
      return node.value ? el('p', {}, escapeHtml(node.value)) : '';
  }
}

/** The kinds of node that are blocks of their own, as CommonMark and its footnotes give them. */
const BLOCKS: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'blockquote',
  'list',
  'listItem',
  'code',
  'thematicBreak',
  'html',
  'definition',
  'footnoteDefinition',
]);

/** A text's words with each run of spaces as one, for comparing a heading with the title. */
const squeezed = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Whether any node in `node` is a footnote reference. */
function holdsReference(node: MdNode): boolean {
  const stack = [node];
  for (let next = stack.pop(); next; next = stack.pop()) {
    if (next.type === 'footnoteReference') return true;
    stack.push(...(next.children ?? []));
  }
  return false;
}

/**
 * The document's first block when it is the title the header already shows: a `#` heading whose
 * words are the title's (the title came from it), holding no footnote reference (which would lose
 * the note's way back). Drawn again under the header, it would say the title twice.
 */
function titleHeading(roots: MdNode[], title: string): MdNode | undefined {
  const first = roots[0];
  if (first?.type !== 'heading' || first.depth !== 1 || holdsReference(first)) return undefined;
  return squeezed(plainText(first)) === squeezed(title) ? first : undefined;
}

const blocks = (nodes: MdNode[] | undefined, draw: Draw, tight: boolean, top = false) =>
  (nodes ?? []).map((node) => block(node, draw, tight, top)).join('');

/**
 * The notes at the end, as the Preview lists them: after a rule, under a small "Notes" heading, a
 * numbered list, each note with a link back to its first reference, at the end of its last
 * paragraph or after its last block.
 */
function notesHtml(notes: MdNode[], draw: Draw): string {
  const items = notes.map((note, i) => {
    const n = i + 1;
    const back = el(
      'a',
      { href: `#fnref-${n}`, class: 'back', 'aria-label': `Back to footnote ${n}’s reference` },
      '↩',
    );
    const children = note.children ?? [];
    const last = children.at(-1);
    const text =
      last?.type === 'paragraph'
        ? blocks(children.slice(0, -1), draw, false) +
          el('p', {}, `${inlines(last.children, draw)} ${back}`)
        : `${blocks(children, draw, false)} ${back}`;
    return el('li', { id: `fn-${n}` }, text);
  });
  return el(
    'section',
    { class: 'footnotes', 'aria-labelledby': 'fn-heading' },
    el('hr', {}) + el('h2', { id: 'fn-heading' }, 'Notes') + el('ol', {}, items.join('')),
  );
}

/** Link reference definitions' addresses, by identifier, the first of each as CommonMark reads them. */
function definitions(tree: MdNode): Map<string, string> {
  const addresses = new Map<string, string>();
  const stack = [tree];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (node.type === 'definition' && node.identifier !== undefined) {
      if (!addresses.has(node.identifier)) addresses.set(node.identifier, node.url ?? '');
    }
    for (const child of [...(node.children ?? [])].reverse()) stack.push(child);
  }
  return addresses;
}

/**
 * What drawing a document starts from: its root blocks (without the title's own heading), the
 * drawing's state, and its notes, numbered as the Preview numbers them. Throws a RangeError
 * saying "nested too deeply" for a tree deeper than `MAX_TREE_DEPTH`.
 */
function prepare(tree: MdNode, title: string) {
  if (treeDepth(tree, MAX_TREE_DEPTH) > MAX_TREE_DEPTH) {
    const error = new RangeError(
      `This document is nested too deeply to export: more than ${MAX_TREE_DEPTH} levels.`,
    );
    error.name = 'NestedTooDeeply';
    throw error;
  }
  const { numbers, notes } = footnotes(tree);
  // The title's own heading is left out before anything is numbered, so the headings' ids (h-1
  // on) and the section links are the same whether the title came from the document or not.
  const all = tree.children ?? [];
  const roots = titleHeading(all, title) ? all.slice(1) : all;
  const draw: Draw = {
    numbers,
    addresses: definitions(tree),
    referenced: new Set(),
    outline: new Outline(1, 1),
    body: true,
    headings: 0,
    sectionDepth: roots.some((node) => node.type === 'heading' && node.depth === 2) ? 2 : 1,
    sections: [],
  };
  return { roots, draw, notes };
}

/** One part of a document's EPUB: its name for the contents, its file, and its markup. */
export interface DocumentPart {
  title: string;
  file: string;
  html: string;
}

/**
 * A document cut into an EPUB's parts (design §10a): one per root `#` heading (a chapter), with
 * what comes before the first one as a part of its own named by the title; the whole document as
 * one part when it has no `#` (the title's own heading is not one: the header shows it). Each
 * part's footnotes are EPUB 3 footnotes at its end, `<aside epub:type="footnote" id="fn-n">`, each
 * with a link back to its first reference, which is in the same part; a reference is an
 * `epub:type="noteref"` link, to `file#fn-n` when its note is in an earlier part. Headings keep
 * the ids (`h-n`) and levels the HTML file gives them. `fileOf(i)` names part i's file.
 */
export function documentParts(
  tree: MdNode,
  title: string,
  fileOf: (i: number) => string,
): DocumentPart[] {
  const { roots, draw, notes } = prepare(tree, title);
  const groups: { title: string; nodes: MdNode[] }[] = [];
  for (const node of roots) {
    if (node.type === 'heading' && node.depth === 1) {
      groups.push({ title: squeezed(plainText(node)), nodes: [node] });
    } else if (groups.length === 0) {
      groups.push({ title, nodes: [node] });
    } else {
      groups[groups.length - 1]?.nodes.push(node);
    }
  }
  // Leading definitions draw nothing: they are no part of their own.
  const silent = (node: MdNode) => node.type === 'definition' || node.type === 'footnoteDefinition';
  if (groups.length > 1 && groups[0]?.title === title && groups[0].nodes.every(silent)) {
    groups.shift();
  }
  if (groups.length === 0) groups.push({ title, nodes: [] });

  const noteFiles = new Map<number, string>();
  return groups.map((group, i) => {
    const file = fileOf(i);
    const epub = { file, noteFiles, placed: [] as number[] };
    const part: Draw = { ...draw, epub };
    let html = blocks(group.nodes, part, false, true);
    draw.headings = part.headings;
    // The notes this part refers to first, and those they refer to in turn, by number.
    const asides = new Map<number, string>();
    for (let k = 0; k < epub.placed.length; k++) {
      const n = epub.placed[k] as number;
      const note = notes[n - 1];
      if (note)
        asides.set(n, asideHtml(note, n, { ...part, outline: new Outline(2, 3), body: false }));
    }
    if (asides.size > 0) {
      html += el(
        'section',
        { class: 'footnotes', 'aria-label': 'Notes' },
        el('hr', {}) +
          [...asides.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, aside]) => aside)
            .join(''),
      );
    }
    return { title: group.title || `Part ${i + 1}`, file, html };
  });
}

/**
 * One note as an EPUB footnote: its number, its text, and a link back to its first reference at
 * the end of its last paragraph (or after its last block).
 */
function asideHtml(note: MdNode, n: number, draw: Draw): string {
  const back = el(
    'a',
    { href: `#fnref-${n}`, class: 'back', 'aria-label': `Back to footnote ${n}’s reference` },
    '↩',
  );
  const label = el('span', { class: 'fn-n' }, `${n}.`);
  const children = note.children ?? [];
  const last = children.at(-1);
  let body: string;
  if (children.length === 1 && last?.type === 'paragraph') {
    body = el('p', {}, `${label} ${inlines(last.children, draw)} ${back}`);
  } else if (last?.type === 'paragraph') {
    body =
      el('p', {}, label) +
      blocks(children.slice(0, -1), draw, false) +
      el('p', {}, `${inlines(last.children, draw)} ${back}`);
  } else {
    body = el('p', {}, label) + blocks(children, draw, false) + el('p', {}, back);
  }
  return el(
    'aside',
    { id: `fn-${n}`, class: 'fn', 'epub:type': 'footnote', role: 'doc-footnote' },
    body,
  );
}

/**
 * A Markdown document's whole file (design §4): the header ("Document · N words · M min read" and
 * the title), a row of links to its sections (each root `##` heading, or `#` when it has none),
 * and the document as the Preview draws it, with links that work (`http:`, `https:`, and `mailto:`
 * only, in a new tab; any other is its text), images as their descriptions, raw HTML as text, and
 * the footnotes numbered as the Preview numbers them, gathered at the end, linked both ways. No
 * font is embedded: a document is in the Studio type.
 *
 * The title isn't said twice: a first `#` heading whose words are the title's is left out under
 * the header (and has no section link), before the headings are numbered, so the first heading
 * drawn is `h-1` either way. The writer's own `#heading` links are their text, since the file's
 * ids are its own.
 *
 * Throws a RangeError saying "nested too deeply" for a tree deeper than `MAX_TREE_DEPTH`, which the
 * export says as it says a document the parser refuses.
 */
export function renderDocumentHtml(input: DocumentHtmlInput): string {
  const { tree } = input;
  const { roots, draw, notes } = prepare(tree, input.title);
  let body = blocks(roots, draw, false, true);
  if (notes.length > 0) {
    body += notesHtml(notes, { ...draw, outline: new Outline(2, 3), body: false });
  }
  const nav =
    draw.sections.length > 0
      ? el(
          'nav',
          { class: 'sections', 'aria-label': 'Sections' },
          el(
            'ol',
            {},
            draw.sections
              .map((s) => el('li', {}, el('a', { href: `#${s.id}` }, escapeHtml(s.text))))
              .join(''),
          ),
        )
      : '';
  return htmlShell({
    title: input.title,
    lang: input.lang,
    generator: input.generator,
    kind: 'document',
    header: headerHtml(kindLine(countWords(tree)), input.title, []),
    nav,
    body,
    fontFaces: '',
    rules: '',
  });
}
