import { SAMPLES, type SampleKind } from './sample-kinds';
import markdown from './sample-scripts/markdown.md?raw';
import screenplay from './sample-scripts/screenplay.fountain?raw';
import stagePlay from './sample-scripts/stage-play.fountain?raw';

// Help → Sample scripts: a tiny, original sample of each kind (the US screenplay, the stage play,
// and a Markdown document), each under a page. The screenplay has every Fountain element once; the
// stage play its acts, scenes, cues, and stage directions; the Markdown document its main marks.
// Opening one makes a new script of the writer's own, with no file (as New screenplay from this
// outline does); the annotated samples of File → Open sample, and the first New of each kind, are
// another thing (`samples.ts`, `storage/first-samples.ts`) and are left as they are.

export interface SampleScript {
  kind: SampleKind;
  name: string;
  text: string;
}

const TEXT: Record<SampleKind, string> = {
  screenplay,
  'stage-play': stagePlay,
  markdown,
};

/** The sample scripts, in the menus' order (the samples' kinds). */
export const SAMPLE_SCRIPTS: readonly SampleScript[] = SAMPLES.map((sample) => ({
  ...sample,
  text: TEXT[sample.kind],
}));
