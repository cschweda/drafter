// Checks an update feed (written by electron-builder) against the packages next to it: every file
// it names exists in the folder, with the size and the sha512 it says, and the file it names as
// `path` is one of them. Each feed has rules of its own:
//   latest-linux.yml  names the AppImage, whose name holds no version (it is replaced in place)
//   latest.yml        names Windows installers, one per processor, each with its processor in its
//                     name (electron-updater picks the one that holds the running app's) and the
//                     feed's version
// Run after packaging and before a release is published (the workflow's `publish` job):
//   node scripts/check-update-feed.mjs [--release] <folder> [feed …]
// `--release` (publish-release.sh): latest.yml must list an installer for every processor.
// With no feed named, latest-linux.yml. With more than one, they must also give the same version.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The processors a Windows installer is built for, as electron-updater matches them (`process.arch`). */
export const WINDOWS_ARCHS = ['x64', 'arm64'];

/** The feed's lines, read as the small, flat YAML electron-builder writes. */
function parse(text) {
  const files = [];
  let top = { path: null, sha512: null, version: null };
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    let match = /^\s*-\s+url:\s*(.+?)\s*$/.exec(line);
    if (match) {
      current = { url: match[1], sha512: null, size: null };
      files.push(current);
      continue;
    }
    match = /^(path|sha512|version):\s*['"]?(.+?)['"]?\s*$/.exec(line);
    if (match) {
      top = { ...top, [match[1]]: match[2] };
      current = null;
      continue;
    }
    match = /^\s+(sha512|size):\s*(.+?)\s*$/.exec(line);
    if (match && current) current[match[1]] = match[2];
  }
  return { files, top };
}

/** The version a feed gives, or null (no such file, or no `version:`). */
export function feedVersion(dir, feedName = 'latest-linux.yml') {
  const feed = join(dir, feedName);
  if (!existsSync(feed)) return null;
  return parse(readFileSync(feed, 'utf8')).top.version;
}

/** What is wrong with the Linux feed's files, beyond what every feed is checked for. */
function linuxProblems(files) {
  const problems = [];
  if (!files.some((file) => file.url.endsWith('.AppImage'))) {
    problems.push('latest-linux.yml names no AppImage (the updater needs one)');
  }
  for (const file of files) {
    // A versioned AppImage would be installed under the next version's name (see the AppImage's
    // artifactName in electron-builder.config.cjs), leaving launchers pointing at a deleted file.
    if (file.url.endsWith('.AppImage') && /\d+\.\d+\.\d+/.test(file.url)) {
      problems.push(
        `${file.url}: an AppImage's name must not carry a version (an update must replace it in place)`,
      );
    }
  }
  return problems;
}

/** What is wrong with the Windows feed's files, beyond what every feed is checked for. */
function windowsProblems(files, version, release) {
  const problems = [];
  const installers = files.filter((file) => file.url.toLowerCase().endsWith('.exe'));
  if (installers.length === 0)
    problems.push('latest.yml names no installer (the updater needs one)');
  const byArch = new Map();
  for (const file of installers) {
    // electron-updater takes the first .exe whose name holds `process.arch`: each name must hold
    // exactly one processor, and no two the same, or an app could install the other's build.
    const archs = WINDOWS_ARCHS.filter((arch) => file.url.includes(arch));
    if (archs.length !== 1) {
      problems.push(
        `${file.url}: an installer's name must hold exactly one of ${WINDOWS_ARCHS.join(', ')}`,
      );
      continue;
    }
    const [arch] = archs;
    if (byArch.has(arch)) problems.push(`${file.url}: ${byArch.get(arch)} is for ${arch} too`);
    else byArch.set(arch, file.url);
    if (version && !file.url.includes(`-${version}-`)) {
      problems.push(`${file.url}: an installer's name must hold the feed's version (${version})`);
    }
  }
  // A release has one for every processor: with none of its own, electron-updater takes the first
  // .exe, and an arm64 Drafter would install the x64 build over itself without a word.
  if (release) {
    for (const arch of WINDOWS_ARCHS) {
      if (!byArch.has(arch)) problems.push(`latest.yml names no installer for ${arch}`);
    }
  }
  return problems;
}

/**
 * @param {{ release?: boolean }} [options] `release`: a release's feed, which must list an
 *   installer for every processor in WINDOWS_ARCHS (the update test's lists only its own)
 * @returns {string[]} what is wrong, empty when the feed and the packages agree.
 */
export function checkFeed(dir, feedName = 'latest-linux.yml', options = {}) {
  const feed = join(dir, feedName);
  if (!existsSync(feed)) return [`${feed} does not exist`];
  const { files, top } = parse(readFileSync(feed, 'utf8'));
  const problems = [];
  if (files.length === 0) problems.push(`${feedName} names no files`);
  if (!top.version) problems.push(`${feedName} has no \`version\``);
  if (feedName === 'latest-linux.yml') problems.push(...linuxProblems(files));
  else if (feedName === 'latest.yml')
    problems.push(...windowsProblems(files, top.version, options.release === true));
  else problems.push(`${feedName}: not a feed this release has (latest-linux.yml, latest.yml)`);
  for (const file of files) {
    const path = join(dir, file.url);
    // A name must stay inside the folder, and be only a name.
    if (file.url.includes('/') || file.url.includes('\\') || file.url.startsWith('.')) {
      problems.push(`${file.url}: not a plain file name`);
      continue;
    }
    if (!existsSync(path)) {
      problems.push(`${file.url}: named in ${feedName} but not in ${dir}`);
      continue;
    }
    const bytes = readFileSync(path);
    const sha512 = createHash('sha512').update(bytes).digest('base64');
    if (file.sha512 !== sha512) {
      problems.push(`${file.url}: sha512 is ${sha512} but ${feedName} says ${file.sha512}`);
    }
    if (file.size !== null && Number(file.size) !== statSync(path).size) {
      problems.push(
        `${file.url}: size is ${statSync(path).size} but ${feedName} says ${file.size}`,
      );
    }
  }
  if (!top.path) problems.push(`${feedName} has no \`path\``);
  else {
    const named = files.find((file) => file.url === top.path);
    if (!named) problems.push(`path ${top.path} is not one of the files it lists`);
    else if (top.sha512 !== named.sha512) {
      problems.push(`${top.path}: the top-level sha512 differs from the one in files`);
    }
  }
  return problems;
}

/** Every feed named checked, and when there are several, the same version in each. */
export function checkFeeds(dir, feedNames = ['latest-linux.yml'], options = {}) {
  const problems = feedNames.flatMap((name) => checkFeed(dir, name, options));
  const versions = new Set(feedNames.map((name) => feedVersion(dir, name)));
  if (feedNames.length > 1 && versions.size > 1) {
    problems.push(
      `the feeds give different versions: ${feedNames.map((name) => `${name} ${feedVersion(dir, name)}`).join(', ')}`,
    );
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const [dir, ...named] = args.filter((arg) => arg !== '--release');
  if (!dir) {
    console.error(
      'usage: node scripts/check-update-feed.mjs <folder> [latest-linux.yml] [latest.yml]',
    );
    process.exit(2);
  }
  const feeds = named.length > 0 ? named : ['latest-linux.yml'];
  const problems = checkFeeds(dir, feeds, { release });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log(
    `${feeds.join(' and ')} agree${feeds.length === 1 ? 's' : ''} with the files in ${dir}`,
  );
}
