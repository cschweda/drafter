import type { Block } from '@drafter/fountain';
import { resolveRole, type Template } from '@drafter/templates';

// Timing (out-the-door design §3.3): what a block adds to an estimate of the running time from
// the dialogue. Counted per block, from the text alone (no layout), so the scene index can add it
// up in the pass it already makes over each scene's blocks, and `countScript` over the whole parse.
//
// `TimingTally` adds blocks up in order, as the scene index and `countScript` walk them: it counts
// a pair of dual-dialogue speeches once (they're said at the same time), and keeps the words each
// speaker says (`spokenBy`), so a later per-character view (who speaks how long, and in which
// scenes) reads them from the scene index without counting again.

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

/** Blocks that print nothing, so a speech either side of them can still pair as dual dialogue. */
const QUIET = new Set<Block['kind']>(['note', 'boneyard', 'synopsis']);
/** What a speech is made of after its cue, as the layout groups it. */
const SPEECH_PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);

interface Speech {
  spoken: number;
  /** The speech it is beside, when it is the second (`^`) of a dual pair. */
  partner: Speech | null;
  /** In a dual pair already, either side, so no third `^` joins it. */
  paired: boolean;
}

/**
 * The timing of a run of blocks, added one at a time in order: what `blockTiming` gives each,
 * except that a dual-dialogue pair (a `^` cue's speech and the speech just before it) takes as
 * long as the longer of the two. A `^` pairs as the layout pairs it: with the speech before it
 * when nothing that prints comes between (notes, the boneyard, and synopses don't), and when that
 * speech isn't already in a pair; otherwise it prints on its own and counts in full. A speech is
 * its cue and the parts right after it, as the layout groups them: a quiet block ends it too, and
 * words after that are no one's. A section or
 * a page break parts them (the layout pairs across a screenplay's section, which prints nothing,
 * but a tally never runs across a section, so the scene index's units always add up).
 */
export class TimingTally {
  #spoken = 0;
  #actionLines = 0;
  /** The open speech: its cue has been added, and maybe some of its parts. */
  #speech: Speech | null = null;
  /** The last speech closed, while nothing that prints has come since. */
  #last: Speech | null = null;
  /** The speaker of the open speech, by the cue's name in capitals. */
  #speaker: string | null = null;
  readonly #spokenBy = new Map<string, number>();

  constructor(private readonly template: Template) {}

  add(block: Block): void {
    if (block.kind === 'character') {
      this.#close();
      const free = this.#last && !this.#last.paired ? this.#last : null;
      const partner = block.sem.dual ? free : null;
      if (partner) partner.paired = true;
      this.#speech = { spoken: 0, partner, paired: partner !== null };
      this.#speaker = block.sem.name.toUpperCase();
      this.#spokenBy.set(this.#speaker, this.#spokenBy.get(this.#speaker) ?? 0);
      return;
    }
    const timing = blockTiming(block, this.template);
    if (this.#speech && SPEECH_PARTS.has(block.kind) && adjacent(block)) {
      this.#speech.spoken += timing.spoken;
      this.#spoken += timing.spoken;
      const speaker = this.#speaker as string;
      this.#spokenBy.set(speaker, (this.#spokenBy.get(speaker) ?? 0) + timing.spoken);
      return;
    }
    // A quiet block ends a speech, as the layout ends one (what follows prints on its own), but
    // leaves it free to pair with a `^` after it.
    this.#close();
    if (QUIET.has(block.kind)) return;
    this.#last = null;
    this.#spoken += timing.spoken;
    this.#actionLines += timing.actionLines;
  }

  /** The timing so far, a pair counted once. */
  timing(): Timing {
    const open = this.#speech;
    const overlap = open?.partner ? Math.min(open.spoken, open.partner.spoken) : 0;
    return { spoken: this.#spoken - overlap, actionLines: this.#actionLines };
  }

  /** The words each speaker says, by the cue's name in capitals; both sides of a pair in full. */
  spokenBy(): ReadonlyMap<string, number> {
    return this.#spokenBy;
  }

  /** Ends the open speech: the shorter side of a pair comes off the total. */
  #close(): void {
    const speech = this.#speech;
    if (!speech) return;
    if (speech.partner) this.#spoken -= Math.min(speech.spoken, speech.partner.spoken);
    this.#last = speech;
    this.#speech = null;
    this.#speaker = null;
  }
}

/** No blank line between this block and the one before it (the layout's test for a speech's parts). */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;
