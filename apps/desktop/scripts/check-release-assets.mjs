// Compares what a GitHub Release holds with the packages in a folder: each file must be on the
// release as an uploaded asset of the same name and size, and, when the API gives a digest
// ("sha256:…"), of the same content. Used by .github/scripts/publish-release.sh both to check a
// draft after uploading and to decide whether a release that is already published is the same
// build (it is never uploaded to):
//   gh api repos/OWNER/REPO/releases/ID --jq .assets | node scripts/check-release-assets.mjs <folder>
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The files a release carries: the AppImage, the .deb, and the update feed. */
export function packageFiles(dir) {
  return readdirSync(dir)
    .filter((name) => /\.(AppImage|deb)$/.test(name) || name === 'latest-linux.yml')
    .sort();
}

/**
 * @param {string} dir the folder with the packages
 * @param {{ name: string, size: number, state?: string, digest?: string | null }[]} assets the release's
 * @returns {string[]} what differs, empty when the release holds exactly these files
 */
export function compareAssets(dir, assets) {
  const files = packageFiles(dir);
  if (files.length !== 3) {
    return [
      `expected an AppImage, a .deb, and latest-linux.yml in ${dir}; found: ${files.join(', ')}`,
    ];
  }
  const problems = [];
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: <assets JSON> | node scripts/check-release-assets.mjs <folder>');
    process.exit(2);
  }
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const problems = compareAssets(dir, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (problems.length > 0) {
      for (const problem of problems) console.error(`::error::${problem}`);
      process.exit(1);
    }
    console.log(`The release holds exactly the files in ${dir}`);
  });
}
