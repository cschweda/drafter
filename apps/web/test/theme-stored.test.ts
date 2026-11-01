import { afterEach, describe, expect, test, vi } from 'vitest';

// Whether a theme was stored when the page opened (fresh-look design §9): read once, before the
// color mode stores its own, and false when localStorage can't be read.
describe('themeWasStored', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(get: (key: string) => string | null) {
    vi.stubGlobal('window', { localStorage: { getItem: get } });
    return import('../app/settings/theme-stored');
  }

  test('is what was there when it was noted, not what came after', async () => {
    let value: string | null = null;
    const { noteThemeStored, themeWasStored } = await load(() => value);
    noteThemeStored();
    value = 'dark';
    expect(themeWasStored()).toBe(false);
  });

  test('notices a stored theme', async () => {
    const { noteThemeStored, themeWasStored } = await load((key) =>
      key === 'nuxt-color-mode' ? 'light' : null,
    );
    noteThemeStored();
    expect(themeWasStored()).toBe(true);
  });

  test('is false when localStorage throws', async () => {
    const { themeWasStored } = await load(() => {
      throw new Error('blocked');
    });
    expect(themeWasStored()).toBe(false);
  });
});
