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

  it.skipIf(!shellcheck)('passes shellcheck', () => {
    const check = spawnSync('shellcheck', [SCRIPT], { encoding: 'utf8' });
    expect(check.status, check.stdout).toBe(0);
  });
});
