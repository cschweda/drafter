// What the build needs to know about the repository's `modules/` folder (Phase 1 design §5.8)
// before any of the modules' code runs: which folders are modules, what ids they declare, and
// which icons they name. The app finds the modules itself with `import.meta.glob`; this is for
// the checks only a build can make, and for the icons it must bundle, since a build with no
// network has nowhere else to get an icon from.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The folders of `modulesDir` that hold an `index.ts`, sorted. A missing `modules/` folder, or one
 * with no module in it, gives an empty list.
 * @param {string} modulesDir
 * @returns {Promise<string[]>}
 */
export async function moduleFolders(modulesDir) {
  let entries;
  try {
    entries = await readdir(modulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await readFile(join(modulesDir, entry.name, 'index.ts'), 'utf8');
      found.push(entry.name);
    } catch {
      // No index.ts: not a module.
    }
  }
  return found.sort();
}

/**
 * The id a module's `index.ts` declares: the first `id: '…'` after `export default {`, or else the
 * first in the file (a module usually names its id before its tab's, and the file is a
 * `const module = { id: … }` then `export default module`). A module that builds its id some other
 * way gives undefined, and the app's own check (it throws on a repeated id when it starts) is the
 * one that catches it.
 * @param {string} source
 * @returns {string | undefined}
 */
function declaredId(source) {
  const start = /export default\s*\{/.exec(source)?.index ?? 0;
  return /\bid\s*:\s*(['"`])([a-z0-9-]+)\1/.exec(source.slice(start))?.[2];
}

/**
 * Throws, naming both folders, when two modules declare the same id.
 * @param {string[]} folders
 * @param {string} modulesDir
 * @returns {Promise<void>}
 */
export async function findDuplicateIds(folders, modulesDir) {
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const folder of folders) {
    const id = declaredId(await readFile(join(modulesDir, folder, 'index.ts'), 'utf8'));
    if (!id) continue;
    const first = seen.get(id);
    if (first) {
      throw new Error(
        `Two modules have the id “${id}”: modules/${first} and modules/${folder}. Change one.`,
      );
    }
    seen.set(id, folder);
  }
}

/**
 * Every `i-lucide-*` name in the modules' `.ts` and `.vue` files, sorted, as Iconify names
 * (`lucide:bug`) for the icon bundle. The bundle is built from the names in the app's own `.vue`
 * files (not its `.ts`); a module's icon is a string in its `index.ts`, and the modules live
 * outside the app, so they are read here.
 * @param {string} modulesDir
 * @returns {Promise<string[]>}
 */
export async function moduleIconNames(modulesDir) {
  const icons = new Set();
  /** @param {string} dir */
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') await walk(path);
      } else if (/\.(?:ts|vue)$/.test(entry.name)) {
        for (const [name] of (await readFile(path, 'utf8')).matchAll(/\bi-lucide-[a-z0-9-]+/g)) {
          icons.add(name);
        }
      }
    }
  }
  for (const folder of await moduleFolders(modulesDir)) await walk(join(modulesDir, folder));
  return [...icons].map((name) => name.replace(/^i-lucide-/, 'lucide:')).sort();
}
