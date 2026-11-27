import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

// scripts/git-hooks.mjs, `pnpm install`'s prepare step (red/blue audit of 23 November 2026, S1):
// Git must never be pointed at the tracked .githooks folder, or checking out a branch runs that
// branch's hooks. Tried in a throwaway repository with its own settings, never this one.

const SCRIPT = fileURLToPath(new URL('../../../scripts/git-hooks.mjs', import.meta.url));
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repository() {
  const dir = mkdtempSync(join(tmpdir(), 'drafter-hooks-'));
  made.push(dir);
  const home = join(dir, 'home');
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home,
    GIT_CONFIG_GLOBAL: join(home, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
  };
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, '.githooks'), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  const hook = (name: string, body: string) => {
    writeFileSync(join(repo, '.githooks', name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(repo, '.githooks', name), 0o755);
  };
  const install = (cwd = repo) =>
    execFileSync('node', [SCRIPT], { cwd, env, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  hook('pre-push', 'exit 0');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return { repo, git, hook, install, env };
}

describe('the Git hooks step', () => {
  test('takes the hooks path away, and a branch’s hook doesn’t run at checkout', () => {
    const { repo, git, hook, install } = repository();
    git('config', 'core.hooksPath', '.githooks');
    install();
    expect(() => git('config', '--get', 'core.hooksPath')).toThrow();
    expect(readFileSync(join(repo, '.git', 'hooks', 'pre-push'), 'utf8')).toContain('exit 0');
    // A pull request's branch with a hook of its own.
    git('checkout', '-q', '-b', 'pr');
    hook('post-checkout', 'echo ran > ran.txt');
    hook('pre-push', 'echo changed > changed.txt');
    git('add', '-A');
    git('commit', '-q', '-m', 'hostile');
    git('checkout', '-q', 'main');
    git('checkout', '-q', 'pr');
    expect(existsSync(join(repo, 'ran.txt'))).toBe(false);
    // The installed hook is still the one installed, not the branch's.
    expect(readFileSync(join(repo, '.git', 'hooks', 'pre-push'), 'utf8')).not.toContain('changed');
  });

  test('installs from the top of the work tree, wherever it is run from, and twice over', () => {
    const { repo, install } = repository();
    mkdirSync(join(repo, 'sub'));
    install(join(repo, 'sub'));
    install();
    expect(existsSync(join(repo, '.git', 'hooks', 'pre-push'))).toBe(true);
  });

  test('stops, saying where, when the path is set somewhere it doesn’t change', () => {
    const { git, install } = repository();
    git('config', '--global', 'core.hooksPath', '.githooks');
    let message = '';
    try {
      install();
    } catch (error) {
      message = String((error as { stderr?: string }).stderr);
    }
    expect(message).toMatch(/still pointed at a hooks folder/);
    expect(message).toMatch(/gitconfig/);
  });
});
