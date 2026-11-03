import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { completionOverride } from '../complete';
import {
  classicArrows,
  classicBackspace,
  classicCaret,
  classicDelete,
  classicEnd,
  classicHome,
  keepHiddenMarks,
} from './caret';
import { classicEnter, classicShiftEnter, classicShiftTab, classicTab } from './keys';
import { classicLine, keepLineInHistory } from './line';
import { classicMarks, settleBreaks, settleDeletes, tidyLeft } from './marks';
import { blockKeptClear, keepMetadata, metadataHidden } from './metadata';
import { acceptOffer, classicSay, classicSource, dismissOffer, offerWords } from './offer';
import { classicView } from './view';

export {
  classicArrows,
  classicBackspace,
  classicCaret,
  classicDelete,
  classicEnd,
  classicHome,
  keepHiddenMarks,
  passedOver,
} from './caret';
export { type HiddenSpan, hiddenSpans, visibleEnd, visibleStart } from './hidden';
export {
  choosePending,
  classicEnter,
  classicMove,
  classicShiftEnter,
  classicShiftTab,
  classicTab,
} from './keys';
export {
  type ClassicElement,
  type ClassicKind,
  classicEdit,
  classicLine,
  elementAt,
  lineKindAt,
  NEXT,
  type NextPlace,
  nextFrom,
  pendingAt,
  type StoredLine,
  setDismissed,
  setStored,
  WRITES,
} from './line';
export {
  classicMarks,
  MAX_RUN,
  readsAs,
  settleBreaks,
  settleDeletes,
  settleLine,
  shapeOf,
  tidyLeft,
} from './marks';
export { keepMetadata, metadataHidden, onlyClearedBlock, protectedRange } from './metadata';
export {
  acceptOffer,
  classicSay,
  classicSource,
  dismissOffer,
  type Offer,
  offerAt,
  placesRecent,
} from './offer';
export { classicView, lineClassOf, roleVariables } from './view';

/** At `Prec.highest`, ahead of `language`, as CodeMirror's completion keys are at that level too (§6). */
const classicKeys = Prec.highest(
  keymap.of([
    { key: 'Enter', run: (view) => acceptOffer(view) || classicEnter(view) },
    { key: 'Tab', run: (view) => acceptOffer(view) || classicTab(view) },
    { key: 'Escape', run: dismissOffer },
    { key: 'Shift-Tab', run: classicShiftTab },
    { key: 'Shift-Enter', run: classicShiftEnter },
    { key: 'ArrowUp', run: classicArrows[0] },
    { key: 'ArrowDown', run: classicArrows[1] },
    { key: 'Backspace', run: classicBackspace, shift: classicBackspace },
    { key: 'Delete', run: classicDelete },
    { mac: 'Ctrl-h', run: classicBackspace },
    { mac: 'Ctrl-d', run: classicDelete },
    { key: 'Home', mac: 'Cmd-ArrowLeft', run: classicHome },
    { mac: 'Ctrl-a', run: classicHome },
    { key: 'End', mac: 'Cmd-ArrowRight', run: classicEnd },
    { mac: 'Ctrl-e', run: classicEnd },
  ]),
);

export interface ClassicOptions {
  /** Told what to announce to a screen reader, in a sentence. */
  say?: (text: string) => void;
}

/** Classic Mode: Enter and Tab typing over plain Fountain. Each part is added here as it is built. */
export function classic({ say }: ClassicOptions = {}): Extension {
  // Filters run last to first: the caret reads what tidying left, and the block's backstop has the last word.
  return [
    classicKeys,
    completionOverride.of(classicSource),
    say ? classicSay.of(say) : [],
    offerWords,
    keepMetadata,
    classicCaret,
    settleBreaks,
    settleDeletes,
    keepHiddenMarks,
    classicMarks,
    tidyLeft,
    classicLine,
    keepLineInHistory,
    classicView,
    metadataHidden,
    blockKeptClear,
  ];
}
