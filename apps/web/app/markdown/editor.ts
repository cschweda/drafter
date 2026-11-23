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
import { isEmphasisMark, isOpener, MAX_MARKS, MAX_NESTING, MAX_OPENERS } from './depth';

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

/** A run of spaces or tabs longer than this is plain text: no line break is that far behind them. */
const MAX_SPACE_RUN = 1000;
const SPACE = 32;
const TAB = 9;
const OPEN = 91;
const CLOSE = 93;
const LESS = 60;

/** What a paragraph is crowded with, worked out once per paragraph. */
interface Crowded {
  /** More than MAX_MARKS emphasis marks. */
  marks: boolean;
  /** More than MAX_MARKS brackets. */
  brackets: boolean;
  /** A run of spaces or tabs longer than MAX_SPACE_RUN. */
  spaces: boolean;
  /** More than MAX_OPENERS of `<!` and `<?`. */
  openers: boolean;
}
const crowded = new WeakMap<object, Crowded>();
function crowdedOf(cx: { text: string }): Crowded {
  let known = crowded.get(cx);
  if (known === undefined) {
    let marks = 0;
    let brackets = 0;
    let run = 0;
    let longest = 0;
    let openers = 0;
    for (let i = 0; i < cx.text.length; i++) {
      const code = cx.text.charCodeAt(i);
      if (code === LESS && isOpener(cx.text, i)) openers++;
      if (code === SPACE || code === TAB) {
        if (++run > longest) longest = run;
        continue;
      }
      run = 0;
      if (isEmphasisMark(code)) marks++;
      else if (code === OPEN || code === CLOSE) brackets++;
    }
    known = {
      marks: marks > MAX_MARKS,
      brackets: brackets > MAX_MARKS,
      spaces: longest > MAX_SPACE_RUN,
      openers: openers > MAX_OPENERS,
    };
    crowded.set(cx, known);
  }
  return known;
}

/**
 * In a paragraph with more than MAX_MARKS `*` and `_`, they are plain text: the grammar's emphasis
 * work grows with their number squared, and 160 KB of `*_` held the page for 14 seconds, again on
 * every reload (red/blue audit, 2026-11-03). Taking each mark as one plain character, before the
 * grammar's own parsers see it, keeps that paragraph linear; every other paragraph is highlighted
 * as before. The same for a paragraph crowded with brackets, whose link parser looks back through
 * them, and for one with a very long run of spaces, where each space looked ahead for the line
 * break that would make a hard break of it: 160 KB of spaces took 16 seconds (red/blue audit of
 * 23 November 2026, W2). And for one with more than MAX_OPENERS of `<!` and `<?`: each that
 * never closes looked to the paragraph's end (the audit of that audit).
 */
const plainWhenDense = {
  parseInline: [
    {
      name: 'PlainWhenDense',
      before: 'Escape',
      parse: (cx: { text: string; offset: number }, next: number, pos: number) => {
        const isSpace = next === SPACE || next === TAB;
        const isBracket = next === OPEN || next === CLOSE;
        const isLess = next === LESS;
        if (!isSpace && !isBracket && !isLess && !isEmphasisMark(next)) return -1;
        const what = crowdedOf(cx);
        const plain = isSpace
          ? what.spaces
          : isBracket
            ? what.brackets
            : isLess
              ? what.openers
              : what.marks;
        return plain ? pos + 1 : -1;
      },
    },
  ],
};
