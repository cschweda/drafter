/**
 * The Preview pane's drawing: a Markdown syntax tree as DOM. Only `createElement`, `createTextNode`,
 * and `textContent` build it, never an HTML string, so nothing in the writer's text can become
 * markup. Raw HTML is shown as text. A link is drawn as its text only (no `href` is ever made, so
 * no `javascript:` address can run), and an image as its description (nothing is fetched). A
 * footnote's reference is its number, raised, and the notes are listed at the end (`footnotes`).
 */
import type { MdNode } from '@drafter/markdown';
import { footnotes } from './notes';

/** The parts of an mdast node the Preview reads, from @drafter/markdown, which parses it. */
export type { MdNode } from '@drafter/markdown';

/** The nodes the Preview draws as blocks of their own, which carry their offset (`data-from`) for scroll sync. */
export const BLOCK_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'blockquote',
  'list',
  'listItem',
  'code',
  'thematicBreak',
  'html',
]);

/** Where `node` starts in the text, if the tree says. */
export function startOf(node: MdNode): number | undefined {
  return node.from ?? node.position?.start?.offset;
}

type Make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) => HTMLElementTagNameMap[K];

/** What a drawing carries: its document, the notes' numbers, and where each note and its first reference are drawn. */
interface Draw {
  doc: Document;
  make: Make;
  /** Whether blocks are marked for scroll sync: the body's are, the notes' at the end aren't. */
  marks: boolean;
  numbers: Map<string, number>;
  /** Each note's first reference, which its note goes back to. */
  refs: Map<number, HTMLButtonElement>;
  /** Each note's item in the list at the end. */
  items: Map<number, HTMLLIElement>;
}

/**
 * Marks `el` with where `node` starts: a number, read by scroll sync (`editor/scroll-sync.ts`).
 * Scroll sync needs the marks in the order of the text, so the notes, drawn at the end wherever
 * they were written, carry none.
 */
function mark(el: HTMLElement, node: MdNode, draw: Draw): void {
  const from = startOf(node);
  if (draw.marks && from !== undefined) el.dataset.from = String(from);
}

function inline(node: MdNode, parent: Node, draw: Draw): void {
  const { doc, make } = draw;
  switch (node.type) {
    case 'text':
    case 'html':
      // Raw HTML in the middle of a line is the writer's text.
      parent.appendChild(doc.createTextNode(node.value ?? ''));
      return;
    case 'inlineCode': {
      const code = make('code');
      code.textContent = node.value ?? '';
      parent.appendChild(code);
      return;
    }
    case 'break':
      parent.appendChild(make('br'));
      return;
    case 'emphasis':
    case 'strong': {
      const el = make(node.type === 'emphasis' ? 'em' : 'strong');
      for (const child of node.children ?? []) inline(child, el, draw);
      parent.appendChild(el);
      return;
    }
    case 'footnoteReference': {
      const n = node.identifier === undefined ? undefined : draw.numbers.get(node.identifier);
      if (n === undefined) return;
      // A button, not a link: it moves focus to the note, and no address is ever made.
      const sup = make('sup', 'md-fnref');
      const button = make('button', 'md-fnref-button');
      button.type = 'button';
      button.textContent = String(n);
      button.setAttribute('aria-label', `Footnote ${n}`);
      button.addEventListener('click', () => draw.items.get(n)?.focus());
      if (!draw.refs.has(n)) draw.refs.set(n, button);
      sup.appendChild(button);
      parent.appendChild(sup);
      return;
    }
    case 'image':
    case 'imageReference': {
      const span = make('span', 'md-image');
      span.textContent = `[Image: ${node.alt || 'no description'}]`;
      parent.appendChild(span);
      return;
    }
    default:
      // A link, a reference to one, and anything else with children: the text inside.
      if (node.children) for (const child of node.children) inline(child, parent, draw);
      else if (node.value) parent.appendChild(doc.createTextNode(node.value));
  }
}

function block(node: MdNode, parent: Node, draw: Draw, tight: boolean): void {
  const { make } = draw;
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.depth ?? 1));
      const el = make(`h${level}` as 'h1');
      mark(el, node, draw);
      for (const child of node.children ?? []) inline(child, el, draw);
      parent.appendChild(el);
      return;
    }
    case 'paragraph': {
      // A tight list's item holds its text directly.
      const into = tight ? parent : parent.appendChild(make('p'));
      if (!tight) mark(into as HTMLElement, node, draw);
      for (const child of node.children ?? []) inline(child, into, draw);
      return;
    }
    case 'blockquote': {
      const el = make('blockquote');
      mark(el, node, draw);
      for (const child of node.children ?? []) block(child, el, draw, false);
      parent.appendChild(el);
      return;
    }
    case 'list': {
      const el = make(node.ordered ? 'ol' : 'ul');
      mark(el, node, draw);
      if (node.ordered && typeof node.start === 'number' && node.start !== 1) {
        el.setAttribute('start', String(node.start));
      }
      for (const item of node.children ?? []) {
        const li = make('li');
        mark(li, item, draw);
        for (const child of item.children ?? []) block(child, li, draw, !node.spread);
        el.appendChild(li);
      }
      parent.appendChild(el);
      return;
    }
    case 'code': {
      const pre = make('pre');
      mark(pre, node, draw);
      const code = make('code');
      code.textContent = node.value ?? '';
      pre.appendChild(code);
      parent.appendChild(pre);
      return;
    }
    case 'thematicBreak': {
      const hr = make('hr');
      mark(hr, node, draw);
      parent.appendChild(hr);
      return;
    }
    case 'html': {
      // A raw HTML block is the writer's text, kept as typed.
      const el = make('p', 'md-raw');
      mark(el, node, draw);
      el.textContent = node.value ?? '';
      parent.appendChild(el);
      return;
    }
    case 'definition':
    case 'footnoteDefinition': // drawn at the end, if it is referenced
      return;
    default:
      if (node.children) for (const child of node.children) block(child, parent, draw, tight);
      else if (node.value) {
        const el = make('p');
        el.textContent = node.value;
        parent.appendChild(el);
      }
  }
}

/** Each drawing's notes heading gets an id of its own. */
let drawings = 0;

/**
 * The notes at the end: after a rule, under a small heading, "Notes", as a numbered list. Each
 * note ends with a button back to its first reference.
 */
function drawNotes(notes: MdNode[], draw: Draw): HTMLElement {
  const { make } = draw;
  const section = make('section', 'md-notes');
  const heading = make('h2', 'md-notes-heading');
  heading.id = `md-notes-${++drawings}`;
  heading.textContent = 'Notes';
  section.setAttribute('aria-labelledby', heading.id);
  section.append(make('hr', 'md-notes-rule'), heading);
  const list = make('ol');
  notes.forEach((note, i) => {
    const n = i + 1;
    const item = make('li');
    item.value = n;
    // Focus comes here from a reference, and never by Tab.
    item.tabIndex = -1;
    const text = make('div', 'md-note-text');
    for (const child of note.children ?? []) block(child, text, draw, false);
    const back = make('button', 'md-note-back');
    back.type = 'button';
    back.textContent = '↩';
    back.setAttribute('aria-label', `Back to footnote ${n}’s reference`);
    back.addEventListener('click', () => draw.refs.get(n)?.focus());
    // At the end of the note's last paragraph, or on a line of its own after anything else.
    const last = text.lastElementChild;
    (last?.tagName === 'P' ? last : text).append(' ', back);
    item.appendChild(text);
    draw.items.set(n, item);
    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
}

/** The document the tree describes, as DOM in `doc`, with its notes at the end. */
export function renderMarkdown(tree: MdNode, doc: Document): DocumentFragment {
  const make: Make = (tag, className) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    return el;
  };
  const { numbers, notes } = footnotes(tree);
  const draw: Draw = { doc, make, marks: true, numbers, refs: new Map(), items: new Map() };
  const out = doc.createDocumentFragment();
  for (const child of tree.children ?? []) block(child, out, draw, false);
  if (notes.length > 0) out.appendChild(drawNotes(notes, { ...draw, marks: false }));
  return out;
}
