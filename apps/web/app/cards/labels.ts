import type { Block, Doc } from '@drafter/fountain';
import type { Scene } from '@drafter/outline';
import { colorName, lengthWords, sceneNumber } from '../outline/labels';

// What a card is called, on screen and to a screen reader (Phase 2 design §7).

/** A card's name: "Scene 12, INT. KITCHEN - NIGHT, blue, 1 3/8 pages". */
export function cardName(scene: Scene): string {
  const parts = [`Scene ${sceneNumber(scene)}`, scene.heading || 'Untitled scene'];
  if (scene.color) parts.push(colorName(scene.color.value));
  if (scene.pages) parts.push(lengthWords(scene.pages.eighths));
  return parts.join(', ');
}

/** A block's first line that prints something, as printed (marks, notes, and boneyard removed). */
function firstPrinted(block: Block): string | null {
  for (const line of block.lines) {
    if (line.transparent) continue;
    const text = line.inline
      .map((run) => run.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
  }
  return null;
}

/**
 * What a card without a synopsis shows (fresh-look design §5), so no card is an empty box: the
 * scene's first line of action, or else its first speech ("BOB: Hi."), or null for a scene with
 * neither.
 */
export function cardPreview(doc: Doc, scene: Scene): string | null {
  let speech: string | null = null;
  let speaker: string | null = null;
  for (let i = scene.block + 1; i < doc.blocks.length; i++) {
    const block = doc.blocks[i] as Block;
    if (block.span.from >= scene.span.to) break;
    if (block.kind === 'action') {
      const text = firstPrinted(block);
      if (text) return text;
    } else if (block.kind === 'character') {
      speaker = block.sem.name;
    } else if (block.kind === 'dialogue' && speech === null && speaker) {
      const text = firstPrinted(block);
      if (text) speech = `${speaker}: ${text}`;
    }
  }
  return speech;
}
