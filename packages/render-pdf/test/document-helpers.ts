import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Measure } from '../src/document/measure';
import type { DocNode } from '../src/document/tree';

/** A CommonMark tree of `source`, as the app's `parseMarkdown` reads it. */
export const md = (source: string): DocNode => fromMarkdown(source) as unknown as DocNode;

/** The one code point `fixedMeasure` has no glyph for, in any face. */
export const MISSING = 0x6f22;

/** A measure for layout tests: every character is half its size wide, and every face has every character but U+6F22. */
export const fixedMeasure: Measure = {
  width: (text, _face, size) => [...text].length * 0.5 * size,
  has: (codePoint) => codePoint !== MISSING,
};
