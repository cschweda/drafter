import type { InlineRun, Span } from '@drafter/fountain';
import type { Role } from '@drafter/templates';

/** A styled piece of a printed line. */
export interface LayoutRun extends InlineRun {
  /** Text the engine added to a source line: a role's prefix or suffix, or a continued-speech `(CONT'D)`. */
  synthetic?: true;
}

export interface LayoutLine {
  /** Characters from the left margin. */
  col: number;
  /** The text with its styles, already wrapped to fit; empty for a blank line. */
  runs: LayoutRun[];
  role: Role;
  /** The block the line prints, or -1 for a synthetic line. */
  blockIndex: number;
  /** Where the line came from; empty for a line with no source text. */
  span: Span;
  /** A line the engine made: `(MORE)`, a `(CONT'D)` cue, a blank line, or a title-page line. */
  synthetic?: 'more' | 'contd' | 'blank' | 'title';
  /** The second part of a row that holds two: the right column of dual dialogue, or a draft date. */
  right?: LayoutLine;
}

export interface Page {
  /** 1-based; the title page is 0. */
  number: number;
  /** Body lines only: exactly `height − margin.top − margin.bottom` of them, blank lines included. */
  lines: LayoutLine[];
  /** In the top margin: `line` counts from the top edge of the paper, `col` from the left margin. */
  pageNumber?: { text: string; line: number; col: number };
  /** Scene numbers by body line, printed at `sceneNumbers.left` and `sceneNumbers.right`. */
  sceneNumbersLeft: Array<{ line: number; text: string }>;
  sceneNumbersRight: Array<{ line: number; text: string }>;
  header?: string;
  footer?: string;
}

export interface LayoutDiagnostic {
  code: 'dual-overflow' | 'unpaired-dual' | 'disabled-element' | 'title-page-overflow';
  severity: 'warning';
  span: Span;
  message: string;
}

export interface Layout {
  /** The title page, if there is one, is `pages[0]`, with number 0. */
  pages: Page[];
  /**
   * By block index, the first printed line of each block. A block that prints
   * nothing maps to the next printed line, or to the last one when nothing
   * prints after it.
   */
  index: Array<{ page: number; line: number }>;
  diagnostics: LayoutDiagnostic[];
}

/**
 * Which scene headings print a number: none; only those with a number written in the script
 * (`#12A#`); or every one, a written number kept and the rest counted by position.
 */
export type SceneNumbering = 'none' | 'written' | 'all';

/** What a title page keeps: everything, only its title, credit, author, and source, or nothing. */
export type TitlePageMode = 'full' | 'title-author' | 'none';

export interface PaginateOptions {
  /**
   * Overrides `template.sceneNumbers.enabled`: `true` is `'all'`, `false` is `'none'`, and
   * absent is the template's (enabled is `'all'`).
   */
  sceneNumbers?: boolean | SceneNumbering;
}

/** A template this version can't lay out: Phase 0 supports 12 pt monospace fonts only. */
export class UnsupportedTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedTemplateError';
  }
}
