import type { KeyBinding } from '@codemirror/view';
import { makeElement } from './elements';
import {
  FORCED_KINDS,
  fountainEnter,
  fountainShiftTab,
  fountainTab,
  toggleDual,
  wrapInBoneyard,
  wrapInNote,
} from './keymap';

/**
 * Enter, Tab, Shift-Tab, Mod-Alt-1…7 to make a line a heading, action, a cue, a parenthetical, a
 * transition, centered text, or a lyric, Mod-Shift-d, Mod-/, and Mod-Shift-/. Mod-Alt-1…7 run the
 * element bar's commands (`makeElement`), natural Fountain with a mark only where it's needed
 * (decided 2026-10-27); `forceKind`, which always adds the mark, has no key. Save keys belong to
 * the app. No binding sets `preventDefault`, so a command that returns false leaves its key to the
 * browser.
 */
export const fountainKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: fountainEnter },
  { key: 'Tab', run: fountainTab },
  { key: 'Shift-Tab', run: fountainShiftTab },
  ...FORCED_KINDS.map((kind, i) => ({ key: `Mod-Alt-${i + 1}`, run: makeElement(kind) })),
  { key: 'Mod-Shift-d', run: toggleDual },
  { key: 'Mod-/', run: wrapInNote },
  { key: 'Mod-Shift-/', run: wrapInBoneyard },
];
