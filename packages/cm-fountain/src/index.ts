export { fountainCompletion, fountainCompletionSource } from './complete';
export { type CursorElement, cursorElement, onCursorElement } from './cursor';
export {
  canMakeParenthetical,
  type ElementKind,
  insertPageBreak,
  makeElement,
  opensCompletion,
  withCompletion,
} from './elements';
export { fountainFolding } from './fold';
export { type FountainOptions, fountain } from './fountain';
export { fountainDecorations, fountainHighlighting } from './highlight';
export { cueMode, fountainInput } from './input';
export {
  convertToAction,
  convertToCharacter,
  forceKind,
  fountainEnter,
  fountainKeymap,
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
export { parsedDoc } from './state';
