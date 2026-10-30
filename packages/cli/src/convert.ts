// `drafter convert`: Final Draft, Highland, and Fade In files to Fountain, many at once, through
// the same functions and checks as the app's Open (docs/DECISIONS.md, `drafter convert`).
import { randomBytes } from 'node:crypto';
import { constants, type Dirent, type Stats } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ArchiveError,
  type ArchiveFormat,
  fromFadeIn,
  fromHighland,
  notAScript,
  refusalMessage,
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

type Kind = 'fdx' | 'highland' | 'fadein';

const KIND = /\.(fdx|highland|fadein)$/i;

const kindOf = (name: string): Kind | null =>
  (KIND.exec(name)?.[1]?.toLowerCase() as Kind | undefined) ?? null;

/** The app's Open caps: a Final Draft file is text, at most 5 MB; an archive, the zip reader's 32 MB. */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_BYTES: Record<Kind, number> = {
  fdx: MAX_TEXT_BYTES,
  highland: ZIP_LIMITS.maxArchiveBytes,
  fadein: ZIP_LIMITS.maxArchiveBytes,
};
const FORMAT: Record<'highland' | 'fadein', ArchiveFormat> = {
  highland: 'Highland',
  fadein: 'Fade In',
};
/** A NUL in this many leading bytes means the file is not text, as Open has it. */
const SNIFF_BYTES = 8 * 1024;

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
      throw new ConvertError(`can't write to ${options.out}: ${reason(error)}`);
    }
  }
  const counts = { converted: 0, skipped: 0, refused: 0 };
  /** The targets written in this run, by a key that matches on a case-insensitive disk too. */
  const written = new Map<string, string>();

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
    const jobs: Job[] = [];
    if (info.isDirectory()) {
      for (const rel of await scriptsIn(source, options.recursive === true)) {
        jobs.push(jobFor(join(source, rel), join(path, rel), rel, outDir, options.out));
      }
      if (jobs.length === 0) io.out(`${path}: nothing to convert here\n`);
    } else if (info.isFile()) {
      jobs.push(jobFor(source, path, basename(source), outDir, options.out));
    } else {
      report({ shown: path }, { kind: 'refused', reason: 'it isn’t a file or a folder' });
    }
    for (const job of jobs) {
      const key = job.target.toLowerCase();
      const earlier = written.get(key);
      if (earlier !== undefined) {
        report(job, {
          kind: 'refused',
          reason: `${job.targetShown} was already written from ${earlier} in this run`,
        });
        continue;
      }
      const outcome = await convertOne(job, options.force === true);
      if (outcome.kind === 'converted') written.set(key, job.shown);
      report(job, outcome);
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

/** `rel`'s Fountain: beside the source, or under `--out` with the folders under the argument kept. */
function jobFor(
  source: string,
  shown: string,
  rel: string,
  outDir: string | undefined,
  outShown: string | undefined,
): Job {
  const name = `${basename(source).replace(KIND, '')}.fountain`;
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
 * link, so a loop can't trap it). Names starting with `.` are left out, as a macOS `._` file is.
 */
async function scriptsIn(folder: string, recursive: boolean): Promise<string[]> {
  const found: string[] = [];
  const walk = async (rel: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(join(folder, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = rel === '' ? entry.name : join(rel, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(path);
      } else if (kindOf(entry.name) && (await isFile(entry, join(folder, path)))) {
        found.push(path);
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
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    return { kind: 'refused', reason: 'the script in it is larger than 5 MB' };
  }
  try {
    await mkdir(dirname(job.target), { recursive: true });
    if (force) await replace(job.target, text);
    else await writeFile(job.target, text, { flag: 'wx' });
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST' && !force) return { kind: 'skipped' };
    return { kind: 'refused', reason: `can't write ${job.targetShown}: ${reason(error)}` };
  }
  const notes = imported.mapped.reduce((sum, { count }) => sum + count, 0);
  return { kind: 'converted', notes };
}

/**
 * Writes `text` to a new file beside `target`, then renames it over `target`: a link there is
 * replaced, never followed, so `--force` can't write through one to the source or anywhere else.
 */
async function replace(target: string, text: string): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, text, { flag: 'wx' });
    await rename(temp, target);
  } catch (error) {
    // Never a file that was there already: only the one this call made.
    if ((error as { code?: string }).code !== 'EEXIST') await unlink(temp).catch(() => {});
    throw error;
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
  const kind = kindOf(name);
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
  if (text.startsWith('﻿')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** The file's bytes, or a refusal when it is over `cap`: never more than `cap` + 1 bytes are read. */
async function readCapped(source: string, cap: number, kind: Kind): Promise<Uint8Array> {
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
  if (code === 'EEXIST' || code === 'ENOTDIR') return "it isn't a folder";
  return (error as Error).message;
}
