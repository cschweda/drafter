// `pnpm install`'s prepare step: copies the hooks in .githooks into Git's own hooks folder.
//
// Git is never pointed at .githooks itself (`core.hooksPath`), as it was until 2026-11-23. A
// tracked folder as the hooks path means Git runs whatever hook the branch being checked out
// holds, at once: a pull request that added `.githooks/post-checkout` ran its code on the machine
// of whoever checked it out, before any review (red/blue audit of 23 November 2026, S1). Copied,
// a hook changes only when `pnpm install` is run, which already runs the branch's own scripts.
//
// A branch from before this change still has the old script: `pnpm install` on one sets the path
// again, for the whole clone. This script takes it away each time it runs, and stops with an
// error if the path is still set somewhere it can't reach (a global or a per-worktree setting).
//
// Outside a Git work tree (the Docker build has neither Git nor .git) there is nothing to set; a
// real failure still stops.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The hooks this repository installs: no others are copied, whatever the folder holds. */
const HOOKS = ['pre-push'];

const git = (...args) => execFileSync('git', args, { stdio: 'pipe', encoding: 'utf8' }).trim();
const quietly = (...args) => {
  try {
    return git(...args);
  } catch {
    return '';
  }
};

let inWorkTree = true;
try {
  git('rev-parse', '--git-dir');
} catch {
  inWorkTree = false;
}

if (inWorkTree) {
  // The setting from before, if this clone still has it: it would keep Git reading the folder.
  quietly('config', '--local', '--unset-all', 'core.hooksPath');
  quietly('config', '--worktree', '--unset-all', 'core.hooksPath');
  // Still set, then, from somewhere this script doesn't change: say so, and stop.
  const still = quietly('config', '--show-origin', '--get-all', 'core.hooksPath');
  if (still !== '') {
    console.error(
      `Git is still pointed at a hooks folder by a setting this script doesn't change:\n${still}\n` +
        'With a tracked folder as the hooks path, checking out a branch runs that branch’s hooks. ' +
        'Take the setting away (git config --global --unset-all core.hooksPath), then install again.',
    );
    process.exit(1);
  }
  // From the top of the work tree, wherever this is run from. Every work tree of a clone shares
  // one hooks folder, in the common Git directory.
  const top = git('rev-parse', '--show-toplevel');
  const hooks = join(resolve(top, git('rev-parse', '--git-common-dir')), 'hooks');
  mkdirSync(hooks, { recursive: true });
  for (const name of HOOKS) {
    const from = join(top, '.githooks', name);
    // A plain file only: a link would install whatever it pointed at.
    if (!existsSync(from) || !lstatSync(from).isFile()) continue;
    const to = join(hooks, name);
    copyFileSync(from, to);
    chmodSync(to, 0o755);
  }
}
