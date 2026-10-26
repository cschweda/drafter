import { parse } from '@drafter/fountain';

/**
 * Where the first scene heading of `source` starts, as an offset into the text; 0 when it has
 * none (a title page and an outline can come first, so this is not simply the first line). The
 * first visit puts the cursor there, derived from the parsed sample so editing the sample file
 * can't leave it pointing at a line that is no longer the heading.
 */
export function firstSceneStart(source: string): number {
  for (const block of parse(source).blocks) {
    if (block.kind === 'scene_heading') return Math.min(block.span.from, source.length);
  }
  return 0;
}
