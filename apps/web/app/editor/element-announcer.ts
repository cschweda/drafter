import { nextTick, type Ref, ref, watch } from 'vue';

/** A key that moved the writer on; `said` when Classic Mode has already said where to. */
export interface ElementMove {
  said: boolean;
}

/**
 * What the element announcer's live region holds. A change of `word` is said; a key that moves says
 * where it went even when the word is the same (Classic Mode design §12), by clearing the region
 * first, as a live region says nothing when its text stays what it was. Fountain Mode has no moves.
 */
export function announcer(word: () => string, moved: () => ElementMove | null): Ref<string> {
  const said = ref('');
  let turn = 0;
  watch([word, moved], async ([now, move], [, before]) => {
    const mine = ++turn;
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
