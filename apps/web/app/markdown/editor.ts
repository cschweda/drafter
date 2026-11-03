import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { isEmphasisMark, MAX_MARKS, MAX_NESTING } from './depth';

// The Source pane's mode for a Markdown document: CodeMirror's general-purpose Markdown grammar
// (a Lezer grammar, which is outside Plan 2's "no Lezer grammar" rule: that rule is about
// Fountain, whose only parser is `@drafter/fountain`), and highlighting in Drafter's own classes,
// `cm-md-*`, that the app's theme colors with design tokens.

const mark = (cls: string) => Decoration.mark({ class: cls });

const HEADING = mark('cm-md-heading');
const STRONG = mark('cm-md-b');
const EMPHASIS = mark('cm-md-i');
const CODE = mark('cm-md-code');
const QUOTE = mark('cm-md-quote');
const MARKER = mark('cm-md-marker');
const LINK = mark('cm-md-link');
const URL = mark('cm-md-url');
const HTML = mark('cm-md-html');
const FOOTNOTE = mark('cm-md-footnote');

/**
 * A footnote's reference or a definition's label, `[^label]`: CommonMark's grammar reads it as a
 * link, so it is told apart by its text (a label holds no space or bracket; a link with an address
 * after it is a link).
 */
const FOOTNOTE_MARK = /^\[\^[^\s[\]]+\]$/;

/** The decoration for a node of the Markdown grammar, or none. */
const BY_NODE: Record<string, Decoration> = {
  ATXHeading1: HEADING,
  ATXHeading2: HEADING,
  ATXHeading3: HEADING,
  ATXHeading4: HEADING,
  ATXHeading5: HEADING,
  ATXHeading6: HEADING,
  SetextHeading1: HEADING,
  SetextHeading2: HEADING,
  StrongEmphasis: STRONG,
  Emphasis: EMPHASIS,
  InlineCode: CODE,
  FencedCode: CODE,
  CodeBlock: CODE,
  Blockquote: QUOTE,
  HeaderMark: MARKER,
  EmphasisMark: MARKER,
  CodeMark: MARKER,
  QuoteMark: MARKER,
  LinkMark: MARKER,
  ListMark: MARKER,
  Link: LINK,
  Image: LINK,
  URL: URL,
  HTMLBlock: HTML,
  HTMLTag: HTML,
  CommentBlock: HTML,
  Comment: HTML,
};

function decorations(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    // The ends of the marks that hold the node being entered. A quote nested thousands deep would be
    // a mark inside a mark for every level, and CodeMirror walks its marks by recursion, so past a
    // few thousand an update runs out of stack and is lost. Marks stop nesting at the depth the
    // Preview reads (MAX_NESTING); a document deeper than that isn't previewed either.
    const open: number[] = [];
    tree.iterate({
      from,
      to,
      enter(node) {
        while (open.length > 0 && (open.at(-1) as number) <= node.from) open.pop();
        if (open.length >= MAX_NESTING) return;
        if (
          node.name === 'Link' &&
          node.to - node.from <= 1_003 &&
          FOOTNOTE_MARK.test(view.state.doc.sliceString(node.from, node.to))
        ) {
          out.push(FOOTNOTE.range(node.from, node.to));
          return;
        }
        const decoration = BY_NODE[node.name];
        if (decoration && node.to > node.from) {
          out.push(decoration.range(node.from, node.to));
          open.push(node.to);
        }
      },
    });
  }
  return Decoration.set(out, true);
}

const highlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Everything the Source pane has for Markdown in place of `fountain()`: the CommonMark grammar,
 * its list-continuing Enter and markup-deleting Backspace, heading folds, and the highlighting.
 * No HTML tag completion: Fountain's completion is off, and this is not a replacement for it.
 */
export function markdownMode(): Extension {
  return [
    markdown({
      base: commonmarkLanguage,
      completeHTMLTags: false,
      extensions: [plainWhenDense],
    }),
    highlighting,
  ];
}

/** Whether a paragraph's text has more than MAX_MARKS emphasis marks, worked out once per paragraph. */
const dense = new WeakMap<object, boolean>();
function isDense(cx: { text: string }): boolean {
  let known = dense.get(cx);
  if (known === undefined) {
    let marks = 0;
    for (let i = 0; i < cx.text.length && marks <= MAX_MARKS; i++)
      if (isEmphasisMark(cx.text.charCodeAt(i))) marks++;
    known = marks > MAX_MARKS;
    dense.set(cx, known);
  }
  return known;
}

/**
 * In a paragraph with more than MAX_MARKS `*` and `_`, they are plain text: the grammar's emphasis
 * work grows with their number squared, and 160 KB of `*_` held the page for 14 seconds, again on
 * every reload (red/blue audit, 2026-11-03). Taking each mark as one plain character, before the
 * grammar's own emphasis parser sees it, keeps that paragraph linear; every other paragraph is
 * highlighted as before.
 */
const plainWhenDense = {
  parseInline: [
    {
      name: 'PlainWhenDense',
      before: 'Emphasis',
      parse: (cx: { text: string; offset: number }, next: number, pos: number) =>
        isEmphasisMark(next) && isDense(cx) ? pos + 1 : -1,
    },
  ],
};
