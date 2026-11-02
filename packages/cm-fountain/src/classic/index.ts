import type { Extension } from '@codemirror/state';
import { classicLine } from './line';
import { classicMarks } from './marks';

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
} from './line';
export { classicMarks, MAX_RUN, readsAs, settleLine, shapeOf } from './marks';

export interface ClassicOptions {
  /** Told what to announce to a screen reader, in a sentence. */
  say?: (text: string) => void;
}

/** Classic Mode: Enter and Tab typing over plain Fountain. Each part is added here as it is built. */
export function classic(_options: ClassicOptions = {}): Extension {
  return [classicMarks, classicLine];
}
