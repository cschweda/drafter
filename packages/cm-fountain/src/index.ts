export { fountainKeymap } from './bindings';
export {
  type ClassicElement,
  type ClassicKind,
  type ClassicOptions,
  classic,
  classicLine,
  elementAt,
  onlyClearedBlock,
} from './classic';
export { completionOverride, fountainCompletion, fountainCompletionSource } from './complete';
export { type CursorElement, cursorElement, onCursorElement } from './cursor';
export {
  blocked,
  canMakeParenthetical,
  type ElementKind,
  type ElementStructure,
  elementHint,
  elementStructure,
  elementTemplate,
  insertMark,
  insertPageBreak,
  MARK_REFUSED,
  makeElement,
  opensCompletion,
  PARENTHETICAL_HINT,
  readsAsName,
  SCREENPLAY_STRUCTURE,
  structureOf,
  withCompletion,
} from './elements';
export { fountainFolding } from './fold';
export { type FountainOptions, fountain } from './fountain';
export {
  fountainDecorations,
  fountainHighlighting,
  type LineMark,
  lineMarks,
} from './highlight';
export { barCue, cueMode, fountainInput } from './input';
export {
  convertToAction,
  convertToCharacter,
  forceKind,
  fountainEnter,
  fountainShiftTab,
  fountainTab,
  toggleDual,
  wrapInBold,
  wrapInBoneyard,
  wrapInItalic,
  wrapInNote,
  wrapInUnderline,
} from './keymap';
export { fountainLint, relint, toCodeMirror } from './lint';
export {
  invertSceneMoves,
  sceneIdAt,
  sceneIds,
  sceneMoved,
  sceneMovedEffect,
} from './scene-ids';
export {
  ignoreHere,
  invertSpellMarks,
  mapSpellMarks,
  restoreSpellMarks,
  type SpellMark,
  setSpellMarks,
  spellMarkAt,
  spellMarks,
  spellMarksKey,
  spellMarksOf,
  stepSpellMark,
  unmarkWord,
} from './spell';
export { appChange, parsedDoc } from './state';
