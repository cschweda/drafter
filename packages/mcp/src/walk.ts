// Folder walks (list_scripts, search_scripts, series_overview): the scripts under a folder, in
// name order, never following a link to a folder, and never past 6 levels or 500 files (§7.1).
import type { Dirent } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { reason } from '@drafter/archive/node';
import { besideNames } from '@drafter/history';
import { type Format, formatOf } from './formats';
import { type Checked, Refusal } from './paths';
import { isInside, type Root } from './roots';

export const WALK_LIMITS = { depth: 6, files: 500 } as const;

/** A script a walk found. */
export interface Found {
  /** The root's name and the path below it, with `/`. */
  shown: string;
  /** Its real path: for a link to a file, the file it leads to. */
  real: string;
  format: Format;
  size: number;
  mtimeMs: number;
  dev: bigint;
  ino: bigint;
}

/** The ending of a cuts file beside a work (`Boca.fountain.cuts.md`). */
const CUTS = /\.cuts\.md$/i;

/**
 * The scripts under `start` (a root, or a folder resolvePath checked), in code-unit name order,
 * folders' contents where the folder's name falls. Skipped: names starting with `.`, kinds Drafter
 * doesn't read, anything but files and folders, links to folders, any file or folder whose real
 * path is outside the start's root (checked for every one, links or not), and the drafts folders
 * and cuts files beside a work (list_drafts and list_cuts read those). `truncated` is true when
 * something was left unlisted for the limits.
 */
export async function walk(
  start: Checked | Root,
  recursive: boolean,
  platform: NodeJS.Platform = process.platform,
): Promise<{ found: Found[]; truncated: boolean }> {
  const root = 'root' in start ? start.root : start;
  const startShown = 'shown' in start ? start.shown : start.name;
  const found: Found[] = [];
  let truncated = false;

  /** Adds a file; false when the file limit is reached and the walk must stop. */
  const add = (file: Found): boolean => {
    if (found.length >= WALK_LIMITS.files) {
      truncated = true;
      return false;
    }
    found.push(file);
    return true;
  };

  /** Walks one folder; false when the walk must stop. */
  const visit = async (dir: string, shown: string, depth: number): Promise<boolean> => {
    // The folder itself, resolved: a subfolder swapped for a link after its parent was listed
    // leads somewhere else, and that branch stops there.
    let real: string;
    let entries: Dirent[];
    try {
      real = await realpath(dir);
      if (!isInside(real, root.real, platform)) return true;
      entries = await readdir(real, { withFileTypes: true });
    } catch (error) {
      if (depth === 0) throw new Refusal(`Can’t read ${shown}: ${reason(error)}.`);
      return true;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // The drafts folders that belong to a work in this folder.
    const drafts = new Set<string>();
    for (const entry of entries)
      if (!entry.isDirectory() && formatOf(entry.name) !== null) {
        const beside = besideNames(entry.name);
        if (beside) drafts.add(beside.folder);
      }

    for (const entry of entries) {
      const { name } = entry;
      if (name.startsWith('.')) continue;
      const path = join(real, name);
      const here = `${shown}/${name}`;

      if (entry.isDirectory()) {
        if (!recursive || drafts.has(name)) continue;
        if (depth + 1 > WALK_LIMITS.depth) {
          truncated = true;
          continue;
        }
        if (!(await visit(path, here, depth + 1))) return false;
        continue;
      }

      const format = formatOf(name);
      if (format === null || CUTS.test(name)) continue;
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      try {
        // Every file is resolved, not only links: the listing may be stale, and only a real path
        // inside the root is listed.
        const target = await realpath(path);
        if (!isInside(target, root.real, platform)) continue;
        const info = await lstat(target, { bigint: true });
        // A link to a folder is never followed; pipes, devices, and sockets are not scripts.
        if (!info.isFile()) continue;
        const file = {
          shown: here,
          real: target,
          format,
          size: Number(info.size),
          mtimeMs: Number(info.mtimeMs),
          dev: info.dev,
          ino: info.ino,
        };
        if (!add(file)) return false;
      } catch {
        // A broken link, a loop, or a file that went away: not listed.
      }
    }
    return true;
  };

  await visit(start.real, startShown, 0);
  return { found, truncated };
}
