// Checks the generated site after a build, so a mistake in the build fails it rather than shipping:
// - the test module (the fixture) is in a build made with DRAFTER_TEST_MODULES=1 and in no other;
// - every icon the app's own `.ts` files name is in the icon bundle (the bundle is made from a
//   scan, and a file the scan doesn't read leaves its icon blank, with nothing at runtime to say so).
// Run as `node scripts/check-build.mjs .output/public`.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Text that is in the fixture and in nothing else: its toolbar button and its command. */
export const FIXTURE_MARKERS = ['Count scenes', 'Fixture: add a note'];

/**
 * The names of the `i-lucide-*` icons in `source`, without the prefix.
 * @param {string} source
 * @returns {string[]}
 */
export function iconNamesIn(source) {
  return [...source.matchAll(/\bi-lucide-([a-z0-9-]+)/g)].map((match) => match[1]);
}

/**
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {Promise<string[]>}
 */
async function filesUnder(dir, pattern) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path, pattern)));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * @param {string} siteDir the generated site (`.output/public`)
 * @param {{ fixture: boolean, icons: string[] }} expected whether the build is a test build, and the
 *   icon names (without `i-lucide-`) its bundle must have
 * @returns {Promise<{ problems: string[] }>}
 */
export async function checkBuild(siteDir, expected) {
  const problems = [];
  const scripts = await filesUnder(siteDir, /\.(?:js|mjs|html)$/);
  const texts = await Promise.all(
    scripts.map(async (path) => [path, await readFile(path, 'utf8')]),
  );

  const leaks = texts.filter(([, text]) => FIXTURE_MARKERS.some((marker) => text.includes(marker)));
  if (expected.fixture && leaks.length === 0) {
    problems.push('This is a test build (DRAFTER_TEST_MODULES=1) but the fixture is not in it.');
  }
  if (!expected.fixture && leaks.length > 0) {
    problems.push(
      `The test fixture is in a build made without DRAFTER_TEST_MODULES=1: ${leaks.map(([path]) => path).join(', ')}`,
    );
  }

  // The bundle is JSON in a string: `"file-plus":{"width":24,...` with its quotes escaped or not.
  for (const name of expected.icons) {
    const entry = new RegExp(`\\\\*"${name}\\\\*"\\s*:\\s*\\{[^}]*?\\\\*"body\\\\*"`);
    if (!texts.some(([, text]) => entry.test(text))) {
      problems.push(`The icon bundle has no “${name}” (i-lucide-${name}), which the app names.`);
    }
  }
  return { problems };
}

/**
 * The icons the `.ts` files under `appDir` name.
 * @param {string} appDir
 * @returns {Promise<string[]>}
 */
export async function iconsNamedInTs(appDir) {
  const names = new Set();
  for (const path of await filesUnder(appDir, /\.ts$/)) {
    for (const name of iconNamesIn(await readFile(path, 'utf8'))) names.add(name);
  }
  return [...names].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const siteDir = process.argv[2] ?? '.output/public';
  const appDir = fileURLToPath(new URL('../app', import.meta.url));
  const { problems } = await checkBuild(siteDir, {
    fixture: process.env.DRAFTER_TEST_MODULES === '1',
    icons: await iconsNamedInTs(appDir),
  });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('The build checks out.');
}
