import markdown from '#samples/markdown.md?raw';
import screenplay from '#samples/screenplay.fountain?raw';
import stagePlay from '#samples/stage-play.fountain?raw';
import type { SampleKind } from './sample-kinds';

export { SAMPLES, type SampleKind } from './sample-kinds';

/** The text of the screenplay sample, which the editor starts on and a first visit saves as a script. */
export const SAMPLE_SCREENPLAY: string = screenplay;

/** The text of the stage-play sample, under Open → Samples. */
export const SAMPLE_STAGE_PLAY: string = stagePlay;

/** The text of the Markdown sample, under Open → Samples: what Markdown is for in Drafter, shown in Markdown. */
export const SAMPLE_MARKDOWN: string = markdown;

export const SAMPLE_TEXT: Record<SampleKind, string> = {
  screenplay: SAMPLE_SCREENPLAY,
  'stage-play': SAMPLE_STAGE_PLAY,
  markdown: SAMPLE_MARKDOWN,
};
