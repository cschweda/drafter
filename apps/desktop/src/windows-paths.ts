// Names Windows reads differently from how they are written. Pure, with Node's `path.win32`, so the
// rules are tested on every system; files.ts and protocol.ts apply them when Drafter runs on
// Windows.
//
// Windows drops a trailing dot or space from a name (`notes.md.` opens `notes.md`), opens a device
// for a reserved name whatever its extension (`nul.md`, `COM1.fountain`; Windows 11 only for the
// bare name, older Windows for both), reads `name:stream` as a hidden stream inside the file
// `name`, and has paths that reach devices and pipes directly (`\\.\pipe\x`, `\\?\…`). Each of
// those lets one file be asked for under a name that isn't its own, so a check made on the name
// (its extension, the folder it is in) could pass for a different file, or for no file at all.
// Drafter refuses them: no script is named that way, and Explorer and the Open and Save dialogs
// never give such a name.
import { win32 } from 'node:path';

/** The names Windows keeps for devices (with or without an extension), in any case. */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;

/** Characters no Windows file name may hold (and the control characters). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it finds.
const INVALID = /[<>:"|?*\u0000-\u001f]/;

/** Why Windows would read one part of a path (a file or folder name) as something else, if it would. */
export function windowsNameProblem(name: string): string | undefined {
  if (name === '' || name === '.' || name === '..') return undefined;
  if (/[. ]$/.test(name)) return 'it ends in a dot or a space, which Windows drops';
  if (name.includes(':')) return 'it names a stream inside a file';
  if (INVALID.test(name)) return 'it has a character Windows doesn’t allow in a name';
  if (RESERVED.test(name)) return 'Windows keeps the name for a device';
  return undefined;
}

/**
 * Why a Windows path doesn't name the file it seems to, if it doesn't: a device path (`\\.\`,
 * `\\?\`), or a part of it that `windowsNameProblem` refuses. A drive's root (`C:\`) and a share's
 * (`\\server\share\`) are fine as they are; only the names after them are checked.
 */
export function windowsPathProblem(path: string): string | undefined {
  if (/^[\\/]{2}[.?][\\/]/.test(path)) return 'it is a device path';
  const { root } = win32.parse(path);
  for (const part of path.slice(root.length).split(/[\\/]+/)) {
    const problem = windowsNameProblem(part);
    if (problem) return problem;
  }
  return undefined;
}
