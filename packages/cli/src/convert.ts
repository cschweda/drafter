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
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ArchiveError, importKindOf, MAX_SCRIPT_BYTES } from '@drafter/archive';
import { Refused, readScriptFile, reason, type ScriptRead } from '@drafter/archive/node';
import { FdxError } from '@drafter/fdx';

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

const WHAT_IT_READS =
  'drafter convert reads Final Draft (.fdx), Highland (.highland), and Fade In (.fadein) files, and Drafter HTML and EPUB exports made with “Let Drafter reopen this file”';

/** One file to convert: where it is and where its Fountain goes, each as printed and as resolved. */
interface Job {
  source: string;
  shown: string;
  target: string;
  targetShown: string;
}

/**
 * What became of one file. A converted or skipped one says the file it wrote or found, as printed:
 * a Markdown document from an export goes to `.md`, not the `.fountain` the job first named.
 */
type Outcome =
  | { kind: 'converted'; notes: number; targetShown?: string }
  | { kind: 'skipped'; targetShown?: string }
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
      io.out(
        `${job.shown}: skipped: ${outcome.targetShown ?? job.targetShown} is already there (--force replaces it)\n`,
      );
    else
      io.out(
        `${job.shown} → ${outcome.targetShown ?? job.targetShown}${notesSaid(outcome.notes)}\n`,
      );
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
async function convertOnce(given: Job, force: boolean, written: Written): Promise<Outcome> {
  let read: ScriptRead;
  try {
    read = await readScriptFile(given.source, WHAT_IT_READS);
  } catch (error) {
    if (error instanceof Refused || error instanceof FdxError || error instanceof ArchiveError)
      return { kind: 'refused', reason: error.message };
    throw error;
  }
  const job = read.markdown
    ? {
        ...given,
        target: given.target.replace(/\.fountain$/, '.md'),
        targetShown: given.targetShown.replace(/\.fountain$/, '.md'),
      }
    : given;
  const there = await lstat(job.target, { bigint: true }).catch(() => null);
  const earlier =
    written.paths.get(job.target) ?? (there ? written.files.get(fileKey(there)) : undefined);
  if (earlier !== undefined) {
    return {
      kind: 'refused',
      reason: `${job.targetShown} was already written from ${earlier} in this run`,
    };
  }
  const outcome = await convertOne(job, read, force);
  if (outcome.kind === 'converted') {
    written.paths.set(job.target, job.shown);
    const made = await lstat(job.target, { bigint: true }).catch(() => null);
    if (made) written.files.set(fileKey(made), job.shown);
  }
  return outcome.kind === 'refused' ? outcome : { ...outcome, targetShown: job.targetShown };
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
  const exported = /\.(?:html?|epub)$/i.exec(base);
  const stem = kind
    ? base.slice(0, -kind.length - 1)
    : exported
      ? base.slice(0, exported.index)
      : base;
  const name = `${stem}.fountain`;
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

async function convertOne(job: Job, read: ScriptRead, force: boolean): Promise<Outcome> {
  const { text } = read;
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
  return { kind: 'converted', notes: read.notes };
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

/** Why a folder couldn't be made: something that isn't a folder is already in its place. */
function folderReason(error: unknown): string {
  const code = codeOf(error);
  return code === 'EEXIST' || code === 'ENOTDIR' ? 'a file is in the way' : reason(error);
}
