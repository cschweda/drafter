import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import type { MdNode } from './render';

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
 * `html` node for the preview to show as text, and nothing in the text is ever run.
 */
export function parseMarkdown(source: string): MdNode {
  return fromMarkdown(source, {
    extensions: [FOOTNOTES],
    mdastExtensions: [gfmFootnoteFromMarkdown()],
  }) as MdNode;
}
