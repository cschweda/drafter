import type { Block, Doc } from '@drafter/fountain';
import type { Speech } from '@drafter/outline';

// A character's lines on their Scaffold page (seeing-the-script design §5.3): each speech's printed
// text, read from the parse at its cue. A speech is its cue and the parentheticals, dialogue, and
// lyrics right after it, as the layout groups them (no blank line between); notes and the boneyard
// don't print, so they are left out. Only text is read here: the speeches and their words are the
// scene index's.

/** A speech's printed text, for the character page's Lines, and the cue's block it goes to. */
export interface SpokenLine {
  /** The scene it is in, by index; null before the first scene or in a section's own stretch. */
  scene: number | null;
  block: number;
  /** The speech's printed text, parentheticals in their parentheses, on one line. */
  text: string;
}

const PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);

/** No blank line between this block and the one before it. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

/** The printed text of a block's lines, without notes, the boneyard, or emphasis markers. */
function printed(block: Block): string[] {
  const out: string[] = [];
  for (const line of block.lines) {
    if (line.transparent) continue;
    let text = '';
    for (const run of line.inline) text += run.text;
    out.push(text);
  }
  return out;
}

/** The lines of `speeches`, in their order; each one's `scene` is kept, when it has one. */
export function linesOf(
  doc: Doc,
  speeches: ReadonlyArray<Speech & { scene?: number | null }>,
): SpokenLine[] {
  return speeches.map((speech) => {
    const parts: string[] = [];
    for (let b = speech.block + 1; b < doc.blocks.length; b++) {
      const block = doc.blocks[b] as Block;
      if (!PARTS.has(block.kind) || !adjacent(block)) break;
      parts.push(...printed(block));
    }
    // A note taken out of the middle of a line leaves two spaces.
    const text = parts.join(' ').split(/\s+/).filter(Boolean).join(' ');
    return { scene: speech.scene ?? null, block: speech.block, text };
  });
}
