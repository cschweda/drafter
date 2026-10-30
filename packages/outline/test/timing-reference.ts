// The timing tally as v0.19.0 shipped it, before it recorded speeches: the reference that
// `timing is unchanged by recording speeches` holds the new one to.
import type { Block } from '@drafter/fountain';
import type { Template } from '@drafter/templates';
import { blockTiming, type Timing } from '../src';

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
export class ReferenceTally {
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
