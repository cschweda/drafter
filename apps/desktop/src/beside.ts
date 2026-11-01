// Drafts and cuts written beside the script (docs/drafter-drafts-and-cuts-design.md §4): the
// drafts folder `Boca drafts/` with one file per draft, and the cuts file `Boca.fountain.cuts.md`,
// next to a script the writer granted (grants.ts). Pure Node, like files.ts, so the unit tests run
// it on real temp folders; file-handlers.ts hands it to the page.
//
// The page names only the file, relative to the script's folder, and only as Drafter names them:
//   - `<Work>.<ext>.cuts.md`, beside the script; or
//   - `<Work> drafts/<name>.fountain` (or `.md`), in the drafts folder beside it.
// Each part is a plain name `cleanWorkName` (@drafter/history) would leave as it is: no
// separators, no `..`, no NUL or control characters, none of `\ / : * ? " < > |`, no dot or space
// at either end, and none Windows reads as something else (`nul.md`), at most 255 bytes.
//
// Unlike Save (`writeAtomic`, which writes through a link to the file the writer chose), nothing
// here ever follows a symbolic link: not at the file, not at the drafts folder (each is `lstat`ed
// and a link is refused), and not at the script's folder (the grant's real path, worked out again
// on every call, refused if it moved). A draft file is only ever created, never replaced: the new
// bytes go to a temp file beside it and are hard-linked into place, which fails if anything is
// there, a dangling link included. The cuts file is replaced whole: a temp file renamed over it,
// which replaces a name and never follows one. Reads open the file without following a link and
// without blocking (a pipe can't hang them), then check the open handle: a regular file, at most
// `MAX_READ_BYTES`, read no further than that.
//
// What this does not guard against: another program, running as the writer, swapping the drafts
// folder for a link in the instant between its check and the write. (Node has no `openat`.)
import {
  access,
  constants,
  copyFile,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  checkBytes,
  checkPath,
  FileError,
  fileErrorOf,
  hasExtension,
  MAX_READ_BYTES,
  SCRIPT_EXTENSIONS,
  sweepTemps,
  syncFolder,
  tempPathFor,
  writeAll,
} from './files';
import type { Grants } from './grants';
import { windowsNameProblem } from './windows-paths';

/** How a drafts folder's name ends: `Boca drafts`. */
export const DRAFTS_FOLDER_SUFFIX = ' drafts';
/** How the cuts file's name ends: `Boca.fountain.cuts.md`. */
export const CUTS_FILE_SUFFIX = '.cuts.md';
/** The extensions of a draft file. */
export const DRAFT_EXTENSIONS: readonly string[] = ['.fountain', '.md'];
/** The most names `listBeside` returns: far more drafts than anyone freezes. */
export const MAX_LISTED = 10_000;
/** A file name's longest, in bytes, on the disks Drafter meets. */
const MAX_NAME_BYTES = 255;

/** Characters `cleanWorkName` replaces (and the control characters). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it finds.
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/;

/** Codes of a link refused, as the page is told it. */
const LINK_CODES = new Set(['ELOOP', 'EMLINK', 'EFTYPE']);
/** Codes of a disk that can't hard-link (FAT, some network shares): an exclusive copy instead. */
const NO_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK']);

const refuse = (detail: string): never => {
  throw new FileError('not-allowed', detail);
};

/** One part of a name the page sent: a plain name Drafter would make, else refused. */
function checkSegment(segment: string): string {
  if (
    segment === '' ||
    segment.includes('..') ||
    UNSAFE.test(segment) ||
    /^[. ]|[. ]$/.test(segment) ||
    Buffer.byteLength(segment) > MAX_NAME_BYTES ||
    windowsNameProblem(segment) !== undefined
  ) {
    refuse('not a name Drafter makes');
  }
  return segment;
}

/** A drafts folder's name (`Boca drafts`), checked. */
function checkFolder(value: unknown): string {
  if (typeof value !== 'string') return refuse('not a name Drafter makes');
  checkSegment(value);
  if (!value.endsWith(DRAFTS_FOLDER_SUFFIX)) {
    refuse('not a drafts folder');
  }
  return value;
}

/** Where a name the page sent goes: the cuts file beside the script, or a file in a drafts folder. */
export type Rel = { folder: null; name: string } | { folder: string; name: string };

/**
 * A name relative to the script's folder, as the page sends it: `Boca.fountain.cuts.md` or
 * `Boca drafts/Boca – Draft 01.fountain`. Anything else is a `FileError('not-allowed')`.
 */
export function checkRel(value: unknown): Rel {
  if (typeof value !== 'string') return refuse('not a name Drafter makes');
  const parts = value.split('/');
  if (parts.length === 1) {
    const name = checkSegment(value);
    if (!name.endsWith(CUTS_FILE_SUFFIX) || name === CUTS_FILE_SUFFIX) refuse('not a cuts file');
    return { folder: null, name };
  }
  if (parts.length !== 2) return refuse('not a name Drafter makes');
  const folder = checkFolder(parts[0]);
  const name = checkSegment(parts[1] as string);
  if (!hasExtension(name, DRAFT_EXTENSIONS) || name.endsWith(CUTS_FILE_SUFFIX)) {
    refuse('not a draft file');
  }
  return { folder, name };
}

/** What a path is, without following a link: null when nothing is there. */
async function kindAt(path: string): Promise<'file' | 'folder' | 'link' | 'other' | null> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return 'link';
    if (info.isFile()) return 'file';
    if (info.isDirectory()) return 'folder';
    return 'other';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * The drafts folder `name` in `base`, a real folder; made when `make` and it isn't there. Null when
 * it isn't there and isn't to be made. A link is refused, and so is anything but a folder.
 */
async function draftsFolder(base: string, name: string, make: boolean): Promise<string | null> {
  const path = join(base, name);
  let kind = await kindAt(path);
  if (kind === null) {
    if (!make) return null;
    try {
      // Not recursive: the script's folder is there (it holds the script), and only this is made.
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    kind = await kindAt(path);
  }
  if (kind === 'link') refuse('a link');
  if (kind !== 'folder') throw new FileError('not-a-file', 'not a folder');
  return path;
}

/** Writes `data` to a new temp file for `target` (never an existing file, never through a link). */
async function writeTemp(target: string, data: Uint8Array, mode: number): Promise<string> {
  const temp = tempPathFor(target);
  let handle: FileHandle | undefined;
  try {
    // `wx`: O_CREAT | O_EXCL, which fails on anything there, a link included.
    handle = await open(temp, 'wx', mode);
    if (mode !== 0o666) await handle.chmod(mode);
    await writeAll(handle, data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    return temp;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

/** Publishes `temp` at `target` only if nothing is there: false when something is. */
async function publishNew(temp: string, target: string): Promise<boolean> {
  try {
    await link(temp, target);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (code === 'EEXIST') return false;
    if (!NO_LINKS.has(code)) throw error;
  }
  try {
    // An exclusive copy: it fails on anything there, and never follows a link to make a file.
    await copyFile(temp, target, constants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/** The bytes of the regular file at `path` (not followed if it is a link), at most the cap. */
async function readCapped(path: string): Promise<Uint8Array> {
  let handle: FileHandle;
  try {
    // Without blocking (a pipe put there can't wait for a writer) and without following a link.
    handle = await open(
      path,
      constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    if (LINK_CODES.has((error as NodeJS.ErrnoException).code ?? '')) refuse('a link');
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FileError('not-a-file');
    if (info.size > MAX_READ_BYTES) throw new FileError('too-big');
    // The size can change after the stat: one byte more than it said, and no further.
    const buffer = new Uint8Array(info.size + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > info.size) throw new FileError('failed', 'it changed while it was read');
    return buffer.subarray(0, filled);
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Runs `work`, turning whatever it throws into a `FileError`. */
async function coded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw fileErrorOf(error);
  }
}

export type BesideMode = 'create' | 'replace';
export type BesideWritten = 'written' | 'exists';

/** The beside-the-script calls, over the grants: each argument as the page sent it. */
export function besideHandlers(grants: Grants) {
  /** The folder of a granted script: its real path's, worked out again now. */
  async function scriptFolder(script: unknown): Promise<string> {
    const real = await grants.allowed(checkPath(script));
    if (!hasExtension(real, SCRIPT_EXTENSIONS)) refuse('not a script');
    const folder = dirname(real);
    if ((await kindAt(folder)) !== 'folder') refuse('a link');
    return folder;
  }

  return {
    /**
     * Writes `data` to `rel` beside `script`. `create` publishes it only if nothing is there
     * (`exists` otherwise, the file untouched); `replace`, for the cuts file only, swaps it in
     * whole, keeping the old file's permissions, and refuses a read-only one.
     */
    writeBeside: (script: unknown, rel: unknown, data: unknown, mode: unknown) =>
      coded(async (): Promise<BesideWritten> => {
        if (mode !== 'create' && mode !== 'replace') throw new FileError('failed', 'not a mode');
        const where = checkRel(rel);
        const bytes = checkBytes(data, MAX_READ_BYTES);
        // A draft file is never replaced: a draft number is never reused.
        if (mode === 'replace' && where.folder !== null) refuse('a draft file is never replaced');
        const base = await scriptFolder(script);
        const folder =
          where.folder === null ? base : ((await draftsFolder(base, where.folder, true)) as string);
        const target = join(folder, where.name);
        const kind = await kindAt(target);
        if (kind === 'link') refuse('a link');
        if (kind === 'folder' || kind === 'other') throw new FileError('not-a-file');
        if (mode === 'create' && kind !== null) return 'exists';
        let fileMode = 0o666;
        if (kind === 'file') {
          // The writer made it read-only: the folder may let a rename replace it; Drafter doesn't.
          await access(target, constants.W_OK);
          fileMode = (await stat(target)).mode & 0o7777;
        }
        const temp = await writeTemp(target, bytes, fileMode);
        try {
          if (mode === 'create') {
            if (!(await publishNew(temp, target))) return 'exists';
          } else {
            // A rename replaces the name: a link put there since the check is replaced, not followed.
            await rename(temp, target);
          }
        } finally {
          await rm(temp, { force: true }).catch(() => {});
        }
        await syncFolder(folder);
        await sweepTemps(folder);
        return 'written';
      }),

    /** The bytes of `rel` beside `script`, or null when it (or its folder) isn't there. */
    readBeside: (script: unknown, rel: unknown) =>
      coded(async (): Promise<Uint8Array | null> => {
        const where = checkRel(rel);
        const base = await scriptFolder(script);
        const folder = where.folder === null ? base : await draftsFolder(base, where.folder, false);
        if (folder === null) return null;
        try {
          return await readCapped(join(folder, where.name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        }
      }),

    /**
     * The draft files in the drafts folder `folder` beside `script`, sorted: regular files only
     * (no link, no folder, no temp file), with names `readBeside` takes. Empty when it isn't there.
     */
    listBeside: (script: unknown, folder: unknown) =>
      coded(async (): Promise<string[]> => {
        const name = checkFolder(folder);
        const base = await scriptFolder(script);
        const path = await draftsFolder(base, name, false);
        if (path === null) return [];
        const names: string[] = [];
        for (const entry of await readdir(path, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          try {
            checkRel(`${name}/${entry.name}`);
          } catch {
            continue;
          }
          names.push(entry.name);
        }
        return names.sort().slice(0, MAX_LISTED);
      }),
  };
}

export type BesideHandlers = ReturnType<typeof besideHandlers>;
