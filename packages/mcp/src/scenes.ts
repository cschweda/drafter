// Naming a scene (§3): by its place in order (counting from 1, as Story map numbers scenes), by
// its written scene number (`7A`, from `#7A#`), or by words from its heading. Order comes first,
// then written numbers, then heading words. A Markdown document's sections are its scenes.
import type { Loaded } from './load';
import { Refusal } from './paths';

export type SceneFound = { scene: number } | { matches: Array<{ scene: number; heading: string }> };

/** The most scenes a reference that matches several gives back. */
export const MAX_MATCHES = 20;

/** Each scene's heading (a document's section titles) and written number, in order. */
export function headingsOf(loaded: Loaded): Array<{ heading: string; number: string | null }> {
  return loaded.kind === 'script'
    ? loaded.index.scenes.map((scene) => ({ heading: scene.heading.trim(), number: scene.number }))
    : loaded.sections.map((section) => ({ heading: section.title, number: null }));
}

/** The words of a text, case-folded: runs of letters, marks, and digits. */
export function wordsOf(text: string): string[] {
  return text.toLocaleLowerCase('und').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** "This script has 3 scenes." or "This document has 1 section." */
export function countSentence(loaded: Loaded, count: number): string {
  return loaded.kind === 'script'
    ? `This script has ${count} ${count === 1 ? 'scene' : 'scenes'}.`
    : `This document has ${count} ${count === 1 ? 'section' : 'sections'}.`;
}

/** The scene (1-based) a reference names, or the scenes it could mean; a Refusal when none. */
export function findScene(loaded: Loaded, ref: string): SceneFound {
  const given = ref.trim();
  const scenes = headingsOf(loaded);
  const count = scenes.length;

  if (/^\d+$/.test(given)) {
    const n = Number(given);
    if (n >= 1 && n <= count) return { scene: n };
  }

  const written = given
    .replace(/^#(.*)#$/, '$1')
    .trim()
    .toLocaleLowerCase('und');
  if (written !== '') {
    const at = scenes.findIndex(
      (scene) => scene.number !== null && scene.number.trim().toLocaleLowerCase('und') === written,
    );
    if (at >= 0) return { scene: at + 1 };
  }

  const wanted = wordsOf(given);
  if (wanted.length > 0) {
    const matches: Array<{ scene: number; heading: string }> = [];
    let found = 0;
    scenes.forEach((scene, i) => {
      const have = new Set(wordsOf(scene.heading));
      if (!wanted.every((word) => have.has(word))) return;
      found++;
      if (matches.length < MAX_MATCHES) matches.push({ scene: i + 1, heading: scene.heading });
    });
    if (found === 1) return { scene: (matches[0] as { scene: number }).scene };
    if (found > 1) return { matches };
  }

  throw new Refusal(`There’s no scene ${given}. ${countSentence(loaded, count)}`);
}

/** findScene, with several matches a Refusal that carries them. */
export function oneScene(loaded: Loaded, ref: string): number {
  const found = findScene(loaded, ref);
  if ('scene' in found) return found.scene;
  const refusal = new Refusal(
    `More than one scene matches “${ref.trim()}”. Name one by its number.`,
  );
  refusal.matches = found.matches;
  throw refusal;
}
