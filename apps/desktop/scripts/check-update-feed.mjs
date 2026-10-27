// Checks latest-linux.yml (the updater's feed, written by electron-builder) against the packages
// next to it: every file it names exists in the folder, with the size and the sha512 it says, and
// the file it names as `path` is one of them, and the AppImage's name holds no version. Run before a release is published (the workflow's
// `publish` job, and after packaging): `node scripts/check-update-feed.mjs <folder>`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The feed's lines, read as the small, flat YAML electron-builder writes. */
function parse(text) {
  const files = [];
  let top = { path: null, sha512: null };
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    let match = /^\s*-\s+url:\s*(.+?)\s*$/.exec(line);
    if (match) {
      current = { url: match[1], sha512: null, size: null };
      files.push(current);
      continue;
    }
    match = /^(path|sha512):\s*(.+?)\s*$/.exec(line);
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

/** @returns {string[]} what is wrong, empty when the feed and the packages agree. */
export function checkFeed(dir) {
  const feed = join(dir, 'latest-linux.yml');
  if (!existsSync(feed)) return [`${feed} does not exist`];
  const { files, top } = parse(readFileSync(feed, 'utf8'));
  const problems = [];
  if (files.length === 0) problems.push('latest-linux.yml names no files');
  if (!files.some((file) => file.url.endsWith('.AppImage'))) {
    problems.push('latest-linux.yml names no AppImage (the updater needs one)');
  }
  for (const file of files) {
    const path = join(dir, file.url);
    // A name must stay inside the folder, and be only a name.
    if (file.url.includes('/') || file.url.includes('\\') || file.url.startsWith('.')) {
      problems.push(`${file.url}: not a plain file name`);
      continue;
    }
    // A versioned AppImage would be installed under the next version's name (see the AppImage's
    // artifactName in electron-builder.config.cjs), leaving launchers pointing at a deleted file.
    if (file.url.endsWith('.AppImage') && /\d+\.\d+\.\d+/.test(file.url)) {
      problems.push(
        `${file.url}: an AppImage's name must not carry a version (an update must replace it in place)`,
      );
    }
    if (!existsSync(path)) {
      problems.push(`${file.url}: named in latest-linux.yml but not in ${dir}`);
      continue;
    }
    const bytes = readFileSync(path);
    const sha512 = createHash('sha512').update(bytes).digest('base64');
    if (file.sha512 !== sha512) {
      problems.push(`${file.url}: sha512 is ${sha512} but latest-linux.yml says ${file.sha512}`);
    }
    if (file.size !== null && Number(file.size) !== statSync(path).size) {
      problems.push(
        `${file.url}: size is ${statSync(path).size} but latest-linux.yml says ${file.size}`,
      );
    }
  }
  if (!top.path) problems.push('latest-linux.yml has no `path`');
  else {
    const named = files.find((file) => file.url === top.path);
    if (!named) problems.push(`path ${top.path} is not one of the files it lists`);
    else if (top.sha512 !== named.sha512) {
      problems.push(`${top.path}: the top-level sha512 differs from the one in files`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/check-update-feed.mjs <folder with latest-linux.yml>');
    process.exit(2);
  }
  const problems = checkFeed(dir);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log(`latest-linux.yml agrees with the files in ${dir}`);
}
