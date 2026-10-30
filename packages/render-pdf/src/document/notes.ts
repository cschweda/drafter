import type { Footnotes as Numbered } from '@drafter/markdown';
import type { DocNode } from './tree';

/**
 * A document's footnotes, numbered as they print: `@drafter/markdown`'s walk (`footnotes`), the one
 * the Preview numbers with, read over the renderer's own `DocNode`s.
 */
export type Footnotes = Numbered<DocNode>;

export { footnotes } from '@drafter/markdown';
