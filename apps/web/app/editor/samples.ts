import screenplay from '#samples/screenplay.fountain?raw';
import stagePlay from '#samples/stage-play.fountain?raw';

/** The text of the screenplay sample, which the editor starts on and a first visit saves as a script. */
export const SAMPLE_SCREENPLAY: string = screenplay;

/** The text of the stage-play sample, under Open → Samples. */
export const SAMPLE_STAGE_PLAY: string = stagePlay;

export type SampleKind = 'screenplay' | 'stage-play';

/** The samples, in the order the menus list them. */
export const SAMPLES: readonly { kind: SampleKind; name: string }[] = [
  { kind: 'screenplay', name: 'Screenplay' },
  { kind: 'stage-play', name: 'Stage play' },
];

export const SAMPLE_TEXT: Record<SampleKind, string> = {
  screenplay: SAMPLE_SCREENPLAY,
  'stage-play': SAMPLE_STAGE_PLAY,
};
