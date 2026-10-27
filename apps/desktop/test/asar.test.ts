import { describe, expect, test } from 'vitest';
import { checkListing } from '../scripts/check-asar.mjs';

const GOOD = [
  '/dist',
  '/dist/main.cjs',
  '/dist/preload.cjs',
  '/package.json',
  '/web',
  '/web/index.html',
  '/web/_headers',
  '/web/_nuxt/entry.abc.js',
  '/web/docs/saving/index.html',
];

describe('checkListing', () => {
  test('accepts the app as packaged', () => {
    expect(checkListing(GOOD)).toEqual([]);
  });

  test('wants the bundles, the web build, and package.json', () => {
    expect(checkListing(['/web/index.html']).join('\n')).toMatch(/missing .*dist\/main\.cjs/);
  });

  test('wants a dictionary when the app has dictionaries', () => {
    expect(checkListing(GOOD, { dictionaries: true }).join('\n')).toMatch(
      /missing .*dictionaries\/\*\.bdic/,
    );
    expect(
      checkListing([...GOOD, '/dictionaries', '/dictionaries/en-US-10-2.bdic'], {
        dictionaries: true,
      }),
    ).toEqual([]);
    // Not asked for, nothing is missing.
    expect(checkListing(GOOD, { dictionaries: false })).toEqual([]);
  });

  test('refuses source maps, tests, the share image, and node_modules', () => {
    for (const extra of [
      '/web/_nuxt/entry.abc.js.map',
      '/test/protocol.test.ts',
      '/e2e/shell.spec.ts',
      '/src/main.ts',
      '/web/og-image.png',
      '/node_modules/x/index.js',
      '/electron-builder.config.cjs',
    ]) {
      expect(checkListing([...GOOD, extra]).join('\n'), extra).toContain(extra.slice(1));
    }
  });
});
