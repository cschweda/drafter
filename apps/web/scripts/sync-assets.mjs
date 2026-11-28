// Copies the files drafter.dev serves as-is into `public/`: Courier Prime, the
// same TTF files the PDF embeds, so the screen and the printed page share
// their metrics; Inter Tight's four static styles, which a Markdown document's
// PDF embeds (the export worker fetches them); Liberation Serif's four styles, the Times-style face
// of a novel's manuscript PDF (the same); the Story Atlas's four WOFF2 faces (the same); the brand's icons, logos, and share image; and the
// spellchecker's dictionaries with the licence of each package it uses, served
// verbatim (the dictionaries' UKACD notice asks for its text "verbatim"), and the licences of the
// two packages inside Drafter for Claude. The
// copies are ignored by Git, so `brand/`, `packages/render-pdf/fonts/`, and the
// installed packages stay the only sources.
import { readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDefinitions } from './definitions.mjs';

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
/** Inter Tight's styles in `packages/render-pdf/fonts/inter-tight/` (render-pdf's DOCUMENT_FONT_FILES). */
const DOCUMENT_STYLES = ['Regular', 'Italic', 'SemiBold', 'SemiBoldItalic'];
/** Liberation Serif's styles in `packages/render-pdf/fonts/liberation-serif/` (render-pdf's MANUSCRIPT_FONT_FILES.times). */
const MANUSCRIPT_STYLES = ['Regular', 'Italic', 'Bold', 'BoldItalic'];
/** The Story Atlas's faces in `packages/story-atlas/fonts/` (story-atlas's STORY_ATLAS_FONT_FILES). */
const STORY_ATLAS_FONTS = [
  'Anton-Regular.woff2',
  'Archivo-Regular.woff2',
  'Archivo-SemiBold.woff2',
  'CourierPrime-Regular.woff2',
];
const BRAND = [
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
];

/** Each asset's source, relative to the repository root, and its path under `public/`. */
export const ASSETS = [
  ...STYLES.map((style) => ({
    from: `packages/render-pdf/fonts/CourierPrime-${style}.ttf`,
    to: `fonts/courier-prime/CourierPrime-${style}.ttf`,
  })),
  { from: 'packages/render-pdf/fonts/OFL.txt', to: 'fonts/courier-prime/OFL.txt' },
  ...DOCUMENT_STYLES.map((style) => ({
    from: `packages/render-pdf/fonts/inter-tight/InterTight-${style}.ttf`,
    to: `fonts/inter-tight/InterTight-${style}.ttf`,
  })),
  // Inter Tight's own licence, served verbatim (the interface's font is a Vite asset, hashed).
  { from: 'apps/web/app/assets/fonts/inter-tight/OFL.txt', to: 'fonts/inter-tight/OFL.txt' },
  ...MANUSCRIPT_STYLES.map((style) => ({
    from: `packages/render-pdf/fonts/liberation-serif/LiberationSerif-${style}.ttf`,
    to: `fonts/liberation-serif/LiberationSerif-${style}.ttf`,
  })),
  {
    from: 'packages/render-pdf/fonts/liberation-serif/OFL.txt',
    to: 'fonts/liberation-serif/OFL.txt',
  },
  // The Story Atlas's two other typefaces' licences (its fonts are inside each Story Atlas it makes).
  { from: 'packages/story-atlas/fonts/OFL-Anton.txt', to: 'fonts/anton/OFL.txt' },
  { from: 'packages/story-atlas/fonts/OFL-Archivo.txt', to: 'fonts/archivo/OFL.txt' },
  // The Story Atlas's four faces, which the export worker fetches and embeds in each page.
  ...STORY_ATLAS_FONTS.map((name) => ({
    from: `packages/story-atlas/fonts/${name}`,
    to: `fonts/story-atlas/${name}`,
  })),
  ...BRAND.map((name) => ({ from: `brand/${name}`, to: name })),
];

/**
 * The files copied from installed packages, as `@drafter/spell` resolves them: `package` is
 * resolved from `packages/spell` (or, with `via`, from that package's folder, as nspell's own
 * dependency is; or, with `from`, from that package.json, relative to the repository's root), and
 * `file` is in its folder. The dictionaries' folders and licence paths are
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
  // Drafter for Claude's two packages, which travel only inside its own file (packages/mcp), for the
  // Licences page to link in full: resolved from packages/mcp (`from`).
  {
    package: '@modelcontextprotocol/server',
    from: 'packages/mcp/package.json',
    file: 'LICENSE',
    to: 'licenses/modelcontextprotocol-server.txt',
  },
  { package: 'zod', from: 'packages/mcp/package.json', file: 'LICENSE', to: 'licenses/zod.txt' },
  // Definitions' reader (definitions design §7.7), declared by apps/web. Its `exports` has only an
  // `import` condition, which `require.resolve` can't use, so its folder is named (`dir`).
  {
    package: 'w1913',
    dir: 'apps/web/node_modules/w1913',
    file: 'LICENSE',
    to: 'licenses/w1913.txt',
  },
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
  for (const { package: name, via, from: base, dir, file, to } of PACKAGE_ASSETS) {
    if (dir) {
      const target = join(publicDir, to);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(repoRoot, dir, file), target);
      written.push(target);
      continue;
    }
    const from = base
      ? join(repoRoot, base)
      : via
        ? join(packageDir(via, spell), 'package.json')
        : spell;
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
  // Definitions' dictionary (definitions design §7.2): downloaded once into a cache, checked, and
  // copied; left out of a desktop build. In `nuxt dev` a failed download is a warning, not a stop.
  const desktopBuild = process.env.DRAFTER_DESKTOP === '1';
  try {
    const put = await syncDefinitions(
      join(here, '../public'),
      join(here, '../.cache/definitions'),
      {
        desktop: desktopBuild,
      },
    );
    if (put) process.stdout.write('Copied the Definitions dictionary into public/definitions/.\n');
  } catch (error) {
    const message = `Couldn’t get the Definitions dictionary: ${error instanceof Error ? error.message : error}`;
    if (process.argv.includes('--dev')) process.stderr.write(`${message}\n`);
    else throw new Error(message);
  }
}
