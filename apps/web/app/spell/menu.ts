import type { EditorView } from '@codemirror/view';
import { type SpellMark, spellMarkAt } from '@drafter/cm-fountain';
import { type Ref, shallowRef } from 'vue';

// The spelling menu (Phase 2 design §12; Plan D, Calls 11, 12, and 19): opened on a marked word by
// a right-click, Spelling suggestions (Mod-.), or the phone's Spelling button. `SpellMenu.vue`
// draws it where the request says, with what `menu-items.ts` says is in it. This module imports
// nothing of the app's, so the editor's extensions can use it.

export interface SpellMenuRequest {
  mark: SpellMark;
  /** Where to open: under the word, or by the phone's button. Viewport coordinates. */
  at: { left: number; top: number };
}

/** The menu wanted now, or null. Each request is a new object, so the same word opens it again. */
export const spellMenu: Ref<SpellMenuRequest | null> = shallowRef(null);

/** Under the word's first character, or the editor's corner if it isn't drawn. */
function placeOf(view: EditorView, mark: SpellMark): { left: number; top: number } {
  const coords = view.coordsAtPos(mark.from, 1);
  if (coords) return { left: coords.left, top: coords.bottom };
  const box = view.contentDOM.getBoundingClientRect();
  return { left: box.left, top: box.top };
}

/** Opens the menu on `mark`. */
export function openSpellMenuOn(
  view: EditorView,
  mark: SpellMark,
  at?: { left: number; top: number },
): void {
  spellMenu.value = { mark, at: at ?? placeOf(view, mark) };
}

/** Opens the menu on the mark at the cursor; false when there is none there. */
export function openSpellMenu(view: EditorView, at?: { left: number; top: number }): boolean {
  const mark = spellMarkAt(view.state, view.state.selection.main.head);
  if (!mark) return false;
  openSpellMenuOn(view, mark, at);
  return true;
}

/**
 * A right-click (Call 12): on a marked word, the browser's menu is kept away and Drafter's opens;
 * anywhere else nothing happens here, and the browser's (or the desktop app's) menu opens as it
 * always has. True when it opened Drafter's (or will, below).
 *
 * Where the menu comes with the button still down (macOS and Linux; Windows waits for its release),
 * it opens once the button is let go: a menu that opened under the pointer would otherwise take
 * the release for a choice of the item there.
 */
export function onSpellContextMenu(event: MouseEvent, view: EditorView): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const drawn = target?.closest('.cm-misspelled');
  if (!drawn || !view.contentDOM.contains(drawn)) return false;
  const mark = spellMarkAt(view.state, view.posAtDOM(drawn, 0));
  if (!mark) return false;
  event.preventDefault();
  if ((event.buttons & 2) === 0) {
    openSpellMenuOn(view, mark);
    return true;
  }
  const released = () => {
    window.removeEventListener('pointerup', released, true);
    window.removeEventListener('pointercancel', released, true);
    openSpellMenuOn(view, mark);
  };
  window.addEventListener('pointerup', released, true);
  window.addEventListener('pointercancel', released, true);
  return true;
}
