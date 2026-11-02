// `pnpm install`'s prepare step: points Git at .githooks. Outside a Git work tree (the Docker build
// has neither Git nor .git) there is nothing to set; a real failure to set it still stops.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { stdio: 'pipe' });

let inWorkTree = true;
try {
  git('rev-parse', '--git-dir');
} catch {
  inWorkTree = false;
}
if (inWorkTree) git('config', 'core.hooksPath', '.githooks');
