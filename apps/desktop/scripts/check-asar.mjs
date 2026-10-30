// Lists app.asar and checks what is in the package: what must be there, and nothing that doesn't
// belong (source maps, tests, the share image, any package that isn't a runtime dependency). The
// runtime dependencies (electron-updater and what it brings) must each be there with its licence,
// and the spellcheck dictionary with its own (README_en_US.txt). Run after packaging:
// `node scripts/check-asar.mjs release/linux-unpacked/resources/app.asar`.
// @electron/asar is electron-builder's own dependency, so it is found through electron-builder.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const MUST_HAVE = [
  'dist/main.cjs',
  'dist/preload.cjs',
  'dist/module-runtime.js',
  'package.json',
  'web/index.html',
  'web/_headers',
  // The window's icon (src/window.ts): without it Linux and Windows show Electron's.
  'web/icon-512.png',
];

/** Paths (with a leading slash, as the asar lists them) that don't belong in the app. */
const UNWANTED = [
  [/\.map$/, 'a source map'],
  [/^(test|tests|e2e|src|scripts)\//, 'a source, test, or script folder'],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, 'a test file'],
  [/(^|\/)og-image\./, 'the share image'],
  [
    /(^|\/)(playwright|tsdown|electron-builder)[^/]*\.(c?[jt]s|json)$/,
    'build or test configuration',
  ],
];

/**
 * Runtime packages that ship no licence file; each says its licence in its package.json, which is
 * packed. Named here so a package that drops its licence file is noticed.
 */
const NO_LICENCE_FILE = new Map([['lazy-val', 'MIT, in its package.json']]);

/** The package a node_modules path belongs to (`@scope/name` or `name`), or null. */
const packageOf = (path) => /^node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)?.[1] ?? null;

/**
 * @param {string[]} listing the asar's entries (as `/dist/main.cjs`)
 * @param {{ dictionaries?: boolean, runtime?: string[] }} options `dictionaries`: the app has
 *   dictionaries to bring; `runtime`: the packages the app needs at run time (its dependencies and
 *   theirs), the only ones that may be in node_modules
 * @returns {string[]} what is wrong with the listing
 */
export function checkListing(listing, options = {}) {
  const paths = listing.map((entry) => entry.replace(/\\/g, '/').replace(/^\//, ''));
  const problems = [];
  // The spellchecker's dictionaries, once the app has them (apps/desktop/dictionaries/).
  if (options.dictionaries && !paths.some((p) => /^dictionaries\/[^/]+\.bdic$/.test(p))) {
    problems.push('missing from the package: dictionaries/*.bdic (the spellchecker has none)');
  }
  if (options.dictionaries && !paths.includes('dictionaries/README_en_US.txt')) {
    problems.push(
      'missing from the package: dictionaries/README_en_US.txt (the dictionary’s licence)',
    );
  }
  const runtime = new Set(options.runtime ?? []);
  for (const name of runtime) {
    const files = paths.filter((p) => p.startsWith(`node_modules/${name}/`));
    if (!files.includes(`node_modules/${name}/package.json`)) {
      problems.push(`missing from the package: node_modules/${name} (a runtime dependency)`);
    } else if (
      !NO_LICENCE_FILE.has(name) &&
      !files.some((p) => /^(licen[sc]e|copying)/i.test(p.slice(`node_modules/${name}/`.length)))
    ) {
      problems.push(`node_modules/${name}: no licence file in the package`);
    }
  }
  for (const needed of MUST_HAVE) {
    if (!paths.includes(needed)) problems.push(`missing from the package: ${needed}`);
  }
  for (const path of paths) {
    const owner = packageOf(path);
    if (owner !== null) {
      if (!runtime.has(owner)) {
        problems.push(`${path}: not a runtime dependency, so it should not be in the package`);
      }
      continue;
    }
    if (path === 'node_modules') continue;
    for (const [pattern, what] of UNWANTED) {
      if (pattern.test(path)) problems.push(`${path}: ${what} should not be in the package`);
    }
  }
  return problems;
}

/**
 * The names of the packages the app needs at run time: its `dependencies`, and theirs, found as Node
 * would find them from each package's own folder.
 * @param {string} manifest the app's package.json
 */
export function runtimeClosure(manifest) {
  const names = new Set();
  const visit = (file) => {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    const from = createRequire(file);
    for (const name of Object.keys({ ...json.dependencies, ...json.optionalDependencies })) {
      if (names.has(name)) continue;
      let found;
      try {
        found = from.resolve(`${name}/package.json`);
      } catch {
        if (json.optionalDependencies?.[name]) continue;
        throw new Error(`${name} (a dependency of ${json.name}) is not installed`);
      }
      names.add(name);
      visit(found);
    }
  };
  visit(manifest);
  return [...names].sort();
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
    runtime: runtimeClosure(fileURLToPath(new URL('../package.json', import.meta.url))),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log('The package holds what it should and nothing else.');
}
