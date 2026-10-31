// What a release carries, and whether a GitHub Release holds it. A release is the Linux packages
// (the AppImage, the .deb, latest-linux.yml) and the Windows installer (x64, latest.yml): five files,
// all built from one tag, and nothing goes up unless all of them are there.
//   node scripts/check-release-assets.mjs --list <folder>
//     checks the folder holds exactly one of each and prints their names, one a line (the files
//     .github/scripts/publish-release.sh uploads)
//   gh api repos/OWNER/REPO/releases/ID --jq .assets | node scripts/check-release-assets.mjs <folder>
//     checks the release holds each file as an uploaded asset of the same name and size, and, when
//     the API gives a digest ("sha256:…"), of the same content. The script uses it both to check a
//     draft after uploading and to decide whether a release that is already published is the same
//     build (it is never uploaded to).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Each file a release must carry: one in the folder for each. */
export const RELEASE_FILES = [
  { what: 'an AppImage', test: (name) => name.endsWith('.AppImage') },
  { what: 'a .deb', test: (name) => name.endsWith('.deb') },
  { what: 'latest-linux.yml', test: (name) => name === 'latest-linux.yml' },
  { what: 'the x64 Windows installer', test: (name) => /-windows-x64-setup\.exe$/.test(name) },
  { what: 'latest.yml', test: (name) => name === 'latest.yml' },
];

/** The files in the folder that a release carries, by name. */
export function packageFiles(dir) {
  return readdirSync(dir)
    .filter((name) => RELEASE_FILES.some((kind) => kind.test(name)))
    .sort();
}

/** What is missing from the folder, or there twice; empty when it holds exactly one of each. */
export function folderProblems(dir) {
  const files = packageFiles(dir);
  const problems = [];
  for (const kind of RELEASE_FILES) {
    const found = files.filter((name) => kind.test(name));
    if (found.length === 0) problems.push(`${dir} has no ${kind.what.replace(/^(an?|the) /, '')}`);
    if (found.length > 1)
      problems.push(`${dir} has more than one of ${kind.what}: ${found.join(', ')}`);
  }
  return problems.length > 0
    ? [`expected ${RELEASE_FILES.map((kind) => kind.what).join(', ')}; ${problems.join('; ')}`]
    : [];
}

/**
 * @param {string} dir the folder with the packages
 * @param {{ name: string, size: number, state?: string, digest?: string | null }[]} assets the release's
 * @returns {string[]} what differs, empty when the release holds exactly these files and no others
 */
export function compareAssets(dir, assets) {
  const wrong = folderProblems(dir);
  if (wrong.length > 0) return wrong;
  const problems = [];
  const files = packageFiles(dir);
  // Both ways: nothing on the release that this build didn't make (a left-over upload would be a
  // file people could download, and the updater could be pointed at).
  for (const asset of assets) {
    if (!files.includes(asset.name)) {
      problems.push(`${asset.name}: on the release, but not one of this build’s files`);
    }
  }
  for (const name of files) {
    const asset = assets.find((candidate) => candidate.name === name);
    if (!asset) {
      problems.push(`${name}: not on the release`);
      continue;
    }
    if (asset.state !== undefined && asset.state !== 'uploaded') {
      problems.push(`${name}: the release has it as "${asset.state}", not uploaded`);
    }
    const path = join(dir, name);
    if (asset.size !== statSync(path).size) {
      problems.push(`${name}: ${asset.size} bytes on the release, ${statSync(path).size} here`);
      continue;
    }
    const digest = typeof asset.digest === 'string' ? asset.digest : '';
    if (digest.startsWith('sha256:')) {
      const here = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (digest !== `sha256:${here}`) {
        problems.push(`${name}: its digest on the release is ${digest}, here sha256:${here}`);
      }
    }
  }
  return problems;
}

const fail = (problems) => {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args[0] === '--list' && args[1]) {
    const problems = folderProblems(args[1]);
    if (problems.length > 0) fail(problems);
    for (const name of packageFiles(args[1])) console.log(name);
  } else if (args[0] && !args[0].startsWith('-')) {
    const dir = args[0];
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const problems = compareAssets(dir, JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (problems.length > 0) fail(problems);
      console.log(`The release holds exactly the files in ${dir}`);
    });
  } else {
    console.error(
      'usage: node scripts/check-release-assets.mjs --list <folder>\n' +
        '       <assets JSON> | node scripts/check-release-assets.mjs <folder>',
    );
    process.exit(2);
  }
}
