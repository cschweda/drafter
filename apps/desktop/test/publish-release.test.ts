// .github/scripts/publish-release.sh, run for real against a pretend GitHub: a `gh` of the test's
// own on PATH keeps the releases in a JSON file and logs every call. What a tag's run would do to
// the repository is seen without touching it: the draft, the uploads, the check, the publish, and
// that nothing is made or published when a file is missing or arrives changed.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCRIPT = join(ROOT, '.github/scripts/publish-release.sh');

const has = (command: string) => spawnSync('sh', ['-c', `command -v ${command}`]).status === 0;
// The script is bash with jq, as on the Linux runner that publishes; not run on Windows.
const runnable = process.platform !== 'win32' && has('bash') && has('jq');

/** The pretend `gh`: the few calls the script makes, on releases kept in $FAKE_GH_STATE. */
const FAKE_GH = `#!/usr/bin/env node
const { appendFileSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { basename } = require('node:path');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
const save = () => writeFileSync(file, JSON.stringify(state));
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const repo = 'repos/' + process.env.GH_REPO + '/releases';
if (args[0] === 'api') {
  const path = args.find((a) => a.startsWith('repos/'));
  const jq = flag('--jq');
  if (args.includes('-X')) {
    const release = state.releases.find((r) => repo + '/' + r.id === path);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-F') { const [k, v] = args[i + 1].split('='); release[k] = v === 'true'; }
    }
    save();
    console.log('https://github.com/x/releases/tag/' + release.tag_name);
  } else if (path === repo) {
    console.log(JSON.stringify(state.releases));
  } else {
    const release = state.releases.find((r) => repo + '/' + r.id === path);
    console.log(JSON.stringify(jq === '.assets' ? release.assets : release));
  }
} else if (args[0] === 'release' && args[1] === 'create') {
  state.releases.push({ id: state.next++, tag_name: args[2], draft: true, prerelease: false, assets: [] });
  save();
} else if (args[0] === 'release' && args[1] === 'upload') {
  const release = state.releases.filter((r) => r.tag_name === args[2] && r.draft).pop();
  for (const path of args.slice(3).filter((a) => !a.startsWith('--'))) {
    const name = basename(path);
    let bytes = readFileSync(path);
    // A file that arrives changed, as a broken upload would leave it.
    if (process.env.FAKE_GH_CORRUPT === name) bytes = Buffer.from(bytes.toString('latin1').replace(/.$/, '?'), 'latin1');
    release.assets = release.assets.filter((a) => a.name !== name);
    release.assets.push({ name, size: statSync(path).size, state: 'uploaded',
      digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') });
  }
  save();
} else {
  console.error('fake gh: no ' + args.join(' '));
  process.exit(9);
}
`;

const sha512 = (text: string) => createHash('sha512').update(text).digest('base64');

let dir: string;
let release: string;
let bin: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-publish-'));
  release = join(dir, 'release');
  bin = join(dir, 'bin');
  await mkdir(release);
  await mkdir(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  setState([]);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const state = () =>
  JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
    releases: {
      id: number;
      tag_name: string;
      draft: boolean;
      prerelease: boolean;
      assets: { name: string }[];
    }[];
  };
function setState(releases: object[]) {
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ next: 100 + releases.length, releases }));
}
const calls = () =>
  existsSync(join(dir, 'gh.log'))
    ? readFileSync(join(dir, 'gh.log'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as string[]).slice(0, 2).join(' '))
    : [];

/** A release's files, as the Linux and Windows jobs leave them, with feeds that agree. */
function files(version = '1.2.3', skip: string[] = []) {
  const linux = { image: 'Drafter-x86_64.AppImage', deb: `Drafter-${version}-linux-amd64.deb` };
  const windows = [
    `Drafter-${version}-windows-x64-setup.exe`,
    `Drafter-${version}-windows-arm64-setup.exe`,
  ];
  const write = (name: string, text: string) => {
    if (!skip.includes(name)) writeFileSync(join(release, name), text);
  };
  for (const name of [linux.image, linux.deb, ...windows]) write(name, `the ${name}`);
  const entry = (name: string) =>
    `  - url: ${name}\n    sha512: ${sha512(`the ${name}`)}\n    size: ${Buffer.byteLength(`the ${name}`)}`;
  write(
    'latest-linux.yml',
    `version: ${version}\nfiles:\n${entry(linux.image)}\n${entry(linux.deb)}\npath: ${linux.image}\nsha512: ${sha512(`the ${linux.image}`)}\n`,
  );
  write(
    'latest.yml',
    `version: ${version}\nfiles:\n${windows.map(entry).join('\n')}\npath: ${windows[0]}\nsha512: ${sha512(`the ${windows[0]}`)}\n`,
  );
}

function publish(tag: string, env: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, tag, release], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_REPO: 'cschweda/drafter',
      GH_TOKEN: 'not-a-token',
      FAKE_GH_STATE: join(dir, 'state.json'),
      FAKE_GH_LOG: join(dir, 'gh.log'),
      ...env,
    },
  });
}

describe.skipIf(!runnable)('publish-release.sh', () => {
  test('makes a draft, uploads the Linux and Windows files, checks them, then publishes', () => {
    files();
    const run = publish('v1.2.3');
    expect(run.status, run.stderr).toBe(0);
    const [made] = state().releases;
    expect(made?.draft).toBe(false);
    expect(made?.prerelease).toBe(false);
    expect(made?.assets.map((a) => a.name).sort()).toEqual(
      [
        'Drafter-1.2.3-linux-amd64.deb',
        'Drafter-1.2.3-windows-arm64-setup.exe',
        'Drafter-1.2.3-windows-x64-setup.exe',
        'Drafter-x86_64.AppImage',
        'latest-linux.yml',
        'latest.yml',
      ].sort(),
    );
    // Published only after the upload and the check.
    expect(calls().filter((c) => c !== 'api --paginate')).toEqual([
      'release create',
      'release upload',
      'api repos/cschweda/drafter/releases/100',
      'api -X',
    ]);
  });

  test('makes nothing when the Windows files are missing (the Linux ones alone are no release)', () => {
    files('1.2.3', ['Drafter-1.2.3-windows-arm64-setup.exe']);
    // latest.yml names it, so the feed check is the first to refuse.
    let run = publish('v1.2.3');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/arm64-setup\.exe: named in latest\.yml but not in/);
    for (const name of ['Drafter-1.2.3-windows-x64-setup.exe', 'latest.yml']) {
      execFileSync('rm', ['-f', join(release, name)]);
    }
    run = publish('v1.2.3');
    expect(run.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(state().releases).toEqual([]);
  });

  test('makes nothing when latest.yml lists only one processor’s installer', () => {
    files();
    const feed = readFileSync(join(release, 'latest.yml'), 'utf8');
    // The arm64 entry dropped from the feed (its file still in the folder).
    writeFileSync(
      join(release, 'latest.yml'),
      feed.replace(/ {2}- url: Drafter-1\.2\.3-windows-arm64-setup\.exe\n(?: {4}.*\n)+/, ''),
    );
    const run = publish('v1.2.3');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/names no installer for arm64/);
    expect(calls()).toEqual([]);
  });

  test('makes nothing when the feeds give different versions', () => {
    files('1.2.3');
    writeFileSync(
      join(release, 'latest.yml'),
      readFileSync(join(release, 'latest.yml'), 'utf8').replace('version: 1.2.3', 'version: 1.2.4'),
    );
    const run = publish('v1.2.3');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/different versions/);
    expect(calls()).toEqual([]);
  });

  test('leaves the release a draft when a file arrives changed', () => {
    files();
    const run = publish('v1.2.3', { FAKE_GH_CORRUPT: 'Drafter-1.2.3-windows-x64-setup.exe' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/x64-setup\.exe: its digest on the release/);
    expect(state().releases[0]?.draft).toBe(true);
    expect(calls()).not.toContain('api -X');
  });

  test('a published release is only compared, never uploaded to', () => {
    files();
    expect(publish('v1.2.3').status).toBe(0);
    execFileSync('rm', ['-f', join(dir, 'gh.log')]);
    const again = publish('v1.2.3');
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/already published: not uploading/);
    expect(calls()).not.toContain('release upload');
  });

  test('a tag with a "-" is published as a pre-release', () => {
    files('1.2.3-rc.1');
    const run = publish('v1.2.3-rc.1');
    expect(run.status, run.stderr).toBe(0);
    expect(state().releases[0]?.prerelease).toBe(true);
  });
});
