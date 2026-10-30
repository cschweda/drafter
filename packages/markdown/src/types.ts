/**
 * The parts of an mdast node Drafter reads: the Preview, the word count, and the exports.
 * `mdast-util-from-markdown`'s tree has them; a structural type, so a reader of the tree imports
 * nothing of mdast's own types.
 */
export interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  spread?: boolean | null;
  /** A link's or an image's address, as written. */
  url?: string;
  alt?: string | null;
  /** A footnote reference's or definition's normalized label, which joins them. */
  identifier?: string;
  /** The same label as written. */
  label?: string | null;
  /** Where the node starts in the text, as `mdast-util-from-markdown` records it. */
  position?: { start?: { offset?: number } };
  /** Where a block starts in the text, kept when the worker sends the tree without `position`. */
  from?: number;
}
