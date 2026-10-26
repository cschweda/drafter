import type { BlockKind } from '@drafter/fountain';

/** A template's name for how a block is formatted, such as `dialogue` or `stage_direction`. */
export type Role = string;

export type Paper = 'letter' | 'a4';

export interface RoleStyle {
  /** Characters from the left margin. */
  indent: number;
  /** Maximum characters per line. */
  width: number;
  align?: 'left' | 'center' | 'right';
  case?: 'upper' | 'as-is';
  /** Blank lines before; collapsed with the previous block's `spaceAfter` by taking the larger. */
  spaceBefore: number;
  spaceAfter?: number;
  /** Never the last block on a page. */
  keepWithNext?: boolean;
  /** Never split across pages, if it fits on one. */
  keepTogether?: boolean;
  lineSpacing?: 1 | 2;
  prefix?: string;
  suffix?: string;
  style?: { bold?: boolean; italic?: boolean; underline?: boolean };
  /**
   * The heading level, 2 to 6, that this role's blocks take in the rendered
   * script, so heading navigation follows what prints. Level 1 is left for the
   * page's own title. The layout ignores it.
   */
  heading?: number;
}

/**
 * Maps blocks to roles; the first rule that matches wins. `role` is a role
 * name, `@kind` (the block's kind), `omit` (no output), or `disabled` (renders
 * like action, with a diagnostic).
 */
export interface RoleRule {
  kind: BlockKind | BlockKind[] | '*';
  /** Sections only: the number of `#`. */
  depth?: number;
  /** Character cues only: exact names, compared without regard to case. */
  names?: string[];
  /** Matches only right after a block with this role. */
  afterRole?: Role;
  role: Role;
}

export interface Template {
  id: string;
  name: string;
  extends?: string;
  page: {
    paper: Paper;
    /** The character grid: columns × lines (letter: 85 × 66; A4: 82 × 70). */
    width: number;
    height: number;
    /** Lines (top, bottom) and characters (left, right), from the top-left corner. */
    margin: { top: number; bottom: number; left: number; right: number };
    font: { family: string; monospace: boolean; pt: number };
    /** `line` counts from the top edge; `format` contains `{n}`. */
    numbering: {
      position: 'top-right' | 'none';
      line: number;
      firstNumbered: number;
      format: string;
    };
    header?: string;
    footer?: string;
  };
  roles: Record<Role, RoleStyle>;
  roleMap: RoleRule[];
  /** Lines of the next block that must share a page with a keep-with-next block. */
  keepWithNextLines: number;
  dialogueSplit: {
    more: string;
    contd: string;
    /** Column of the `(MORE)` line, from the left margin. */
    moreIndent: number;
    minLinesBefore: number;
    minLinesAfter: number;
    /** Add `(CONT'D)` when a speaker continues after action. */
    contdAfterAction: boolean;
  };
  dual: {
    gap: number;
    width: number;
    indent: { character: number; parenthetical: number; dialogue: number };
  };
  sceneNumbers: { enabled: boolean; left: number; right: number };
  titlePage: { layout: 'centered-feature' };
  lint?: { enable?: string[]; disable?: string[]; options?: Record<string, unknown> };
}

/** Physical paper sizes in PDF points. */
export const PAPER_POINTS: Readonly<Record<Paper, { width: number; height: number }>> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/** At 12 pt Courier: 7.2 pt per character, 12 pt per line. */
export const CHAR_WIDTH_PT = 7.2;
export const LINE_HEIGHT_PT = 12;
