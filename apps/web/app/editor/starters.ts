import guidedScreenplay from './sample-scripts/guided-screenplay.fountain?raw';
import guidedStagePlay from './sample-scripts/guided-stage-play.fountain?raw';
import { STARTER_KINDS, type StarterData, type StarterKind } from './starter-kinds';

// The guided starters (out-the-door design §1): a short screenplay and a short stage play whose
// notes teach each element just above them, its element-bar button, and its Fountain mark, then
// leave a scene for the writer to write. Opened from File's New items and Help → Sample scripts as
// a new, unchanged script of the writer's own, marked `starter` (`Project.starter`). Not the
// annotated samples (`samples.ts`) nor Help's tiny sample scripts (`sample-scripts.ts`).

export type { StarterKind } from './starter-kinds';

export interface Starter extends StarterData {
  text: string;
}

const TEXT: Record<StarterKind, string> = {
  screenplay: guidedScreenplay,
  'stage-play': guidedStagePlay,
};

/** The starters, in the menus' order. */
export const STARTERS: readonly Starter[] = STARTER_KINDS.map((data) => ({
  ...data,
  text: TEXT[data.kind],
}));

/**
 * Every "the X button" a starter's notes name, in order, X as written: a capitalized word,
 * and a second in lower case for a two-word label (`Page break`, `Stage direction`).
 */
export function buttonsNamed(text: string): string[] {
  return [...text.matchAll(/\b[Tt]he ([A-Z][a-z]*(?: [a-z]+)?) button\b/g)].map(
    (match) => match[1] as string,
  );
}
