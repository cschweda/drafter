// publish.sh, at the repository's root: how the maintainer puts a release's drafter-mcp on npm, by
// hand. Only what can run without publishing is run here: its syntax, its usage, and its refusals.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'publish.sh');
const text = readFileSync(SCRIPT, 'utf8');
const bash = spawnSync('bash', ['--version']).status === 0;
const shellcheck = spawnSync('shellcheck', ['--version']).status === 0;

const run = (...args: string[]) =>
  spawnSync('bash', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 20_000 });

describe.skipIf(!bash)('publish.sh', () => {
  it('is valid bash', () => {
    const check = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
  });

  it('--help prints the usage and exits 0', () => {
    for (const flag of ['--help', '-h']) {
      const got = run(flag);
      expect(got.status, got.stderr).toBe(0);
      expect(got.stdout).toMatch(/Usage:/);
      expect(got.stdout).toMatch(/\.\/publish\.sh --dry-run/);
    }
  });

  it('anything else on the command line stops it, with the usage', () => {
    for (const args of [['extra'], ['patch'], ['0.24.2'], ['--dry-run', 'extra']]) {
      const got = run(...args);
      expect(got.status).not.toBe(0);
      expect(got.stdout + got.stderr).toMatch(/Usage:/);
    }
  });

  it('never changes the repository: no version bump, commit, tag, or push', () => {
    const code = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    for (const banned of [/npm version/, /git push/, /git tag/, /git commit/])
      expect(code).not.toMatch(banned);
  });

  it('starts as a bash script that stops at the first failure', () => {
    expect(text.split('\n')[0]).toBe('#!/usr/bin/env bash');
    expect(text).toMatch(/^set -euo pipefail$/m);
  });

  it('once npm publish succeeds, waits up to 15 minutes for npm to list it, and never fails', () => {
    const at = text.indexOf('npm publish "$TARBALL" --access public');
    expect(at).toBeGreaterThan(0);
    const after = text.slice(at);
    // The publish worked: nothing after it stops the script with a failure.
    expect(after).not.toMatch(/^\s*die\b|\|\|\s*die\b|\bexit [1-9]/m);
    expect(after).toMatch(/^POLL_SECONDS=20$/m);
    expect(after).toMatch(/^POLL_FOR_SECONDS=900$/m);
    expect(after).toContain('Published. Waiting for npm to list it (this can take 5–10 minutes)…');
    expect(after).toContain(
      'npm accepted the publish, but doesn’t list it yet; that can take a while. Check https://www.npmjs.com/package/$PACKAGE_NAME later. Don’t run ./publish.sh again for this version.',
    );
  });

  it.skipIf(!shellcheck)('passes shellcheck', () => {
    const check = spawnSync('shellcheck', [SCRIPT], { encoding: 'utf8' });
    expect(check.status, check.stdout).toBe(0);
  });
});
