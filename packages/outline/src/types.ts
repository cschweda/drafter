import type { Span } from '@drafter/fountain';

/** Where a scene sits in the pages, from a layout that matches the parse. */
export interface ScenePages {
  /** The page number it starts on (1-based; the title page is 0). */
  page: number;
  /** The line of that page it starts on, 1-based. */
  line: number;
  /** Its length in eighths of a page; a scene shorter than one eighth counts as one. */
  eighths: number;
}

export interface Synopsis {
  text: string;
  block: number;
  span: Span;
}

/** One scene (Phase 2 design §5.1). */
export interface Scene {
  kind: 'scene';
  /** 1, 2, 3… in script order. */
  ordinal: number;
  /** The locked scene number (`#12A#`), if the heading has one. */
  number: string | null;
  /** The block that starts it: a scene heading, or a play's `##` section. */
  block: number;
  /** The heading's text, without its marker or locked number. */
  heading: string;
  /** From the heading to the end of the scene's last block. */
  span: Span;
  /** The block indexes of the sections the scene sits in, outermost first. */
  sections: number[];
  synopses: Synopsis[];
  /** The scene's first `[[Color: …]]` note: its value, lowercased, and the note's span. */
  color: { value: string; span: Span } | null;
  /** The names that speak in it, as first typed, once each, in order. */
  speakers: string[];
  /** Printed words: action, dialogue, and the rest that prints. */
  words: number;
  /** Null until a layout that matches the parse is given. */
  pages: ScenePages | null;
}

/** A section that holds scenes (in a play, an act). */
export interface Section {
  kind: 'section';
  block: number;
  depth: number;
  title: string;
  /** From the heading to the end of its last descendant. */
  span: Span;
  /** The end of the heading and of the blocks before its first child: where its start is. */
  introEnd: number;
  /** The enclosing section's block, or null at the top. */
  parent: number | null;
  /** The scenes inside it, at any depth. */
  scenes: number;
  /** The scenes' total length in eighths, or null without pages. */
  eighths: number | null;
}

export type OutlineItem = Scene | Section;

export type OutlineNode = { item: Section; children: OutlineNode[] } | { item: Scene };

export interface SceneIndex {
  /** The title page and every block before the first scene or section; never moved. */
  preamble: Span | null;
  /** Every scene and section, in source order. */
  items: OutlineItem[];
  scenes: Scene[];
  sections: Section[];
  /** Sections holding scenes and deeper sections. */
  tree: OutlineNode[];
}
