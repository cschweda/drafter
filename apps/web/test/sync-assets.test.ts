import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ASSETS, syncAssets } from '../scripts/sync-assets.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('syncAssets', () => {
  test('lists the four Courier Prime styles, their license, and the brand files', () => {
    expect(ASSETS.map(({ to }) => to)).toEqual([
      'fonts/courier-prime/CourierPrime-Regular.ttf',
      'fonts/courier-prime/CourierPrime-Bold.ttf',
      'fonts/courier-prime/CourierPrime-Italic.ttf',
      'fonts/courier-prime/CourierPrime-BoldItalic.ttf',
      'fonts/courier-prime/OFL.txt',
      'favicon.svg',
      'favicon.ico',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
      'og-image.png',
      'logo-dark.svg',
      'logo-light.svg',
      'mark.svg',
    ]);
  });

  test('copies every Courier Prime style and brand icon into public', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    const written = await syncAssets(repoRoot, out);
    expect(written).toHaveLength(ASSETS.length);
    for (const { from, to } of ASSETS) {
      expect(await readFile(join(out, to))).toEqual(await readFile(join(repoRoot, from)));
    }
  });

  test('can run twice', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    await syncAssets(repoRoot, out);
    await expect(syncAssets(repoRoot, out)).resolves.toHaveLength(ASSETS.length);
  });
});
