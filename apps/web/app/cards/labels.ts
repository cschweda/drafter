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
