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
    tree.iterate({
      from,
      to,
      enter(node) {
        const decoration = BY_NODE[node.name];
        if (decoration && node.to > node.from) out.push(decoration.range(node.from, node.to));
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
  return [markdown({ base: commonmarkLanguage, completeHTMLTags: false }), highlighting];
}
