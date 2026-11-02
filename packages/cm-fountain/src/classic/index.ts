import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { classicEnter, classicShiftEnter, classicShiftTab, classicTab } from './keys';
import { classicLine } from './line';
import { classicMarks, tidyLeft } from './marks';

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
export { classicMarks, MAX_RUN, readsAs, settleLine, shapeOf, tidyLeft } from './marks';

/** At `Prec.highest`, ahead of `language`, as CodeMirror's completion keys are at that level too (§6). */
const classicKeys = Prec.highest(
  keymap.of([
    { key: 'Enter', run: classicEnter },
    { key: 'Tab', run: classicTab },
    { key: 'Shift-Tab', run: classicShiftTab },
    { key: 'Shift-Enter', run: classicShiftEnter },
  ]),
);

export interface ClassicOptions {
  /** Told what to announce to a screen reader, in a sentence. */
  say?: (text: string) => void;
}

/** Classic Mode: Enter and Tab typing over plain Fountain. Each part is added here as it is built. */
export function classic(_options: ClassicOptions = {}): Extension {
  return [classicKeys, classicMarks, tidyLeft, classicLine];
}
