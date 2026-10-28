// resources/app-update.yml, which electron-builder writes into the packaged app and electron-updater
// reads: where updates come from, and on Windows whose signature an update must carry. Unsigned for
// now, so there is no `publisherName` and electron-updater checks only the sha512; the moment a
// signing identity is configured, electron-builder writes the name and every update must be signed
// by it. These tests hold both halves: the check run on the built app, and the configuration.
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import {
  publisherNames,
  signatureProblems,
  signingConfigured,
  updateConfigProblems,
} from '../scripts/check-update-config.mjs';

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

  test('count every way electron-builder signs: a custom signer, a certificate file, a thumbprint, a subject', () => {
    const win = (signtoolOptions: object) => ({
      ...config,
      win: { ...config.win, signtoolOptions },
    });
    // A custom signer (an HSM or a cloud service such as SSL.com eSigner) leaves publisherName
    // unset, so it must count as signing or a signed build would check no signature.
    expect(signingConfigured(win({ sign: './sign.js' }), {})).toBe(true);
    expect(signingConfigured(win({ certificateFile: 'cert.pfx' }), {})).toBe(true);
    expect(signingConfigured(win({ certificateSha1: 'ABCDEF' }), {})).toBe(true);
    expect(signingConfigured(win({ certificateSubjectName: 'C S' }), {})).toBe(true);
    // The same names directly on `win`, where older electron-builders read them.
    expect(signingConfigured({ ...config, win: { ...config.win, sign: './sign.js' } }, {})).toBe(
      true,
    );
    expect(signingConfigured(win({ signingHashAlgorithms: ['sha256'] }), {})).toBe(false);
  });
});

describe('publisherNames', () => {
  test('reads a name, a list of names, or none', () => {
    expect(publisherNames(UNSIGNED)).toEqual([]);
    expect(publisherNames(`${UNSIGNED}publisherName: Christopher Schweda\n`)).toEqual([
      'Christopher Schweda',
    ]);
    expect(
      publisherNames(`${UNSIGNED}publisherName:\n  - Christopher Schweda\n  - 'Drafter, LLC'\n`),
    ).toEqual(['Christopher Schweda', 'Drafter, LLC']);
  });
});

describe('signatureProblems (the built files, as Get-AuthenticodeSignature saw them)', () => {
  const unsigned = [
    { path: 'Drafter.exe', status: 'NotSigned', subject: '' },
    { path: 'Drafter-1.0.0-windows-x64-setup.exe', status: 'NotSigned', subject: '' },
  ];
  test('nothing signed: nothing to require', () => {
    expect(signatureProblems(UNSIGNED, unsigned)).toEqual([]);
  });

  test('a signed file wants a publisherName, whatever the configuration said', () => {
    const signed = [
      {
        path: 'Drafter.exe',
        status: 'Valid',
        subject: 'CN=Christopher Schweda, O=Christopher Schweda, C=US',
      },
      unsigned[1],
    ];
    expect(signatureProblems(UNSIGNED, signed).join('\n')).toMatch(
      /Drafter\.exe is signed \(CN=Christopher Schweda\), but app-update\.yml has no publisherName/,
    );
    expect(signatureProblems(`${UNSIGNED}publisherName: Christopher Schweda\n`, signed)).toEqual(
      [],
    );
  });

  test('the signer must be one the app will accept, or every update would be refused', () => {
    const signed = [{ path: 'Drafter.exe', status: 'Valid', subject: 'CN="Drafter, LLC", O=X' }];
    expect(
      signatureProblems(`${UNSIGNED}publisherName: Christopher Schweda\n`, signed).join('\n'),
    ).toMatch(/signed by Drafter, LLC, which publisherName \(Christopher Schweda\) doesn’t name/);
    expect(signatureProblems(`${UNSIGNED}publisherName: 'Drafter, LLC'\n`, signed)).toEqual([]);
  });

  test('a broken signature counts as signed (it isn’t NotSigned)', () => {
    const broken = [{ path: 'Drafter.exe', status: 'HashMismatch', subject: 'CN=Someone' }];
    expect(signatureProblems(UNSIGNED, broken).join('\n')).toMatch(/is signed/);
  });
});
