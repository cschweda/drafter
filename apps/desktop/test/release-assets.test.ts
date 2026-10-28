import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { compareAssets, folderProblems, packageFiles } from '../scripts/check-release-assets.mjs';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-assets-'));
  await writeFile(join(dir, 'Drafter-x86_64.AppImage'), 'image');
  await writeFile(join(dir, 'Drafter-1.0.0-linux-amd64.deb'), 'deb');
  await writeFile(join(dir, 'latest-linux.yml'), 'feed');
  await writeFile(join(dir, X64), 'x64 setup');
  await writeFile(join(dir, ARM), 'arm setup');
  await writeFile(join(dir, 'latest.yml'), 'win feed');
});

const X64 = 'Drafter-1.0.0-windows-x64-setup.exe';
const ARM = 'Drafter-1.0.0-windows-arm64-setup.exe';
afterEach(() => rm(dir, { recursive: true, force: true }));

const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const assets = (over: Record<string, object> = {}) =>
  [
    {
      name: 'Drafter-x86_64.AppImage',
      size: 5,
      state: 'uploaded',
      digest: sha('image'),
    },
    { name: 'Drafter-1.0.0-linux-amd64.deb', size: 3, state: 'uploaded', digest: sha('deb') },
    { name: 'latest-linux.yml', size: 4, state: 'uploaded', digest: sha('feed') },
    { name: X64, size: 9, state: 'uploaded', digest: sha('x64 setup') },
    { name: ARM, size: 9, state: 'uploaded', digest: sha('arm setup') },
    { name: 'latest.yml', size: 8, state: 'uploaded', digest: sha('win feed') },
  ].map((asset) => ({ ...asset, ...over[asset.name] }));

describe('compareAssets', () => {
  test('accepts a release that holds exactly these files', () => {
    expect(compareAssets(dir, assets())).toEqual([]);
  });

  test('accepts assets with no digest (the API may not give one)', () => {
    const plain = assets().map(({ digest: _digest, ...rest }) => rest);
    expect(compareAssets(dir, plain)).toEqual([]);
  });

  test('refuses a release that holds anything else (an asset from an earlier upload, say)', () => {
    expect(
      compareAssets(dir, [
        ...assets(),
        { name: 'Drafter-0.9.0-windows-x64-setup.exe', size: 1, state: 'uploaded' },
      ]).join('\n'),
    ).toMatch(
      /Drafter-0\.9\.0-windows-x64-setup\.exe: on the release, but not one of this build’s files/,
    );
  });

  test('finds a file that is missing, a different size, or not uploaded', () => {
    expect(compareAssets(dir, assets().slice(0, 2)).join('\n')).toMatch(
      /latest-linux\.yml: not on the release/,
    );
    expect(compareAssets(dir, assets({ 'latest-linux.yml': { size: 99 } })).join('\n')).toMatch(
      /latest-linux\.yml: 99 bytes on the release, 4 here/,
    );
    expect(
      compareAssets(dir, assets({ 'latest-linux.yml': { state: 'starter' } })).join('\n'),
    ).toMatch(/not uploaded/);
  });

  test('finds a file whose content differs, by digest, at the same size', () => {
    const changed = assets({ 'Drafter-1.0.0-linux-amd64.deb': { digest: sha('dab') } });
    expect(compareAssets(dir, changed).join('\n')).toMatch(/amd64\.deb: its digest on the release/);
  });

  test('finds a Windows file missing from the release, or different', () => {
    expect(
      compareAssets(
        dir,
        assets().filter((asset) => asset.name !== 'latest.yml'),
      ).join('\n'),
    ).toMatch(/latest\.yml: not on the release/);
    expect(compareAssets(dir, assets({ [ARM]: { digest: sha('arm setuq') } })).join('\n')).toMatch(
      /arm64-setup\.exe: its digest on the release/,
    );
  });

  test('wants every file of both systems in the folder', async () => {
    await rm(join(dir, 'latest-linux.yml'));
    expect(compareAssets(dir, assets())[0]).toMatch(/has no latest-linux\.yml/);
  });
});

describe('the folder a release is made from', () => {
  test('lists the six files, and nothing else there', async () => {
    await writeFile(join(dir, 'builder-debug.yml'), 'x');
    await writeFile(join(dir, `${X64}.blockmap`), 'x');
    expect(folderProblems(dir)).toEqual([]);
    expect(packageFiles(dir)).toEqual(
      [
        'Drafter-1.0.0-linux-amd64.deb',
        ARM,
        X64,
        'Drafter-x86_64.AppImage',
        'latest-linux.yml',
        'latest.yml',
      ].sort(),
    );
  });

  test('a release with only Linux, or only Windows, is refused', async () => {
    await rm(join(dir, ARM));
    expect(folderProblems(dir).join('\n')).toMatch(/has no arm64 Windows installer/);
    await rm(join(dir, X64));
    await rm(join(dir, 'latest.yml'));
    const problems = folderProblems(dir).join('\n');
    expect(problems).toMatch(/has no x64 Windows installer/);
    expect(problems).toMatch(/has no latest\.yml/);
  });

  test('two of a kind are refused', async () => {
    await writeFile(join(dir, 'Drafter-0.9.0-windows-x64-setup.exe'), 'old');
    expect(folderProblems(dir).join('\n')).toMatch(/more than one of the x64 Windows installer/);
  });
});
