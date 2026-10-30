import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import { containerDepth, MAX_NESTING } from './depth';
import type { MdNode } from './render';

/**
 * A document nested deeper than `MAX_NESTING`, refused before it is parsed. A RangeError, as running
 * out of stack is, and its message says "nested too deeply", so the Preview and the export say it as
 * they say that (`previewProblem`), here or from a worker that sends only the message.
 */
export class NestedTooDeeply extends RangeError {
  constructor() {
    super(`This document is nested too deeply to read: more than ${MAX_NESTING} levels.`);
    this.name = 'NestedTooDeeply';
  }
}

/**
 * The labels of the footnote definitions read so far, as the footnote extension keeps them
 * (`parser.gfmFootnotes`), with a set beside the list. The extension asks `includes` at every
 * definition and every reference, and an array answers that by reading every label, so a document
 * of many notes took time by the square of their number (50,000 definitions: four seconds).
 */
class Labels extends Array<string> {
  readonly #seen = new Set<string>();
  override includes(label: string): boolean {
    return this.#seen.has(label);
  }
  override push(...labels: string[]): number {
    for (const label of labels) this.#seen.add(label);
    return super.push(...labels);
  }
}

/** The part of micromark's tokenizer context that `withLabels` reads. */
interface Context {
  parser: { gfmFootnotes?: string[] };
}
type Tokenize = (this: Context, ...args: unknown[]) => unknown;

/**
 * GFM's footnote syntax with `Labels` in place of the extension's array: each of its tokenizers
 * first gives the parser a `Labels`, which the extension then finds and keeps (it makes its own
 * only when there is none). This reads one field of the extension's, so its version is pinned
 * exactly, and a test fails if many definitions stop parsing in linear time.
 */
function footnoteSyntax(): ReturnType<typeof gfmFootnote> {
  const extension = gfmFootnote();
  const wrap = (construct: { tokenize?: unknown } | undefined) => {
    if (!construct || typeof construct.tokenize !== 'function') return;
    const tokenize = construct.tokenize as Tokenize;
    construct.tokenize = function (this: Context, ...args: unknown[]) {
      this.parser.gfmFootnotes ??= new Labels();
      return tokenize.apply(this, args);
    };
  };
  for (const constructs of [extension.document, extension.text]) {
    for (const construct of Object.values(constructs ?? {})) {
      for (const one of [construct].flat()) wrap(one as { tokenize?: unknown });
    }
  }
  return extension;
}

const FOOTNOTES = footnoteSyntax();

/**
 * Reads CommonMark into a syntax tree (`mdast-util-from-markdown`, which drives `micromark`), with
 * GFM's footnotes (`text[^1]` and `[^1]: The note.`) and nothing else of GFM. Raw HTML stays an
 * `html` node for the preview to show as text, and nothing in the text is ever run. A document
 * nested deeper than `MAX_NESTING` throws `NestedTooDeeply` at once, which only a broken or hostile
 * file is: the parser's time grows with depth times length, and a few kilobytes of it held the page
 * for seconds.
 */
export function parseMarkdown(source: string): MdNode {
  // One byte-order mark first is no text (the parser would skip it anyway, offsets and all): taken
  // off here, so the nesting scan and the parser read exactly the same text.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (containerDepth(text, MAX_NESTING) > MAX_NESTING) throw new NestedTooDeeply();
  return fromMarkdown(text, {
    extensions: [FOOTNOTES],
    mdastExtensions: [gfmFootnoteFromMarkdown()],
  }) as MdNode;
}
