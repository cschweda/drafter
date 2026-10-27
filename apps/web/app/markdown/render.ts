/**
 * The Preview pane's drawing: a Markdown syntax tree as DOM. Only `createElement`, `createTextNode`,
 * and `textContent` build it, never an HTML string, so nothing in the writer's text can become
 * markup. Raw HTML is shown as text. A link is drawn as its text only (no `href` is ever made, so
 * no `javascript:` address can run), and an image as its description (nothing is fetched).
 */

/** The parts of an mdast node this file reads; `mdast-util-from-markdown`'s tree has them. */
export interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  spread?: boolean | null;
  alt?: string | null;
  /** Where the node starts in the text, as `mdast-util-from-markdown` records it. */
  position?: { start?: { offset?: number } };
  /** Where a block starts in the text, kept when the worker sends the tree without `position`. */
  from?: number;
}

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

/** Marks `el` with where `node` starts: a number, read by scroll sync (`editor/scroll-sync.ts`). */
function mark(el: HTMLElement, node: MdNode): void {
  const from = startOf(node);
  if (from !== undefined) el.dataset.from = String(from);
}

type Make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) => HTMLElementTagNameMap[K];

function inline(node: MdNode, parent: Node, doc: Document, make: Make): void {
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
      for (const child of node.children ?? []) inline(child, el, doc, make);
      parent.appendChild(el);
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
      if (node.children) for (const child of node.children) inline(child, parent, doc, make);
      else if (node.value) parent.appendChild(doc.createTextNode(node.value));
  }
}

function block(node: MdNode, parent: Node, doc: Document, make: Make, tight: boolean): void {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.depth ?? 1));
      const el = make(`h${level}` as 'h1');
      mark(el, node);
      for (const child of node.children ?? []) inline(child, el, doc, make);
      parent.appendChild(el);
      return;
    }
    case 'paragraph': {
      // A tight list's item holds its text directly.
      const into = tight ? parent : parent.appendChild(make('p'));
      if (!tight) mark(into as HTMLElement, node);
      for (const child of node.children ?? []) inline(child, into, doc, make);
      return;
    }
    case 'blockquote': {
      const el = make('blockquote');
      mark(el, node);
      for (const child of node.children ?? []) block(child, el, doc, make, false);
      parent.appendChild(el);
      return;
    }
    case 'list': {
      const el = make(node.ordered ? 'ol' : 'ul');
      mark(el, node);
      if (node.ordered && typeof node.start === 'number' && node.start !== 1) {
        el.setAttribute('start', String(node.start));
      }
      for (const item of node.children ?? []) {
        const li = make('li');
        mark(li, item);
        for (const child of item.children ?? []) block(child, li, doc, make, !node.spread);
        el.appendChild(li);
      }
      parent.appendChild(el);
      return;
    }
    case 'code': {
      const pre = make('pre');
      mark(pre, node);
      const code = make('code');
      code.textContent = node.value ?? '';
      pre.appendChild(code);
      parent.appendChild(pre);
      return;
    }
    case 'thematicBreak': {
      const hr = make('hr');
      mark(hr, node);
      parent.appendChild(hr);
      return;
    }
    case 'html': {
      // A raw HTML block is the writer's text, kept as typed.
      const el = make('p', 'md-raw');
      mark(el, node);
      el.textContent = node.value ?? '';
      parent.appendChild(el);
      return;
    }
    case 'definition':
      return;
    default:
      if (node.children) for (const child of node.children) block(child, parent, doc, make, tight);
      else if (node.value) {
        const el = make('p');
        el.textContent = node.value;
        parent.appendChild(el);
      }
  }
}

/** The document the tree describes, as DOM in `doc`. */
export function renderMarkdown(tree: MdNode, doc: Document): DocumentFragment {
  const make: Make = (tag, className) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    return el;
  };
  const out = doc.createDocumentFragment();
  for (const child of tree.children ?? []) block(child, out, doc, make, false);
  return out;
}
