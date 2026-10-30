import type { Span } from '@drafter/fountain';
import type { FieldKey, MarkKey } from '@drafter/notes';
import type { Timing } from './timing';

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

/** One speech: a cue and the parts after it, as `TimingTally` groups them (seeing-the-script design §3.4). */
export interface Speech {
  /** The speaker's name as its unit's `speakers` (or the opening's or section's `spokenBy`) gives it. */
  name: string;
  /** The cue's block. */
  block: number;
  /** Its words spoken: both sides of a dual pair in full; a cue with only a parenthetical has 0. */
  words: number;
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
  /**
   * The first note of each field key anywhere in the scene (`[[Goal: …]]` in any case and
   * spacing), with its body trimmed; an empty one is no field, as an empty color is no color.
   */
  fields: Partial<Record<FieldKey, { body: string; span: Span }>>;
  /** Every Storyline note's comma-separated labels, once each (case folded), as first typed, in order. */
  storylines: string[];
  /** Every Setup and Payoff note with a label, in order (design §10). */
  marks: Array<{ key: MarkKey; label: string; span: Span }>;
  /** The names that speak in it, as first typed, once each, in order. */
  speakers: string[];
  /** Printed words: action, dialogue, and the rest that prints. */
  words: number;
  /**
   * Its words spoken and lines of action, for the estimate from the dialogue (`TimingTally`: a
   * dual-dialogue pair counts as its longer speech).
   */
  timing: Timing;
  /**
   * The words each speaker says in the scene, by the name as `speakers` gives it (a speaker with
   * only a parenthetical has 0); both sides of a dual pair in full. Kept for a per-character view.
   */
  spokenBy: Record<string, number>;
  /** One per cue in the scene, in order; a name's `words` add up to its `spokenBy`. */
  speeches: Speech[];
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
  /** The sum of its scenes' timing; nothing for a section with no scenes. */
  timing: Timing;
  /**
   * The speeches in its own stretch, from its heading up to its first child (a scene or a
   * subsection) or the next section, up to `introEnd`: a cold open under an act's heading. A
   * speech in one of its scenes is that scene's, not the section's.
   */
  speeches: Speech[];
  /** The words each speaker says in its own stretch, by the name as first typed there. */
  spokenBy: Record<string, number>;
  /** Its own stretch's timing, tallied as a scene's is (not in `timing`, which is its scenes'). */
  introTiming: Timing;
}

/**
 * What is said in the preamble, before the first scene or section (a cold open with no act's
 * heading over it), tallied as a scene's blocks are. With each section's and each scene's
 * `speeches`, it holds every speech in the script once.
 */
export interface Opening {
  speeches: Speech[];
  /** By the name as first typed in the opening, as a scene's `spokenBy`. */
  spokenBy: Record<string, number>;
  timing: Timing;
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
  /** The speeches before the first scene or section; null when no speech is there. */
  opening: Opening | null;
}
