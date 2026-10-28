// Checks resources/app-update.yml in a packaged app: electron-updater reads it for where updates
// come from (this repository's releases) and, on Windows, whose Authenticode signature a downloaded
// installer must carry (`publisherName`). Drafter is unsigned for now: with no publisherName,
// electron-updater checks an update's sha512 against latest.yml and no signature
// (docs/DECISIONS.md, "Updates on Windows"). Once a signing identity is configured, electron-builder
// writes the name, and this check fails a signed build that lacks it, so signing can't land
// without turning the signature check on.
//   node scripts/check-update-config.mjs <app-update.yml> [--signatures <json>]
// The JSON is what Get-AuthenticodeSignature says of the built executables (CI's `windows` job):
// a signed build must name its signer as the publisher, whatever the configuration seems to say.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** The signing settings electron-builder reads, from `win.signtoolOptions` or (older) `win`. */
const SIGNING_KEYS = ['sign', 'certificateFile', 'certificateSha1', 'certificateSubjectName'];

/**
 * Whether the build will be signed: a certificate in the environment (electron-builder's
 * CSC_LINK or WIN_CSC_LINK), Azure Trusted Signing, or any signtool setting that signs: a
 * publisher name, a custom signer (`sign`, as for an HSM or SSL.com eSigner, for which
 * electron-builder writes no publisherName), a certificate file, a thumbprint, or a subject. The
 * build itself is checked as well (`signatureProblems`), whatever this says.
 */
export function signingConfigured(config, env) {
  const win = config.win ?? {};
  const signtool = win.signtoolOptions ?? {};
  return Boolean(
    env.CSC_LINK ||
      env.WIN_CSC_LINK ||
      win.azureSignOptions ||
      signtool.publisherName ||
      SIGNING_KEYS.some((key) => signtool[key] || win[key]),
  );
}

/** The names in app-update.yml's `publisherName` (one, or a YAML list), unquoted. */
export function publisherNames(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => /^publisherName:/.test(line));
  if (at < 0) return [];
  const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, '$2');
  const inline = lines[at].replace(/^publisherName:/, '').trim();
  if (inline) return [unquote(inline)];
  const names = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (!item) break;
    names.push(unquote(item[1]));
  }
  return names;
}

/** The CN of a certificate subject (`CN=Name, O=…` or `CN="Name, Inc.", …`). */
const commonName = (subject) => {
  const match = /(?:^|,\s*)CN=(?:"([^"]*)"|([^,]*))/.exec(subject ?? '');
  return (match?.[1] ?? match?.[2] ?? '').trim();
};

/**
 * What is wrong, given the built files' Authenticode signatures (`Get-AuthenticodeSignature`:
 * `{ path, status, subject }`): any file that carries a signature (any status but NotSigned) means
 * the build is signed, so app-update.yml must name a publisher, and the signer must be one it
 * names; otherwise electron-updater would check no signature, or refuse every update.
 */
export function signatureProblems(text, signatures) {
  const names = publisherNames(text);
  const problems = [];
  for (const { path, status, subject } of signatures) {
    if (status === 'NotSigned') continue;
    const signer = commonName(subject);
    if (names.length === 0) {
      problems.push(
        `${path} is signed (CN=${signer}), but app-update.yml has no publisherName: electron-updater would not check an update’s signature`,
      );
    } else if (!names.includes(signer)) {
      problems.push(
        `${path} is signed by ${signer}, which publisherName (${names.join(', ')}) doesn’t name: every update would be refused`,
      );
    }
  }
  return problems;
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
  // `--signatures <json>`: what Get-AuthenticodeSignature said of the built files.
  const at = process.argv.indexOf('--signatures');
  if (at > 0) {
    const raw = JSON.parse(readFileSync(process.argv[at + 1], 'utf8').replace(/^\uFEFF/, ''));
    problems.push(...signatureProblems(text, Array.isArray(raw) ? raw : [raw]));
  }
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
