// Lists app.asar and checks what is in the package: what must be there, and nothing that doesn't
// belong (source maps, tests, the share image). Run after packaging:
// `node scripts/check-asar.mjs release/linux-unpacked/resources/app.asar`.
// @electron/asar is electron-builder's own dependency, so it is found through electron-builder.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const MUST_HAVE = [
  'dist/main.cjs',
  'dist/preload.cjs',
  'package.json',
  'web/index.html',
  'web/_headers',
];

/** Paths (with a leading slash, as the asar lists them) that don't belong in the app. */
const UNWANTED = [
  [/\.map$/, 'a source map'],
  [/(^|\/)(test|tests|e2e|src|scripts)\//, 'a source, test, or script folder'],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, 'a test file'],
  [/(^|\/)og-image\./, 'the share image'],
  [/(^|\/)node_modules\//, 'a node_modules folder (the app has no runtime dependencies yet)'],
  [
    /(^|\/)(playwright|tsdown|electron-builder)[^/]*\.(c?[jt]s|json)$/,
    'build or test configuration',
  ],
];

/**
 * @param {string[]} listing the asar's entries (as `/dist/main.cjs`)
 * @param {{ dictionaries?: boolean }} options `dictionaries`: the app has dictionaries to bring
 * @returns {string[]} what is wrong with the listing
 */
export function checkListing(listing, options = {}) {
  const paths = listing.map((entry) => entry.replace(/\\/g, '/').replace(/^\//, ''));
  const problems = [];
  // The spellchecker's dictionaries, once the app has them (apps/desktop/dictionaries/).
  if (options.dictionaries && !paths.some((p) => /^dictionaries\/[^/]+\.bdic$/.test(p))) {
    problems.push('missing from the package: dictionaries/*.bdic (the spellchecker has none)');
  }
  for (const needed of MUST_HAVE) {
    if (!paths.includes(needed)) problems.push(`missing from the package: ${needed}`);
  }
  for (const path of paths) {
    for (const [pattern, what] of UNWANTED) {
      if (pattern.test(path)) problems.push(`${path}: ${what} should not be in the package`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/check-asar.mjs <path to app.asar>');
    process.exit(2);
  }
  const here = createRequire(import.meta.url);
  const builder = createRequire(here.resolve('electron-builder'));
  const asar = createRequire(builder.resolve('app-builder-lib'))('@electron/asar');
  const listing = asar.listPackage(file);
  console.log(`${listing.length} entries in ${file}`);
  const problems = checkListing(listing, {
    dictionaries: existsSync(new URL('../dictionaries/', import.meta.url)),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log('The package holds what it should and nothing else.');
}
