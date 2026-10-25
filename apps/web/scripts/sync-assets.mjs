// Copies the files drafter.dev serves as-is into `public/`: Courier Prime, the
// same TTF files the PDF embeds, so the screen and the printed page share
// their metrics; and the brand's icons, logos, and share image. The copies
// are ignored by Git, so `brand/` and `packages/render-pdf/fonts/` stay the
// only sources.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
const BRAND = [
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
];

/** Each asset's source, relative to the repository root, and its path under `public/`. */
export const ASSETS = [
  ...STYLES.map((style) => ({
    from: `packages/render-pdf/fonts/CourierPrime-${style}.ttf`,
    to: `fonts/courier-prime/CourierPrime-${style}.ttf`,
  })),
  { from: 'packages/render-pdf/fonts/OFL.txt', to: 'fonts/courier-prime/OFL.txt' },
  ...BRAND.map((name) => ({ from: `brand/${name}`, to: name })),
];

/**
 * Copies every asset from `repoRoot` into `publicDir`.
 * @param {string} repoRoot
 * @param {string} publicDir
 * @returns {Promise<string[]>} the paths written
 */
export async function syncAssets(repoRoot, publicDir) {
  const written = [];
  for (const { from, to } of ASSETS) {
    const target = join(publicDir, to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repoRoot, from), target);
    written.push(target);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const written = await syncAssets(join(here, '../../..'), join(here, '../public'));
  process.stdout.write(`Copied ${written.length} assets into public/.\n`);
}
