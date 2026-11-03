import { SCREENPLAY_STRUCTURE } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import { nextTick, ref, shallowRef, watch } from 'vue';
import { announcedWord, announcer, type ElementMove } from '../app/editor/element-announcer';

// The live region's words (Classic Mode design §12): a change of element is said, and a key that
// moves says where it went even when the word is the same.

function setup(first = '') {
  const word = ref(first);
  const moved = shallowRef<ElementMove | null>(null);
  const mode = ref<'fountain' | 'classic'>('fountain');
  const said = announcer(
    () => word.value,
    () => moved.value,
    () => mode.value,
  );
  return { word, moved, mode, said };
}

/** Every state the region goes through, flush by flush. */
async function settle() {
  await nextTick();
  await nextTick();
}

describe('the element announcer', () => {
  test('says a new element', async () => {
    const { word, said } = setup('Action');
    word.value = 'Character';
    await settle();
    expect(said.value).toBe('Character');
  });

  test('Fountain Mode’s announcer says nothing on a blank line', () => {
    // The cursor's element is null on a blank line in Fountain Mode, whatever Classic would say.
    const pending = {
      kind: 'action',
      pending: true,
      soft: true,
      enter: 'chooser',
      tab: 'character',
    } as const;
    expect(announcedWord(false, pending, null, SCREENPLAY_STRUCTURE)).toBe('');
    expect(announcedWord(false, null, 'dialogue', SCREENPLAY_STRUCTURE)).toBe('Dialogue');
    expect(announcedWord(true, pending, null, SCREENPLAY_STRUCTURE)).toBe('Action');
    expect(announcedWord(true, null, 'dialogue', SCREENPLAY_STRUCTURE)).toBe('');
  });

  test('a word that empties leaves the region empty', async () => {
    const { word, said } = setup('Action');
    word.value = 'Dialogue';
    await settle();
    word.value = '';
    await settle();
    expect(said.value).toBe('');
  });

  test('the same word is said twice', async () => {
    const { word, moved, said } = setup('Action');
    word.value = 'Action';
    moved.value = { said: false };
    await settle();
    expect(said.value).toBe('Action');
    moved.value = { said: false };
    await nextTick();
    expect(said.value).toBe(''); // the region is cleared, so that the word is new to it
    await nextTick();
    expect(said.value).toBe('Action');
  });

  test('a move to the same word with no key says nothing', async () => {
    const { word, said } = setup('Action');
    word.value = 'Action';
    await settle();
    expect(said.value).toBe('');
  });

  test('a move that was said already isn’t said again, and the next change is', async () => {
    const { word, moved, said } = setup('Character');
    word.value = 'Dialogue';
    moved.value = { said: true };
    await settle();
    expect(said.value).toBe('');
    word.value = 'Character';
    await settle();
    expect(said.value).toBe('Character');
  });

  test('two keys at once say only the last place', async () => {
    const { word, moved, said } = setup('Action');
    moved.value = { said: false };
    await nextTick();
    word.value = 'Character';
    moved.value = { said: false };
    await settle();
    expect(said.value).toBe('Character');
  });

  test('a switch’s own change of element says nothing, and the next move does', async () => {
    const { word, moved, mode, said } = setup('');
    mode.value = 'classic';
    word.value = 'Action';
    await settle();
    expect(said.value).toBe('');
    moved.value = { said: false };
    await settle();
    expect(said.value).toBe('Action');
  });

  test('a word that a watcher of the switch changes later in the flush says nothing', async () => {
    const { word, mode, said } = setup('Action');
    // As the settings' watcher reconfigures the editor for a switch made in Settings.
    watch(mode, () => {
      word.value = 'Character';
    });
    mode.value = 'classic';
    await settle();
    expect(said.value).toBe(''); // Character was left unsaid
    word.value = 'Dialogue';
    await settle();
    expect(said.value).toBe('Dialogue');
  });
});
