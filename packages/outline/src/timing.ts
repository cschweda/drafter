import type { Block } from '@drafter/fountain';
import { resolveRole, type Template } from '@drafter/templates';

// Timing (out-the-door design §3.3): what a block adds to an estimate of the running time from
// the dialogue. Counted per block, from the text alone (no layout), so the scene index can add it
// up in the pass it already makes over each scene's blocks, and `countScript` over the whole parse.
//
// Per block on purpose: a block's speech belongs to the cue before it, so a later per-character
// view (time on screen, speaking time) can be made from these same figures and the scene index's
// `speakers`, without counting again.

/** What a stretch of the script takes: the words spoken, and the printed lines of action. */
export interface Timing {
  /** Words of dialogue and lyrics that print. */
  spoken: number;
  /** Printed lines of action (a play's stage directions), wrapped at their role's width. */
  actionLines: number;
}

/** Seconds a printed line of action takes: 40 lines a minute (design Call 14; fixed, Call 15). */
export const ACTION_SECONDS_PER_LINE = 1.5;

/** The speaking pace when the script sets none. */
export const DEFAULT_WORDS_PER_MINUTE = 150;

/** The width an action block wraps at when its template gives none. */
const FALLBACK_WIDTH = 60;

const NONE: Timing = Object.freeze({ spoken: 0, actionLines: 0 });

/** Words in a line of printed text: runs of letters or digits. */
export function wordsIn(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** The printed text of a line: its runs, without markers, notes, or the boneyard. */
function printedText(line: Block['lines'][number]): string {
  let text = '';
  for (const run of line.inline) text += run.text;
  return text;
}

/**
 * What one block adds: dialogue and lyric words are spoken (inline notes left out); an action
 * block's lines, each source line `ceil(columns / width)` at its resolved role's width, at least
 * 1; everything else nothing. The width is that of `resolveRole(template, block, null)`: no
 * built-in template has an `afterRole` rule, and one that did would time its action at the
 * unconditioned role's width, which is close enough for an estimate.
 */
export function blockTiming(block: Block, template: Template): Timing {
  if (block.kind === 'dialogue' || block.kind === 'lyric') {
    let spoken = 0;
    for (const line of block.lines) if (!line.transparent) spoken += wordsIn(printedText(line));
    return spoken === 0 ? NONE : { spoken, actionLines: 0 };
  }
  if (block.kind !== 'action') return NONE;
  const role = resolveRole(template, block, null);
  if (role === 'omit') return NONE;
  const width = Math.max(
    1,
    template.roles[role]?.width ?? template.roles.action?.width ?? FALLBACK_WIDTH,
  );
  let actionLines = 0;
  for (const line of block.lines) {
    if (line.transparent) continue;
    actionLines += Math.max(1, Math.ceil(printedText(line).length / width));
  }
  return actionLines === 0 ? NONE : { spoken: 0, actionLines };
}

export function addTiming(a: Timing, b: Timing): Timing {
  return { spoken: a.spoken + b.spoken, actionLines: a.actionLines + b.actionLines };
}

/** Seconds: `spoken / wordsPerMinute × 60 + actionLines × ACTION_SECONDS_PER_LINE`. */
export function estimateSeconds(t: Timing, wordsPerMinute: number): number {
  return (t.spoken / wordsPerMinute) * 60 + t.actionLines * ACTION_SECONDS_PER_LINE;
}
