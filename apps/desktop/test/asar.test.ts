import { describe, expect, test } from 'vitest';
import { checkListing } from '../scripts/check-asar.mjs';

const GOOD = [
  '/dist',
  '/dist/main.cjs',
  '/dist/preload.cjs',
  '/dist/module-runtime.js',
  '/package.json',
  '/web',
  '/web/index.html',
  '/web/_headers',
  '/web/icon-512.png',
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
      checkListing(
        [
          ...GOOD,
          '/dictionaries',
          '/dictionaries/en-US-10-2.bdic',
          '/dictionaries/README_en_US.txt',
        ],
        { dictionaries: true },
      ),
    ).toEqual([]);
    // The dictionary's licence travels with it.
    expect(
      checkListing([...GOOD, '/dictionaries', '/dictionaries/en-US-10-2.bdic'], {
        dictionaries: true,
      }).join('\n'),
    ).toMatch(/missing .*dictionaries\/README_en_US\.txt/);
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

  test('takes the runtime dependencies, each with its licence, and no other package', () => {
    const runtime = ['electron-updater', 'lazy-val', '@scope/thing'];
    const packed = [
      '/node_modules/electron-updater/package.json',
      '/node_modules/electron-updater/LICENSE',
      '/node_modules/electron-updater/out/main.js',
      '/node_modules/lazy-val/package.json',
      '/node_modules/@scope/thing/package.json',
      '/node_modules/@scope/thing/license.md',
      // A dependency's own src/ folder is its code, not ours.
      '/node_modules/@scope/thing/src/index.js',
    ];
    expect(checkListing([...GOOD, ...packed], { runtime })).toEqual([]);
    // One that isn't a runtime dependency.
    expect(
      checkListing([...GOOD, ...packed, '/node_modules/left-pad/index.js'], { runtime }).join('\n'),
    ).toContain('node_modules/left-pad/index.js');
    // A runtime dependency that wasn't packed, or came without its licence.
    const noLicence = packed.filter((p) => p !== '/node_modules/electron-updater/LICENSE');
    expect(checkListing([...GOOD, ...noLicence], { runtime }).join('\n')).toMatch(
      /electron-updater: no licence file/,
    );
    const missing = packed.filter((p) => !p.startsWith('/node_modules/lazy-val/'));
    expect(checkListing([...GOOD, ...missing], { runtime }).join('\n')).toMatch(
      /missing from the package: node_modules\/lazy-val/,
    );
  });
});
