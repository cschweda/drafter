// `drafter convert`: Final Draft, Highland, and Fade In files to Fountain, many at once, through
// the same functions and checks as the app's Open (docs/DECISIONS.md, `drafter convert`).
import { randomBytes } from 'node:crypto';
import { constants, type Dirent, type Stats } from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ArchiveError,
  type ArchiveFormat,
  fromFadeIn,
  fromHighland,
  type ImportKind,
  importKindOf,
  MAX_SCRIPT_BYTES,
  notAScript,
  refusalMessage,
  SNIFF_BYTES,
  ZIP_LIMITS,
} from '@drafter/archive';
import { FdxError, type FdxImport, fromFdx } from '@drafter/fdx';

/** What `convert` prints to and where relative paths start (the CLI's `IO`, the part it needs). */
export interface ConvertIO {
  out(text: string): void;
  cwd: string;
}

export interface ConvertOptions {
  out?: string;
  force?: boolean;
  recursive?: boolean;
}

/** A problem with the whole run, not one file: printed as a message, exit 1. */
export class ConvertError extends Error {}

/** The app's Open caps: a Final Draft file is text, at most 5 MB; an archive, the zip reader's 32 MB. */
const MAX_BYTES: Record<ImportKind, number> = {
  fdx: MAX_SCRIPT_BYTES,
  highland: ZIP_LIMITS.maxArchiveBytes,
  fadein: ZIP_LIMITS.maxArchiveBytes,
};
const FORMAT: Record<'highland' | 'fadein', ArchiveFormat> = {
  highland: 'Highland',
  fadein: 'Fade In',
};

const WHAT_IT_READS =
  'drafter convert reads Final Draft (.fdx), Highland (.highland), and Fade In (.fadein) files';

/** One file to convert: where it is and where its Fountain goes, each as printed and as resolved. */
interface Job {
  source: string;
  shown: string;
  target: string;
  targetShown: string;
}

/** A file that isn't converted, and why, in words. */
class Refused extends Error {}

type Outcome =
  | { kind: 'converted'; notes: number }
  | { kind: 'skipped' }
  | { kind: 'refused'; reason: string };

/**
 * Converts each path (a file, or a folder's `.fdx`, `.highland`, and `.fadein` files, in name
 * order) to a `.fountain` beside it or under `--out`, printing a line for each and a summary.
 * Resolves to 0 when nothing was refused, else 1; 1 also when there was nothing to convert.
 */
export async function convert(
  paths: readonly string[],
  options: ConvertOptions,
  io: ConvertIO,
): Promise<number> {
  const outDir = options.out === undefined ? undefined : resolve(io.cwd, options.out);
  if (outDir !== undefined && options.out !== undefined) {
    try {
      await mkdir(outDir, { recursive: true });
    } catch (error) {
      throw new ConvertError(`can't write to ${options.out}: ${folderReason(error)}`);
    }
  }
  const counts = { converted: 0, skipped: 0, refused: 0 };
  /**
   * The `.fountain` files this run wrote, by path and by file (`dev:ino`, which any folding of
   * names the disk does, by case or by Unicode normalization, comes back to), with each one's
   * source as printed.
   */
  const written = { paths: new Map<string, string>(), files: new Map<string, string>() };

  const report = (job: Pick<Job, 'shown'> & Partial<Job>, outcome: Outcome) => {
    counts[outcome.kind]++;
    if (outcome.kind === 'refused') io.out(`${job.shown}: refused: ${outcome.reason}\n`);
    else if (outcome.kind === 'skipped')
      io.out(`${job.shown}: skipped: ${job.targetShown} is already there (--force replaces it)\n`);
    else io.out(`${job.shown} → ${job.targetShown}${notesSaid(outcome.notes)}\n`);
  };

  for (const path of paths) {
    const source = resolve(io.cwd, path);
    let info: Stats;
    try {
      info = await stat(source);
    } catch (error) {
      report({ shown: path }, { kind: 'refused', reason: `can't read it: ${reason(error)}` });
      continue;
    }
    if (info.isDirectory()) {
      let found = 0;
      for (const { rel, error } of await scriptsIn(source, options.recursive === true)) {
        if (error !== undefined) {
          // Reported in its place, so the lines stay in name order.
          found++;
          report(
            { shown: rel === '' ? path : join(path, rel) },
            { kind: 'refused', reason: `can't read it: ${reason(error)}` },
          );
          continue;
        }
        const job = jobFor(join(source, rel), join(path, rel), rel, outDir, options.out);
        found++;
        report(job, await convertOnce(job, options.force === true, written));
      }
      if (found === 0) io.out(`${path}: nothing to convert here\n`);
    } else if (info.isFile()) {
      const job = jobFor(source, path, basename(source), outDir, options.out);
      report(job, await convertOnce(job, options.force === true, written));
    } else {
      report({ shown: path }, { kind: 'refused', reason: 'it isn’t a file or a folder' });
    }
  }

  const said = (['converted', 'skipped', 'refused'] as const)
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${kind}`);
  io.out(`${said.length === 0 ? 'nothing to convert' : said.join(', ')}\n`);
  return counts.refused > 0 || said.length === 0 ? 1 : 0;
}

/** "(2 items came in as notes)", as the app's import toast counts them; nothing for none. */
function notesSaid(notes: number): string {
  if (notes === 0) return '';
  return notes === 1 ? ' (1 item came in as a note)' : ` (${notes} items came in as notes)`;
}

interface Written {
  paths: Map<string, string>;
  files: Map<string, string>;
}

// As bigints: a file id on NTFS can be past 2^53, where two numbers could round to one.
const fileKey = (info: { dev: bigint; ino: bigint }) => `${info.dev}:${info.ino}`;

/**
 * Converts `job`, unless its `.fountain` is one this run already wrote: the same path, or, however
 * the disk folds names, the same file. Records what it writes.
 */
async function convertOnce(job: Job, force: boolean, written: Written): Promise<Outcome> {
  const there = await lstat(job.target, { bigint: true }).catch(() => null);
  const earlier =
    written.paths.get(job.target) ?? (there ? written.files.get(fileKey(there)) : undefined);
  if (earlier !== undefined) {
    return {
      kind: 'refused',
      reason: `${job.targetShown} was already written from ${earlier} in this run`,
    };
  }
  const outcome = await convertOne(job, force);
  if (outcome.kind === 'converted') {
    written.paths.set(job.target, job.shown);
    const made = await lstat(job.target, { bigint: true }).catch(() => null);
    if (made) written.files.set(fileKey(made), job.shown);
  }
  return outcome;
}

/** `rel`'s Fountain: beside the source, or under `--out` with the folders under the argument kept. */
function jobFor(
  source: string,
  shown: string,
  rel: string,
  outDir: string | undefined,
  outShown: string | undefined,
): Job {
  const base = basename(source);
  const kind = importKindOf(base);
  const name = `${kind ? base.slice(0, -kind.length - 1) : base}.fountain`;
  if (outDir === undefined || outShown === undefined) {
    return {
      source,
      shown,
      target: join(dirname(source), name),
      targetShown: join(dirname(shown), name),
    };
  }
  const under = join(dirname(rel), name);
  return { source, shown, target: join(outDir, under), targetShown: join(outShown, under) };
}

/**
 * The scripts in a folder, as paths relative to it, in name order: its `.fdx`, `.highland`, and
 * `.fadein` files (a link to a file counts), and with `recursive` its subfolders' (never through a
 * link, so a loop can't trap it). Names starting with `.` are left out, as a macOS `._` file is. A
 * folder that can't be read comes in its place with the error (`rel` '' for `folder` itself).
 */
async function scriptsIn(
  folder: string,
  recursive: boolean,
): Promise<Array<{ rel: string; error?: unknown }>> {
  const found: Array<{ rel: string; error?: unknown }> = [];
  const walk = async (rel: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(join(folder, rel), { withFileTypes: true });
    } catch (error) {
      found.push({ rel, error });
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = rel === '' ? entry.name : join(rel, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(path);
      } else if (importKindOf(entry.name) && (await isFile(entry, join(folder, path)))) {
        found.push({ rel: path });
      }
    }
  };
  await walk('');
  return found;
}

async function isFile(entry: Dirent, path: string): Promise<boolean> {
  if (entry.isFile()) return true;
  if (!entry.isSymbolicLink()) return false;
  return (await stat(path).catch(() => null))?.isFile() === true;
}

async function convertOne(job: Job, force: boolean): Promise<Outcome> {
  let imported: FdxImport;
  try {
    imported = await importFile(job.source);
  } catch (error) {
    if (error instanceof Refused || error instanceof FdxError || error instanceof ArchiveError)
      return { kind: 'refused', reason: error.message };
    throw error;
  }
  // As the editor holds it: every line break a line feed.
  const text = imported.text.replace(/\r\n?/g, '\n');
  if (new TextEncoder().encode(text).byteLength > MAX_SCRIPT_BYTES) {
    return { kind: 'refused', reason: 'the script in it is larger than 5 MB' };
  }
  try {
    await mkdir(dirname(job.target), { recursive: true });
  } catch (error) {
    return {
      kind: 'refused',
      reason: `can't make the folder ${dirname(job.targetShown)}: ${folderReason(error)}`,
    };
  }
  try {
    if (!(await publish(job.target, text, force))) return { kind: 'skipped' };
  } catch (error) {
    return { kind: 'refused', reason: `can't write ${job.targetShown}: ${reason(error)}` };
  }
  const notes = imported.mapped.reduce((sum, { count }) => sum + count, 0);
  return { kind: 'converted', notes };
}

const codeOf = (error: unknown) => (error as { code?: string }).code;

/** The codes a disk gives when it can't make a hard link at all (FAT and exFAT drives, some shares). */
const NO_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK']);

/**
 * Writes `text` to a temporary file beside `target`, then publishes it whole, so a write that
 * fails partway (a full disk) never leaves a short `.fountain` that a later run would skip. With
 * `force`, it is renamed over `target`, taking the mode of the file it replaces: a link there is
 * replaced, never followed. Without, it is hard-linked to `target`, which fails if anything is
 * there, a dangling link included, and never follows one; on a disk without hard links it is
 * copied exclusively instead. False when `target` was there and `force` wasn't given. The
 * temporary file is gone afterwards, whatever happened.
 */
async function publish(target: string, text: string, force: boolean): Promise<boolean> {
  // Short, so a long script name can't push it past the longest name a disk allows.
  const temp = join(dirname(target), `.drafter-${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, text, { flag: 'wx' });
  } catch (error) {
    // Past an exclusive create, the file is this call's own: take away what was written.
    if (codeOf(error) !== 'EEXIST') await unlink(temp).catch(() => {});
    throw error;
  }
  try {
    if (force) {
      const old = await lstat(target).catch(() => null);
      if (old?.isFile()) await chmod(temp, old.mode & 0o777);
      await rename(temp, target);
      return true;
    }
    try {
      await link(temp, target);
    } catch (error) {
      if (codeOf(error) === 'EEXIST') return false;
      if (!NO_LINKS.has(codeOf(error) ?? '')) throw error;
      try {
        await copyFile(temp, target, constants.COPYFILE_EXCL);
      } catch (copyError) {
        if (codeOf(copyError) === 'EEXIST') return false;
        // The exclusive copy made it, so a short one is this call's own.
        await unlink(target).catch(() => {});
        throw copyError;
      }
    }
    return true;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

/**
 * A file's script, as the app's Open reads it: `notAScript` first (by extension, then by first
 * bytes), a kind `convert` reads, the size cap read before the bytes are, then the importer.
 */
async function importFile(source: string): Promise<FdxImport> {
  const name = basename(source);
  const named = notAScript(name, new Uint8Array(0));
  if (named) throw new Refused(refusalMessage(name, named));
  const kind = importKindOf(name);
  if (!kind) throw new Refused(WHAT_IT_READS);
  const bytes = await readCapped(source, MAX_BYTES[kind], kind);
  const refusal = notAScript(name, bytes);
  if (refusal) throw new Refused(refusalMessage(name, refusal));
  if (kind === 'highland') return fromHighland(bytes);
  if (kind === 'fadein') return fromFadeIn(bytes);
  return fromFdx(fdxText(bytes));
}

/** A Final Draft file's text, as Open decodes it: no NUL up front, strict UTF-8, no BOM, `\n`. */
function fdxText(bytes: Uint8Array): string {
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) throw new Refused('it holds more than text');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Refused('it isn’t UTF-8 text');
  }
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** The file's bytes, or a refusal when it is over `cap`: never more than `cap` + 1 bytes are read. */
async function readCapped(source: string, cap: number, kind: ImportKind): Promise<Uint8Array> {
  const tooBig = () =>
    kind === 'fdx'
      ? new Refused('it is larger than 5 MB')
      : new ArchiveError(FORMAT[kind], 'too-big');
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    // Non-blocking, so a pipe put in the file's place after it was checked can't hang the open;
    // the handle's own stat then refuses it.
    handle = await open(source, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    throw new Refused(`can't read it: ${reason(error)}`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Refused('it isn’t a file');
    if (info.size > cap) throw tooBig();
    // The size can change after the stat: read one byte more than it said, and no further.
    const buffer = new Uint8Array(Math.min(info.size, cap) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > cap) throw tooBig();
    return buffer.subarray(0, filled);
  } catch (error) {
    if (error instanceof Refused || error instanceof ArchiveError) throw error;
    throw new Refused(`can't read it: ${reason(error)}`);
  } finally {
    await handle.close();
  }
}

/** Why a file or folder couldn't be read or written, in words. */
export function reason(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'ENOENT') return 'no such file';
  if (code === 'EISDIR') return "it's a folder";
  if (code === 'EACCES' || code === 'EPERM') return 'permission denied';
  if (code === 'ENOTDIR') return "part of its path isn't a folder";
  if (code === 'ENOSPC') return 'the disk is full';
  return (error as Error).message;
}

/** Why a folder couldn't be made: something that isn't a folder is already in its place. */
function folderReason(error: unknown): string {
  const code = codeOf(error);
  return code === 'EEXIST' || code === 'ENOTDIR' ? 'a file is in the way' : reason(error);
}
