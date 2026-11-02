import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_FONT_FILES } from '@drafter/render-pdf';
import { DICTIONARIES } from '@drafter/spell';
import { STORY_MAP_FONT_FILES } from '@drafter/story-map';
import { describe, expect, test, vi } from 'vitest';
import { ASSETS, PACKAGE_ASSETS, packageDir, syncAssets } from '../scripts/sync-assets.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const spell = join(repoRoot, 'packages/spell/package.json');
const ALL = ASSETS.length + PACKAGE_ASSETS.length;

// Each test copies real fonts, dictionaries, and icons: a few seconds here, longer on a shared CI
// machine, so they have half a minute each.
vi.setConfig({ testTimeout: 30_000 });

describe('syncAssets', () => {
  test('lists the four Courier Prime styles, Inter Tight’s four for a Markdown PDF, the story map’s four, every font’s license, and the brand files', () => {
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
      'fonts/anton/OFL.txt',
      'fonts/archivo/OFL.txt',
      'fonts/story-map/Anton-Regular.woff2',
      'fonts/story-map/Archivo-Regular.woff2',
      'fonts/story-map/Archivo-SemiBold.woff2',
      'fonts/story-map/CourierPrime-Regular.woff2',
      'favicon.svg',
      'favicon.ico',
      'favicon-unsaved.svg',
      'favicon-unsaved.ico',
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
    // The story map's faces are its package's own, the ones the worker embeds.
    expect(ASSETS.filter(({ to }) => to.endsWith('.woff2')).map(({ from }) => from)).toEqual(
      Object.values(STORY_MAP_FONT_FILES).map((file) => `packages/story-map/fonts/${file}`),
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
    // Drafter for Claude's SDK and zod, resolved from packages/mcp.
    const mcp = join(repoRoot, 'packages/mcp/package.json');
    for (const [name, file] of [
      ['@modelcontextprotocol/server', 'licenses/modelcontextprotocol-server.txt'],
      ['zod', 'licenses/zod.txt'],
    ] as const) {
      expect(await readFile(join(out, file)), name).toEqual(
        await readFile(join(packageDir(name, mcp), 'LICENSE')),
      );
    }
    expect(PACKAGE_ASSETS.map(({ to }) => to).sort()).toEqual([
      'dictionaries/en-GB/index.aff',
      'dictionaries/en-GB/index.dic',
      'dictionaries/en-US/index.aff',
      'dictionaries/en-US/index.dic',
      'licenses/dictionary-en-gb.txt',
      'licenses/dictionary-en.txt',
      'licenses/is-buffer.txt',
      'licenses/modelcontextprotocol-server.txt',
      'licenses/nspell.txt',
      'licenses/zod.txt',
    ]);
  });

  test('can run twice', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    await syncAssets(repoRoot, out);
    await expect(syncAssets(repoRoot, out)).resolves.toHaveLength(ALL);
  });
});
