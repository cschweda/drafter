// Drafts and cuts written beside the script (docs/drafter-drafts-and-cuts-design.md §4): the
// drafts folder `Boca drafts/` with one file per draft, and the cuts file `Boca.fountain.cuts.md`,
// next to a script the writer granted (grants.ts). Pure Node, like files.ts, so the unit tests run
// it on real temp folders; file-handlers.ts hands it to the page.
//
// The page names only the file, relative to the script's folder, and only as Drafter names them
// for that script (`besideNames`, from the grant's real path, as `cleanWorkName` makes them):
//   - `<Work>.<ext>.cuts.md`, beside the script, the script's own whole name; or
//   - `<Work> drafts/<Work> – Draft NN.fountain` (or `.md`, or `… Draft NN (2).fountain`), in the
//     drafts folder beside it, the script's own name without its extension.
// So a page can reach only this script's drafts and cuts, never another work's beside it. Each
// part is also a plain name: no separators, no `..`, no NUL or control characters, none of
// `\ / : * ? " < > |`, no dot or space at either end, and none Windows reads as something else
// (`nul.md`), at most 255 bytes.
//
// Unlike Save (`writeAtomic`, which writes through a link to the file the writer chose), nothing
// here ever follows a symbolic link: not at the file, not at the drafts folder (each is `lstat`ed
// and a link is refused), and not at the script's folder (the grant's real path, worked out again
// on every call, refused if it moved). A draft file is only ever created, never replaced: the new
// bytes go to a temp file beside it and are hard-linked into place, which fails if anything is
// there, a dangling link included. The cuts file is replaced whole: a temp file renamed over it,
// which replaces a name and never follows one. Reads `lstat` the file first and refuse a link,
// then open it without following one where the system can (`O_NOFOLLOW`; Windows can't) and
// without blocking (a pipe can't hang them), through `readFileAt`, which checks the open handle:
// the same file as the `lstat` (device and inode), a regular file, at most `MAX_READ_BYTES`, read
// no further than that. The folder the file is in is looked at again after each read and write,
// and before a new file is published: a folder swapped for a link meanwhile is refused.
//
// What this does not guard against: another program, running as the writer, swapping the drafts
// folder for a link in the instant between the last check and the write's rename or link. (Node
// has no `openat`.)
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
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  checkBytes,
  checkPath,
  FileError,
  fileErrorOf,
  hasExtension,
  MAX_READ_BYTES,
  readFileAt,
  SCRIPT_EXTENSIONS,
  sweepTemps,
  syncFolder,
  tempPathFor,
  writeAll,
} from './files';
import type { Grants } from './grants';
import { windowsNameProblem } from './windows-paths';
import { cleanWorkName } from './work-names';

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

/** The names a script's drafts and cuts have beside it, from its real path. */
export interface BesideNames {
  /** `Boca.fountain.cuts.md`. */
  cuts: string;
  /** `Boca drafts`. */
  folder: string;
  /** What each draft file's name starts with: `Boca – Draft `. */
  draft: string;
}

/**
 * The names of `script`'s drafts and cuts, as the app makes them (`cleanWorkName`): the cuts file
 * after its whole name, the drafts folder and files after its name without the extension. Refused
 * when its name has nothing a file name can hold.
 */
export function besideNames(script: string): BesideNames {
  const name = basename(script);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  try {
    const work = cleanWorkName(stem);
    return {
      cuts: `${cleanWorkName(name)}${CUTS_FILE_SUFFIX}`,
      folder: `${work}${DRAFTS_FOLDER_SUFFIX}`,
      draft: `${work} – Draft `,
    };
  } catch {
    return refuse('not a name Drafter makes');
  }
}

/** A draft's number as a file name has it (01, 12, 100), then another computer's ` (2)`, and the extension. */
const DRAFT_TAIL = /^(?:0[1-9]|[1-9]\d+)(?: \([1-9]\d{0,5}\))?\.(?:fountain|md)$/;

/** A drafts folder's name (`Boca drafts`), checked: the script's own. */
function checkFolder(value: unknown, names: BesideNames): string {
  if (typeof value !== 'string') return refuse('not a name Drafter makes');
  checkSegment(value);
  if (!value.endsWith(DRAFTS_FOLDER_SUFFIX)) refuse('not a drafts folder');
  if (value !== names.folder) refuse('not this script’s drafts folder');
  return value;
}

/** Where a name the page sent goes: the cuts file beside the script, or a file in a drafts folder. */
export type Rel = { folder: null; name: string } | { folder: string; name: string };

/**
 * A name relative to the script's folder, as the page sends it: the script's own cuts file
 * (`Boca.fountain.cuts.md`) or one of its draft files (`Boca drafts/Boca – Draft 01.fountain`),
 * as `names` has them. Anything else is a `FileError('not-allowed')`.
 */
export function checkRel(value: unknown, names: BesideNames): Rel {
  if (typeof value !== 'string') return refuse('not a name Drafter makes');
  const parts = value.split('/');
  if (parts.length === 1) {
    const name = checkSegment(value);
    if (!name.endsWith(CUTS_FILE_SUFFIX) || name === CUTS_FILE_SUFFIX) refuse('not a cuts file');
    if (name !== names.cuts) refuse('not this script’s cuts file');
    return { folder: null, name };
  }
  if (parts.length !== 2) return refuse('not a name Drafter makes');
  const folder = checkFolder(parts[0], names);
  const name = checkSegment(parts[1] as string);
  if (!hasExtension(name, DRAFT_EXTENSIONS) || name.endsWith(CUTS_FILE_SUFFIX)) {
    refuse('not a draft file');
  }
  if (!name.startsWith(names.draft) || !DRAFT_TAIL.test(name.slice(names.draft.length))) {
    refuse('not one of this script’s draft files');
  }
  return { folder, name };
}

type Kind = 'file' | 'folder' | 'link' | 'other';
/** A file's identity: its device and inode, as `lstat` gives them. */
interface Identity {
  dev: bigint;
  ino: bigint;
}

/** What a path is and which it is, without following a link: null when nothing is there. */
async function lookAt(path: string): Promise<{ kind: Kind; id: Identity } | null> {
  try {
    const info = await lstat(path, { bigint: true });
    const id = { dev: info.dev, ino: info.ino };
    if (info.isSymbolicLink()) return { kind: 'link', id };
    if (info.isFile()) return { kind: 'file', id };
    if (info.isDirectory()) return { kind: 'folder', id };
    return { kind: 'other', id };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** What a path is, without following a link: null when nothing is there. */
async function kindAt(path: string): Promise<Kind | null> {
  return (await lookAt(path))?.kind ?? null;
}

/** The folder `path` (as `lookAt` saw it) is still that folder, not swapped (for a link) since. */
async function stillThere(path: string, was: Identity): Promise<void> {
  const now = await lookAt(path);
  if (now?.kind !== 'folder' || now.id.dev !== was.dev || now.id.ino !== was.ino)
    refuse('the folder changed while it was used');
}

/**
 * The drafts folder `name` in `base`, a real folder; made when `make` and it isn't there. Null when
 * it isn't there and isn't to be made. A link is refused, and so is anything but a folder.
 */
async function draftsFolder(
  base: string,
  name: string,
  make: boolean,
): Promise<{ path: string; id: Identity } | null> {
  const path = join(base, name);
  let seen = await lookAt(path);
  if (seen === null) {
    if (!make) return null;
    try {
      // Not recursive: the script's folder is there (it holds the script), and only this is made.
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    seen = await lookAt(path);
  }
  if (seen?.kind === 'link') refuse('a link');
  if (seen?.kind !== 'folder') throw new FileError('not-a-file', 'not a folder');
  return { path, id: seen.id };
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

/** The system codes of an open that met a link it was told not to follow. */
const isLinkCode = (error: unknown) =>
  error instanceof FileError && error.code === 'failed' && LINK_CODES.has(error.detail ?? '');

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

/** How the calls open files: for the tests, which run them as on a system without `O_NOFOLLOW`. */
export interface BesideOptions {
  /** The flag that keeps an open from following a link (`O_NOFOLLOW`; 0 where there is none). */
  noFollow?: number;
  /** Runs after a file's path was looked at and before it is used: a test's swap goes here. */
  afterCheck?: (path: string) => Promise<void>;
}

/** The beside-the-script calls, over the grants: each argument as the page sent it. */
export function besideHandlers(grants: Grants, options: BesideOptions = {}) {
  const noFollow = options.noFollow ?? constants.O_NOFOLLOW ?? 0;
  const afterCheck = options.afterCheck ?? (async () => {});

  /** A granted script's folder (its real path's, worked out again now) and its names. */
  async function scriptPlace(
    script: unknown,
  ): Promise<{ base: string; id: Identity; names: BesideNames }> {
    const real = await grants.allowed(checkPath(script));
    if (!hasExtension(real, SCRIPT_EXTENSIONS)) refuse('not a script');
    const base = dirname(real);
    const seen = await lookAt(base);
    if (seen?.kind !== 'folder') refuse('a link');
    return { base, id: (seen as { id: Identity }).id, names: besideNames(real) };
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
        const place = await scriptPlace(script);
        const where = checkRel(rel, place.names);
        const bytes = checkBytes(data, MAX_READ_BYTES);
        // A draft file is never replaced: a draft number is never reused.
        if (mode === 'replace' && where.folder !== null) refuse('a draft file is never replaced');
        const inFolder =
          where.folder === null
            ? { path: place.base, id: place.id }
            : ((await draftsFolder(place.base, where.folder, true)) as {
                path: string;
                id: Identity;
              });
        const folder = inFolder.path;
        const target = join(folder, where.name);
        const kind = await kindAt(target);
        if (kind === 'link') refuse('a link');
        if (kind === 'folder' || kind === 'other') throw new FileError('not-a-file');
        if (mode === 'create' && kind !== null) return 'exists';
        let fileMode = 0o666;
        if (kind === 'file') {
          // The writer made it read-only: the folder may let a rename replace it; Drafter doesn't.
          await access(target, constants.W_OK);
          fileMode = (await lstat(target)).mode & 0o7777;
        }
        await afterCheck(target);
        const temp = await writeTemp(target, bytes, fileMode);
        try {
          // The temp file went where the folder's name leads: still the folder looked at?
          await stillThere(folder, inFolder.id);
          if (mode === 'create') {
            if (!(await publishNew(temp, target))) return 'exists';
          } else {
            // A rename replaces the name: a link put there since the check is replaced, not followed.
            await rename(temp, target);
          }
        } finally {
          await rm(temp, { force: true }).catch(() => {});
        }
        await stillThere(folder, inFolder.id);
        await syncFolder(folder);
        await sweepTemps(folder);
        return 'written';
      }),

    /** The bytes of `rel` beside `script`, or null when it (or its folder) isn't there. */
    readBeside: (script: unknown, rel: unknown) =>
      coded(async (): Promise<Uint8Array | null> => {
        const place = await scriptPlace(script);
        const where = checkRel(rel, place.names);
        const inFolder =
          where.folder === null
            ? { path: place.base, id: place.id }
            : await draftsFolder(place.base, where.folder, false);
        if (inFolder === null) return null;
        const path = join(inFolder.path, where.name);
        // Looked at first, on every system: a link is refused before anything opens it.
        const seen = await lookAt(path);
        if (seen === null) return null;
        if (seen.kind === 'link') refuse('a link');
        if (seen.kind === 'folder') throw new FileError('not-a-file');
        await afterCheck(path);
        let bytes: Uint8Array;
        try {
          // The open handle must be the file looked at: on Windows the open follows a link.
          ({ bytes } = await readFileAt(path, { flags: noFollow, same: seen.id }));
        } catch (error) {
          if (isLinkCode(error)) refuse('a link');
          if (error instanceof FileError && error.code === 'gone') return null;
          throw error;
        }
        await stillThere(inFolder.path, inFolder.id);
        return bytes;
      }),

    /**
     * The draft files in the drafts folder `folder` beside `script`, sorted: regular files only
     * (no link, no folder, no temp file), with names `readBeside` takes. Empty when it isn't there.
     */
    listBeside: (script: unknown, folder: unknown) =>
      coded(async (): Promise<string[]> => {
        const place = await scriptPlace(script);
        const name = checkFolder(folder, place.names);
        const inFolder = await draftsFolder(place.base, name, false);
        if (inFolder === null) return [];
        const names: string[] = [];
        for (const entry of await readdir(inFolder.path, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          try {
            checkRel(`${name}/${entry.name}`, place.names);
          } catch {
            continue;
          }
          names.push(entry.name);
        }
        await stillThere(inFolder.path, inFolder.id);
        return names.sort().slice(0, MAX_LISTED);
      }),
  };
}

export type BesideHandlers = ReturnType<typeof besideHandlers>;
