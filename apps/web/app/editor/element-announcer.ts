import type { ClassicElement, CursorElement, ElementStructure } from '@drafter/cm-fountain';
import { nextTick, type Ref, ref, watch } from 'vue';
import { classicElementName, ELEMENT_NAMES } from './element-names';

/** A key that moved the writer on; `said` when Classic Mode has already said where to. */
export interface ElementMove {
  said: boolean;
}

/**
 * The word for the cursor's place: in Classic Mode the element, a pending one included; in Fountain
 * Mode the cursor's element, and nothing on a blank line, as before Classic Mode.
 */
export function announcedWord(
  classic: boolean,
  element: ClassicElement | null,
  cursorKind: CursorElement['kind'] | null,
  structure: ElementStructure,
): string {
  if (classic) return element ? classicElementName(element, structure) : '';
  return cursorKind ? ELEMENT_NAMES[cursorKind] : '';
}

/**
 * What the element announcer's live region holds. A change of `word` is said; a key that moves says
 * where it went even when the word is the same (Classic Mode design §12), by clearing the region
 * first, as a live region says nothing when its text stays what it was. Fountain Mode has no moves.
 * A switch of `mode` says its own words, so the change of element it makes is left unsaid, to the
 * end of the flush it's in: the next move says where the writer is.
 */
export function announcer(
  word: () => string,
  moved: () => ElementMove | null,
  mode: () => string,
): Ref<string> {
  const said = ref('');
  let turn = 0;
  let switching = false;
  watch([word, moved, mode], async ([now, move, kind], [, before, was]) => {
    const mine = ++turn;
    if (kind !== was) {
      switching = true;
      await nextTick();
      switching = false;
      return;
    }
    if (switching && move === before) return;
    if (move === before) {
      said.value = now;
      return;
    }
    said.value = '';
    if (move?.said) return;
    await nextTick();
    if (mine === turn) said.value = word();
  });
  return said;
}
