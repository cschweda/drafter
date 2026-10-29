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
export { setColor, setSynopsis } from './header';
export {
  downTarget,
  type Move,
  type MoveTarget,
  moveItem,
  targetAfterRow,
  upTarget,
} from './move';
export { sceneIndex, startsScene } from './scene-index';
export { markdownText, treatment } from './treatment';
export type {
  OutlineItem,
  OutlineNode,
  Scene,
  SceneIndex,
  ScenePages,
  Section,
  Synopsis,
} from './types';
