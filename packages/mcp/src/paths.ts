// Naming a file (§3, §7.1): a path relative to one of the writer's folders, starting with its
// name. Checked by its text first, then by where it really leads on disk: only a file or folder
// whose real path is inside the folder is ever reached.
import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { reason, windowsNameProblem, windowsPathProblem } from '@drafter/archive/node';
import { isInside, type Root } from './roots';

export type Want = 'file' | 'folder';

/** A path that was checked: where it really is, how it is shown, and what it was when checked. */
export interface Checked {
  root: Root;
  /** The real path on disk (links resolved), inside `root.real`. */
  real: string;
  /** The root's name and the path below it, with `/`: `Scripts/Signal Hill/101.fountain`. */
  shown: string;
  /** Device and inode of `real` when checked: the read compares the open handle with these. */
  dev: bigint;
  ino: bigint;
  size: number;
  mtimeMs: number;
}

/** A path, file, or request that is refused. The message is shown to the AI app. */
export class Refusal extends Error {
  /** Scenes a reference could mean, when it means more than one. */
  matches?: Array<{ scene: number; heading: string }>;
}

export const OUTSIDE = 'That file is outside the folders Drafter for Claude may read.';

export const MAX_PATH_CHARS = 1_024;

const EMPTY = 'Give a path that starts with one of your folders.';
const TOO_LONG = 'That path is too long.';
const NUL = 'That path has a character no file name can hold.';
const CONTROL = 'That path has a line break or another control character in it.';
/** C0 controls, DEL, and the line and paragraph separators: never in a tool's path. */
const isControl = (code: number) =>
  code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
const hasControl = (text: string) => {
  for (let i = 0; i < text.length; i++) if (isControl(text.charCodeAt(i))) return true;
  return false;
};
const ABSOLUTE = 'Give a path that starts with one of your folders, not a full path.';
const BACKSLASH = 'Use / between the parts of a path, not \\.';
const BAD_PART = 'A path can’t have an empty part, “.”, or “..”.';
const HIDDEN = 'Drafter for Claude doesn’t read hidden files or folders.';

/** `/x`, `\x`, `//server`, `\\server`, `C:`, `C:\`, `C:x`: anything not relative to a folder. */
const ABSOLUTE_PATH = /^([\\/]|[A-Za-z]:)/;

/** The parts of a path: split at `/`, and at `\` too on Windows. */
function partsOf(rel: string, platform: NodeJS.Platform): string[] {
  return rel.split(platform === 'win32' ? /[\\/]/ : '/');
}

/** What is wrong with a tool's path as written, or null. Touches no disk. */
export function pathProblem(rel: string, platform: NodeJS.Platform): string | null {
  if (rel === '') return EMPTY;
  if (rel.length > MAX_PATH_CHARS) return TOO_LONG;
  if (rel.includes('\0')) return NUL;
  if (hasControl(rel)) return CONTROL;
  if (ABSOLUTE_PATH.test(rel)) return ABSOLUTE;
  if (platform !== 'win32' && rel.includes('\\')) return BACKSLASH;
  const parts = partsOf(rel, platform);
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return BAD_PART;
  // As walk skips them: a name starting with "." (.git, .hidden) is hidden, never read.
  if (parts.some((part) => part.startsWith('.'))) return HIDDEN;
  if (platform === 'win32') {
    for (const part of parts) {
      const problem = windowsNameProblem(part);
      if (problem) return `Windows can’t read that path as written: ${problem}.`;
    }
    const problem = windowsPathProblem(parts.join('\\'));
    if (problem) return `Windows can’t read that path as written: ${problem}.`;
  }
  return null;
}

/**
 * The file or folder a tool's path names, checked: written correctly, starting with a root's name,
 * really inside that root once every link is resolved, and a regular file or a folder as wanted.
 */
export async function resolvePath(
  rel: string,
  roots: readonly Root[],
  platform: NodeJS.Platform,
  want: Want,
): Promise<Checked> {
  const problem = pathProblem(rel, platform);
  if (problem) throw new Refusal(problem);
  const [first, ...rest] = partsOf(rel, platform);
  const root = roots.find((candidate) => candidate.name === first);
  if (!root)
    throw new Refusal(
      `Start the path with one of your folders: ${roots.map((r) => r.name).join(', ')}.`,
    );
  const shown = [root.name, ...rest].join('/');

  let real: string;
  try {
    real = await realpath(join(root.real, ...rest));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') throw new Refusal(`There’s no ${want} at ${shown}.`);
    if (code === 'ELOOP') throw new Refusal(`${shown} is a loop of links.`);
    throw new Refusal(`Can’t read ${shown}: ${reason(error)}.`);
  }
  if (!isInside(real, root.real, platform)) throw new Refusal(OUTSIDE);

  let info: BigIntStats;
  try {
    info = await lstat(real, { bigint: true });
  } catch (error) {
    throw new Refusal(`Can’t read ${shown}: ${reason(error)}.`);
  }
  if (want === 'file' && !info.isFile())
    throw new Refusal(
      info.isDirectory() ? `${shown} is a folder, not a file.` : `${shown} isn’t a file.`,
    );
  if (want === 'folder' && !info.isDirectory())
    throw new Refusal(
      info.isFile() ? `${shown} is a file, not a folder.` : `${shown} isn’t a folder.`,
    );
  return {
    root,
    real,
    shown,
    dev: info.dev,
    ino: info.ino,
    size: Number(info.size),
    mtimeMs: Number(info.mtimeMs),
  };
}
