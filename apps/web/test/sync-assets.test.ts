import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_FONT_FILES } from '@drafter/render-pdf';
import { DICTIONARIES } from '@drafter/spell';
import { describe, expect, test } from 'vitest';
import { ASSETS, PACKAGE_ASSETS, packageDir, syncAssets } from '../scripts/sync-assets.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const spell = join(repoRoot, 'packages/spell/package.json');
const ALL = ASSETS.length + PACKAGE_ASSETS.length;

describe('syncAssets', () => {
  test('lists the four Courier Prime styles, Inter Tight’s four for a Markdown PDF, both fonts’ licenses, and the brand files', () => {
    expect(ASSETS.map(({ to }) => to)).toEqual([
      'fonts/courier-prime/CourierPrime-Regular.ttf',
      'fonts/courier-prime/CourierPrime-Bold.ttf',
      'fonts/courier-prime/CourierPrime-Italic.ttf',
      'fonts/courier-prime/CourierPrime-BoldItalic.ttf',
      'fonts/courier-prime/OFL.txt',
      'fonts/inter-tight/InterTight-Regular.ttf',
      'fonts/inter-tight/InterTight-Italic.ttf',
      'fonts/inter-tight/InterTight-SemiBold.ttf',
      'fonts/inter-tight/InterTight-SemiBoldItalic.ttf',
      'fonts/inter-tight/OFL.txt',
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
    // The PDF's Inter Tight is render-pdf's own files, the ones its layout measured.
    expect(ASSETS.filter(({ to }) => to.endsWith('.ttf')).map(({ from }) => from)).toEqual(
      [
        ...['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => `CourierPrime-${s}.ttf`),
        ...Object.values(DOCUMENT_FONT_FILES).filter((file) => file.startsWith('inter-tight/')),
      ].map((file) => `packages/render-pdf/fonts/${file}`),
    );
  });

  test('copies every Courier Prime style and brand icon into public', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    const written = await syncAssets(repoRoot, out);
    expect(written).toHaveLength(ALL);
    for (const { from, to } of ASSETS) {
      expect(await readFile(join(out, to))).toEqual(await readFile(join(repoRoot, from)));
    }
  });

  test('copies both dictionaries and the four licence files', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    await syncAssets(repoRoot, out);
    // Where the app fetches them from (`@drafter/spell`'s DICTIONARIES), as the packages ship them.
    for (const info of Object.values(DICTIONARIES)) {
      const from = packageDir(info.package, spell);
      for (const name of ['index.aff', 'index.dic']) {
        expect(await readFile(join(out, info.folder, name)), name).toEqual(
          await readFile(join(from, name)),
        );
      }
      expect(await readFile(join(out, info.licenceFile))).toEqual(
        await readFile(join(from, 'license')),
      );
    }
    // Each licence verbatim: nspell's, is-buffer's (brought by nspell), and the dictionaries'.
    const nspell = packageDir('nspell', spell);
    const isBuffer = packageDir('is-buffer', join(nspell, 'package.json'));
    expect(await readFile(join(out, 'licenses/nspell.txt'))).toEqual(
      await readFile(join(nspell, 'license')),
    );
    expect(await readFile(join(out, 'licenses/is-buffer.txt'))).toEqual(
      await readFile(join(isBuffer, 'LICENSE')),
    );
    expect(PACKAGE_ASSETS.map(({ to }) => to).sort()).toEqual([
      'dictionaries/en-GB/index.aff',
      'dictionaries/en-GB/index.dic',
      'dictionaries/en-US/index.aff',
      'dictionaries/en-US/index.dic',
      'licenses/dictionary-en-gb.txt',
      'licenses/dictionary-en.txt',
      'licenses/is-buffer.txt',
      'licenses/nspell.txt',
    ]);
  });

  test('can run twice', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    await syncAssets(repoRoot, out);
    await expect(syncAssets(repoRoot, out)).resolves.toHaveLength(ALL);
  });
});
