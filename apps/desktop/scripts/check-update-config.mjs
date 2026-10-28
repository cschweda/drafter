// Checks resources/app-update.yml in a packaged app: electron-updater reads it for where updates
// come from (this repository's releases) and, on Windows, whose Authenticode signature a downloaded
// installer must carry (`publisherName`). Drafter is unsigned for now: with no publisherName,
// electron-updater checks an update's sha512 against latest.yml and no signature
// (docs/DECISIONS.md, "Updates on Windows"). Once a signing identity is configured, electron-builder
// writes the name, and this check fails a signed build that lacks it, so signing can't land
// without turning the signature check on.
//   node scripts/check-update-config.mjs <app-update.yml>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Whether the build will be signed: a certificate in the environment (electron-builder's
 * CSC_LINK or WIN_CSC_LINK), or Azure Trusted Signing or signtool settings in the config.
 */
export function signingConfigured(config, env) {
  const win = config.win ?? {};
  return Boolean(
    env.CSC_LINK || env.WIN_CSC_LINK || win.azureSignOptions || win.signtoolOptions?.publisherName,
  );
}

/** What is wrong with app-update.yml's text; empty when it is the release's. */
export function updateConfigProblems(text, { signed }) {
  const value = (key) => new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*\\r?$`, 'm').exec(text)?.[1];
  const problems = [];
  if (value('provider') !== 'github') problems.push('provider is not github');
  if (value('owner') !== 'cschweda' || value('repo') !== 'drafter') {
    problems.push('owner/repo is not cschweda/drafter');
  }
  if (value('updaterCacheDirName') !== 'drafter-updater') {
    problems.push(`updaterCacheDirName is ${value('updaterCacheDirName')}, not drafter-updater`);
  }
  const publisher = value('publisherName');
  if (signed && publisher === undefined) {
    problems.push(
      'the build is signed, but app-update.yml has no publisherName: electron-updater would not check an update’s signature',
    );
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/check-update-config.mjs <resources/app-update.yml>');
    process.exit(2);
  }
  const config = createRequire(import.meta.url)('../electron-builder.config.cjs');
  const signed = signingConfigured(config, process.env);
  const text = readFileSync(file, 'utf8');
  const problems = updateConfigProblems(text, { signed });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log(
    /^publisherName:/m.test(text)
      ? `${file}: signed; electron-updater checks each update's signature and sha512`
      : `${file}: unsigned; electron-updater checks each update's sha512 (no signature to check)`,
  );
}
