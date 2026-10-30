import type { Block, Doc, InlineRun } from '@drafter/fountain';
import type { SceneIndex } from '@drafter/outline';
import { matchNames, type NameMap } from './names';

// Who is in each scene (seeing-the-script design §3.2): who speaks in it, from the scene index's
// speeches, and whose name is in its action, from one scan of each action block's printed text.

/**
 * The spell worker's answer for a name: true when every word of it, lowercased, is a dictionary
 * word; undefined while it isn't known, which reads as true (only capitals count, Call 7).
 */
export type IsWord = (name: string) => boolean | undefined;

/** One character in one scene. */
export interface Presence {
  /** The scene's index in `index.scenes`. */
  scene: number;
  speaking: boolean;
  speeches: number;
  /** Their words spoken in the scene: both sides of a dual pair in full, and lyrics. */
  words: number;
  /** Where their name is first in the scene's action, as an offset in the source; null when it isn't. */
  firstMention: number | null;
}

/** Each scene's blocks after its heading, as `[from, to)` block indexes, up to the next scene or section. */
export function sceneBlocks(index: SceneIndex, doc: Doc): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const { items } = index;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind !== 'scene') continue;
    out.push([item.block + 1, items[i + 1]?.block ?? doc.blocks.length]);
  }
  return out;
}

/** The printed text of an action block, its lines joined by `\n`, and the runs each part came from. */
function printed(block: Block): { text: string; runs: Array<{ at: number; run: InlineRun }> } {
  let text = '';
  const runs: Array<{ at: number; run: InlineRun }> = [];
  for (const line of block.lines) {
    if (line.transparent) continue;
    if (text !== '') text += '\n';
    for (const run of line.inline) {
      runs.push({ at: text.length, run });
      text += run.text;
    }
  }
  return { text, runs };
}

/** The source offset of `at` in a block's printed text: a binary search of its runs. */
function sourceOffset(runs: ReadonlyArray<{ at: number; run: InlineRun }>, at: number): number {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((runs[mid] as { at: number }).at <= at) lo = mid;
    else hi = mid - 1;
  }
  const found = runs[lo];
  return found ? found.run.span.from + (at - found.at) : 0;
}

/**
 * Where each character named in the action of blocks `[from, to)` is first named: by their
 * place in the list `names` was made from. Only action counts (a play's stage directions are
 * action blocks too): never dialogue, a parenthetical, a heading, a transition, a note, a
 * synopsis, or the boneyard, and an inline note's text isn't printed.
 */
export function mentions(doc: Doc, from: number, to: number, names: NameMap): Map<number, number> {
  const first = new Map<number, number>();
  for (let b = from; b < to; b++) {
    const block = doc.blocks[b];
    if (block?.kind !== 'action') continue;
    const { text, runs } = printed(block);
    matchNames(text, names, (character, at) => {
      if (!first.has(character)) first.set(character, sourceOffset(runs, at));
    });
  }
  return first;
}
