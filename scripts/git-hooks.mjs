// `pnpm install`'s prepare step: copies the hooks in .githooks into Git's own hooks folder.
//
// Git is never pointed at .githooks itself (`core.hooksPath`), as it was until 2026-11-23. A
// tracked folder as the hooks path means Git runs whatever hook the branch being checked out
// holds, at once: a pull request that added `.githooks/post-checkout` ran its code on the machine
// of whoever checked it out, before any review (red/blue audit of 23 November 2026, S1). Copied,
// a hook changes only when `pnpm install` is run, which already runs the branch's own scripts.
//
// Outside a Git work tree (the Docker build has neither Git nor .git) there is nothing to set; a
// real failure still stops.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The hooks this repository installs: no others are copied, whatever the folder holds. */
const HOOKS = ['pre-push'];

const git = (...args) => execFileSync('git', args, { stdio: 'pipe', encoding: 'utf8' }).trim();

let inWorkTree = true;
try {
  git('rev-parse', '--git-dir');
} catch {
  inWorkTree = false;
}

if (inWorkTree) {
  // The setting from before, if this clone still has it: it would keep Git reading the folder.
  try {
    git('config', '--unset-all', 'core.hooksPath');
  } catch {
    // Not set: nothing to take away.
  }
  // Every work tree of a clone shares one hooks folder, in the common Git directory.
  const hooks = join(resolve(git('rev-parse', '--git-common-dir')), 'hooks');
  mkdirSync(hooks, { recursive: true });
  const tracked = existsSync('.githooks') ? readdirSync('.githooks') : [];
  for (const name of HOOKS) {
    if (!tracked.includes(name)) continue;
    const to = join(hooks, name);
    copyFileSync(join('.githooks', name), to);
    chmodSync(to, 0o755);
  }
}
