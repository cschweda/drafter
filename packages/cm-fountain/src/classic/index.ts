import { type Extension, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { completionOverride } from '../complete';
import { FORCED_KINDS } from '../keymap';
import {
  classicArrows,
  classicBackspace,
  classicCaret,
  classicDelete,
  classicEnd,
  classicHome,
  keepHiddenMarks,
} from './caret';
import { classicChooser, pendingElementKey } from './chooser';
import { afterComposition, classicComposition } from './compose';
import {
  classicEnter,
  classicShiftEnter,
  classicShiftTab,
  classicTab,
  typeOffPageBreak,
} from './keys';
import { classicLine, keepLineInHistory, typedLine } from './line';
import {
  classicMarks,
  keepActionAbove,
  settleBreaks,
  settleDeletes,
  settlePaste,
  tidyLeft,
} from './marks';
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
  selectionClear,
} from './caret';
export {
  type ChooserItem,
  chooserItems,
  classicChooser,
  elementCommand,
  openChooser,
} from './chooser';
export {
  afterComposition,
  COMPOSITION_CHECK_MS,
  classicComposition,
  classicNext,
  settledComposition,
  whenComposed,
} from './compose';
export {
  type HiddenSpan,
  hiddenSpans,
  isBlankScript,
  visibleEnd,
  visibleStart,
} from './hidden';
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
  savedText,
  settleBreaks,
  settleDeletes,
  settleLine,
  settlePaste,
  shapeOf,
  tidiedSpeech,
  tidyLeft,
} from './marks';
export {
  keepMetadata,
  metadataHidden,
  metadataKept,
  onlyClearedBlock,
  protectedRange,
} from './metadata';
export {
  acceptOffer,
  classicMoveBy,
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
    // An input method's composition ends first, and is settled, so Enter goes on from what it wrote (§10).
    { key: 'Enter', run: afterComposition((view) => acceptOffer(view) || classicEnter(view)) },
    { key: 'Tab', run: afterComposition((view) => acceptOffer(view) || classicTab(view)) },
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
    // With a line of text these are false, and Fountain's key runs, with its hints and its list.
    ...FORCED_KINDS.map((kind, i) => ({
      key: `Mod-Alt-${i + 1}`,
      run: pendingElementKey(kind),
    })),
  ]),
);

/**
 * Shift+Alt+M on a Mac turns Tab focus mode on and off (§12), as Ctrl+M does elsewhere through
 * `defaultKeymap`. CodeMirror's own Mac binding, `Shift-Alt-m`, is matched against the letter the
 * key types, and on a Mac Option+Shift+M types one ("Â" on a US layout), so it never runs: the key
 * is read here by where it is on the keyboard instead. The platform test is CodeMirror's.
 */
const tabFocusKey = Prec.highest(
  EditorView.domEventHandlers({
    keydown(event, view) {
      const mac = /Mac/.test(navigator.platform) || /iP(hone|ad|od)/.test(navigator.platform);
      if (!mac || event.code !== 'KeyM' || !event.altKey || !event.shiftKey) return false;
      if (event.ctrlKey || event.metaKey || event.isComposing) return false;
      view.setTabFocusMode();
      return true;
    },
  }),
);

/**
 * The text box's name says the mode, and it points at how to leave it (§12), as Tab doesn't. The
 * app's page holds the words, at this id. First in the list wins, so `classic()` goes ahead of the
 * editor's own attributes.
 */
const classicAttributes = EditorView.contentAttributes.of({
  'aria-label': 'Source, Classic Mode',
  'aria-describedby': 'classic-leave',
});

export interface ClassicOptions {
  /** Told what to announce to a screen reader, in a sentence. */
  say?: (text: string) => void;
}

/** Classic Mode: Enter and Tab typing over plain Fountain. Each part is added here as it is built. */
export function classic({ say }: ClassicOptions = {}): Extension {
  // Filters run last to first: the caret reads what tidying left, and the block's backstop has the last word.
  return [
    classicAttributes,
    classicChooser,
    classicKeys,
    tabFocusKey,
    classicComposition,
    completionOverride.of(classicSource),
    say ? classicSay.of(say) : [],
    offerWords,
    keepMetadata,
    classicCaret,
    settleBreaks,
    settleDeletes,
    keepHiddenMarks,
    classicMarks,
    keepActionAbove,
    settlePaste,
    typeOffPageBreak,
    tidyLeft,
    classicLine,
    typedLine,
    keepLineInHistory,
    classicView,
    metadataHidden,
    blockKeptClear,
  ];
}
