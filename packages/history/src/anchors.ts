import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { templateOf } from './print';

/**
 * A line a diff's groups start at, and its title: `@drafter/compare`'s `Anchor`, which this
 * package doesn't depend on (the shapes are the same, so either passes for the other).
 */
export interface Anchor {
  /** The line, 0-based, counting `\r\n` and `\n` as one line break each. */
  line: number;
  title: string;
}

/** The scene-heading lines of `text` (a play's `##` scenes included), for `groupRows`. */
export function sceneAnchors(text: string): Anchor[] {
  const doc = parse(text);
  const anchors: Anchor[] = [];
  let line = 0;
  let from = 0;
  for (const scene of sceneIndex(doc, templateOf(doc)).scenes) {
    for (let i = from; i < scene.span.from; i++) if (text.charCodeAt(i) === 10) line++;
    from = scene.span.from;
    anchors.push({ line, title: scene.heading });
  }
  return anchors;
}
