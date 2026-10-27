import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { compareAssets } from '../scripts/check-release-assets.mjs';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-assets-'));
  await writeFile(join(dir, 'Drafter-1.0.0-linux-x86_64.AppImage'), 'image');
  await writeFile(join(dir, 'Drafter-1.0.0-linux-amd64.deb'), 'deb');
  await writeFile(join(dir, 'latest-linux.yml'), 'feed');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const assets = (over: Record<string, object> = {}) =>
  [
    {
      name: 'Drafter-1.0.0-linux-x86_64.AppImage',
      size: 5,
      state: 'uploaded',
      digest: sha('image'),
    },
    { name: 'Drafter-1.0.0-linux-amd64.deb', size: 3, state: 'uploaded', digest: sha('deb') },
    { name: 'latest-linux.yml', size: 4, state: 'uploaded', digest: sha('feed') },
  ].map((asset) => ({ ...asset, ...over[asset.name] }));

describe('compareAssets', () => {
  test('accepts a release that holds exactly these files', () => {
    expect(compareAssets(dir, assets())).toEqual([]);
  });

  test('accepts assets with no digest (the API may not give one), and extra assets', () => {
    const plain = assets().map(({ digest: _digest, ...rest }) => rest);
    expect(compareAssets(dir, [...plain, { name: 'notes.txt', size: 1 }])).toEqual([]);
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

  test('wants all three files in the folder', async () => {
    await rm(join(dir, 'latest-linux.yml'));
    expect(compareAssets(dir, assets())[0]).toMatch(
      /expected an AppImage, a \.deb, and latest-linux\.yml/,
    );
  });
});
