// resources/app-update.yml, which electron-builder writes into the packaged app and electron-updater
// reads: where updates come from, and on Windows whose signature an update must carry. Unsigned for
// now, so there is no `publisherName` and electron-updater checks only the sha512; the moment a
// signing identity is configured, electron-builder writes the name and every update must be signed
// by it. These tests hold both halves: the check run on the built app, and the configuration.
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { signingConfigured, updateConfigProblems } from '../scripts/check-update-config.mjs';

const UNSIGNED = `owner: cschweda
repo: drafter
provider: github
releaseType: release
updaterCacheDirName: drafter-updater
`;

describe('updateConfigProblems', () => {
  test('accepts the release’s feed, unsigned', () => {
    expect(updateConfigProblems(UNSIGNED, { signed: false })).toEqual([]);
  });

  test('wants a signed build to name its publisher, so electron-updater checks the signature', () => {
    expect(updateConfigProblems(UNSIGNED, { signed: true }).join('\n')).toMatch(
      /signed, but app-update\.yml has no publisherName/,
    );
    expect(
      updateConfigProblems(`${UNSIGNED}publisherName:\n  - Christopher Schweda\n`, {
        signed: true,
      }),
    ).toEqual([]);
    expect(
      updateConfigProblems(`${UNSIGNED}publisherName: Christopher Schweda\n`, { signed: true }),
    ).toEqual([]);
  });

  test('refuses another release source, or the workspace’s package name in the cache folder', () => {
    expect(
      updateConfigProblems(UNSIGNED.replace('cschweda', 'someone'), { signed: false }),
    ).not.toEqual([]);
    expect(
      updateConfigProblems(UNSIGNED.replace('drafter-updater', '@drafterdesktop-updater'), {
        signed: false,
      }).join('\n'),
    ).toMatch(/updaterCacheDirName/);
  });
});

describe('the Windows signing settings (electron-builder.config.cjs)', () => {
  const config = createRequire(import.meta.url)('../electron-builder.config.cjs');

  test('leave electron-builder free to write the publisher name once there is an identity', () => {
    // false would keep publisherName out of app-update.yml even for a signed build.
    expect(config.win.verifyUpdateCodeSignature).not.toBe(false);
  });

  test('say whether a signing identity is configured, from the config or the environment', () => {
    expect(signingConfigured(config, {})).toBe(false);
    expect(signingConfigured(config, { WIN_CSC_LINK: 'cert.pfx' })).toBe(true);
    expect(signingConfigured(config, { CSC_LINK: 'cert.pfx' })).toBe(true);
    expect(
      signingConfigured(
        { ...config, win: { ...config.win, azureSignOptions: { publisherName: 'C S' } } },
        {},
      ),
    ).toBe(true);
    expect(
      signingConfigured(
        { ...config, win: { ...config.win, signtoolOptions: { publisherName: 'C S' } } },
        {},
      ),
    ).toBe(true);
  });
});
