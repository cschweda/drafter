// Moved to @drafter/notes in Plan B; re-exported so what v0.11.0 exported still is.
export {
  bodyEnd,
  hasStrayBoneyard,
  lineBreakOf,
  readKeyedNote,
  SCENE_COLORS,
  type SceneColor,
} from '@drafter/notes';
export { expandOutline, STAGE_STUB, STUB_HEADING, scriptFromMarkdown } from './expand';
export { type SceneDetails, setColor, setSceneDetails, setSynopsis } from './header';
export { type ScriptMarkdownOptions, scriptMarkdown } from './markdown';
export {
  downTarget,
  type Move,
  type MoveTarget,
  moveItem,
  targetAfterRow,
  targetBefore,
  upTarget,
} from './move';
export { sceneIndex, startsScene } from './scene-index';
export {
  linesPerPage,
  type RulerMark,
  rulerMarks,
  STRIP_DEPTHS,
  type Strip,
  type StripBlock,
  type StripRow,
  structureStrip,
} from './strip';
export {
  ACTION_SECONDS_PER_LINE,
  addTiming,
  blockTiming,
  DEFAULT_WORDS_PER_MINUTE,
  estimateSeconds,
  type TalliedSpeech,
  type Timing,
  TimingTally,
} from './timing';
export { markdownText, treatment } from './treatment';
export type {
  Opening,
  OutlineItem,
  OutlineNode,
  Scene,
  SceneIndex,
  ScenePages,
  Section,
  Speech,
  Synopsis,
} from './types';
