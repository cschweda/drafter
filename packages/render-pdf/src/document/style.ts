/** A document's type and spacing, in points: the design's §2.2, in one place. */
export const STYLE = {
  margin: 72,
  textSize: 11,
  textLeading: 16,
  /** Index 0 is heading level 1. */
  headings: [
    { size: 22, leading: 28, before: 24, muted: false },
    { size: 17, leading: 22, before: 20, muted: false },
    { size: 14, leading: 19, before: 16, muted: false },
    { size: 11, leading: 16, before: 12, muted: false },
    { size: 11, leading: 16, before: 12, muted: true },
    { size: 11, leading: 16, before: 12, muted: true },
  ],
  /** Between a heading and what follows it. */
  afterHeading: 6,
  /** Between text blocks. */
  between: 8,
  /** Between the items of a loose list. */
  looseItem: 4,
  quoteIndent: 16,
  quoteBar: 2,
  listIndent: 18,
  inlineCodeSize: 10,
  codeSize: 9.5,
  codeLeading: 13,
  codePadding: 8,
  tabSpaces: 4,
  ruleThickness: 0.5,
  /** A rule's clearance from the text above and below. */
  ruleClear: 12,
  underline: { thickness: 0.5, drop: 1.5 },
  pageNumber: { size: 9, baselineFromBottom: 36 },
  /**
   * Footnotes, at the foot of the page their reference prints on: set at `size` (everything in a
   * note in proportion to the text's 11), under a rule `ruleWidth` long, in a foot that starts
   * `ruleSpace` above the first note's top (the rule halfway); `between` is the space between notes.
   */
  notes: { size: 9, ruleWidth: 72, ruleSpace: 14, between: 4 },
  /** A footnote's reference: its number at `scale` of the text's size, its baseline raised `rise` of it. */
  superscript: { scale: 0.65, rise: 0.33 },
  colors: { text: '#000000', muted: '#555555', link: '#1f4e9a', panel: '#f3f3f3', rule: '#9a9a9a' },
} as const;
