import { describe, expect, test } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import { announcer, type ElementMove } from '../app/editor/element-announcer';

// The live region's words (Classic Mode design §12): a change of element is said, and a key that
// moves says where it went even when the word is the same.

function setup(first = '') {
  const word = ref(first);
  const moved = shallowRef<ElementMove | null>(null);
  const said = announcer(
    () => word.value,
    () => moved.value,
  );
  return { word, moved, said };
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

  test('Fountain Mode’s announcer says nothing on a blank line', async () => {
    // In Fountain Mode the word is the cursor's element's, and a blank line has none.
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
});
