// The folders the server may read: each `--folder`, resolved once at start (§7.1).
import { realpath, stat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

/** A folder the server may read: the name tool paths start with, and its real path. */
export interface Root {
  name: string;
  real: string;
}

/** Why the server won't start, in words. */
export class StartError extends Error {}

/** Whether `real` is `root` or inside it, comparing whole parts (`/a/Scripts2` isn't in `/a/Scripts`). */
export function isInside(real: string, root: string, platform: NodeJS.Platform): boolean {
  const { sep } = platform === 'win32' ? win32 : posix;
  return real === root || real.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Each folder's real path, checked to be a folder and not a whole drive. A folder that is, or is
 * inside, another one given is the same root, so it is dropped: every file has one name. Names are
 * the folder's own; when two are alike (in any case), the second is "Scripts (2)", the third
 * "Scripts (3)".
 */
export async function resolveRoots(
  folders: readonly string[],
  platform: NodeJS.Platform,
): Promise<Root[]> {
  const path = platform === 'win32' ? win32 : posix;
  const reals: string[] = [];
  for (const folder of folders) {
    let real: string;
    try {
      real = await realpath(folder);
      if (!(await stat(real)).isDirectory()) throw new Error('not a folder');
    } catch {
      throw new StartError(`${folder} isn’t a folder.`);
    }
    if (path.parse(real).root === real)
      throw new StartError(`Choose a folder, not a whole drive: ${folder}.`);
    reals.push(real);
  }

  // Keep the first of each, and only folders no other folder holds.
  const kept = reals.filter(
    (real, i) =>
      reals.indexOf(real) === i &&
      !reals.some((other) => other !== real && isInside(real, other, platform)),
  );

  const used = new Set<string>();
  return kept.map((real) => {
    const base = path.basename(real);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    return { name, real };
  });
}
