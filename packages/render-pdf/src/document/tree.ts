/**
 * The fields of a CommonMark (mdast) node that a document's layout reads. `mdast-util-from-markdown`'s
 * tree has them; the renderer takes this structural type, so it imports nothing from Markdown.
 */
export interface DocNode {
  type: string;
  children?: DocNode[];
  value?: string;
  /** A heading's level, 1 to 6. */
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  /** A list is loose (blank lines between its items). */
  spread?: boolean | null;
  url?: string;
  alt?: string | null;
  /** A reference's or a definition's normalized label, which joins them. */
  identifier?: string;
  label?: string | null;
}
