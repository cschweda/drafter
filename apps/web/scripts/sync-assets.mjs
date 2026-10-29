// Copies the files drafter.dev serves as-is into `public/`: Courier Prime, the
// same TTF files the PDF embeds, so the screen and the printed page share
// their metrics; the brand's icons, logos, and share image; and the
// spellchecker's dictionaries with the licence of each package it uses, served
// verbatim (the dictionaries' UKACD notice asks for its text "verbatim"). The
// copies are ignored by Git, so `brand/`, `packages/render-pdf/fonts/`, and the
// installed packages stay the only sources.
import { readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
 * The files copied from installed packages, as `@drafter/spell` resolves them: `package` is
 * resolved from `packages/spell` (or, with `via`, from that package's folder, as nspell's own
 * dependency is), and `file` is in its folder. The dictionaries' folders and licence paths are
 * `DICTIONARIES`' in `packages/spell/src/dictionaries.ts`.
 */
export const PACKAGE_ASSETS = [
  ...[
    { package: 'dictionary-en', language: 'en-US' },
    { package: 'dictionary-en-gb', language: 'en-GB' },
  ].flatMap(({ package: name, language }) => [
    { package: name, file: 'index.aff', to: `dictionaries/${language}/index.aff` },
    { package: name, file: 'index.dic', to: `dictionaries/${language}/index.dic` },
    { package: name, file: 'license', to: `licenses/${name}.txt` },
  ]),
  { package: 'nspell', file: 'license', to: 'licenses/nspell.txt' },
  { package: 'is-buffer', via: 'nspell', file: 'LICENSE', to: 'licenses/is-buffer.txt' },
];

/**
 * The folder of the package `name` resolves to from the file `from`: where `require` finds its
 * entry, then up to the folder whose package.json is that package's. (The dictionaries' `exports`
 * names only `./index.js`, so their data files can't be resolved directly.)
 * @param {string} name
 * @param {string} from a file (such as a package.json) in the folder to resolve from
 * @returns {string}
 */
export function packageDir(name, from) {
  let dir = dirname(createRequire(from).resolve(name));
  for (;;) {
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === name) return dir;
    } catch {
      // No package.json here (or not JSON): look further up.
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Found no folder for ${name}, resolved from ${from}.`);
    dir = parent;
  }
}

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
  const spell = join(repoRoot, 'packages/spell/package.json');
  for (const { package: name, via, file, to } of PACKAGE_ASSETS) {
    const from = via ? join(packageDir(via, spell), 'package.json') : spell;
    const target = join(publicDir, to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(packageDir(name, from), file), target);
    written.push(target);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const written = await syncAssets(join(here, '../../..'), join(here, '../public'));
  process.stdout.write(`Copied ${written.length} files into public/.\n`);
}
