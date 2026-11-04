// Drafts and cuts as plain files beside the work (drafts-and-cuts design §4): the drafts folder,
// `Boca drafts/`, with one file per draft (`Boca – Draft 01.fountain`), and the cuts file,
// `Boca.fountain.cuts.md`, next to the script's own file. The browser's storage stays the working
// copy; these are written whenever there is somewhere to write them (`BesideFolder`: the desktop
// app's IPC, `desktop.ts`, or a folder the writer granted in Chromium, `web.ts`), and read back
// and merged when the work is opened, so a second computer's drafts and cuts arrive.
//
// - A draft file is only ever created, never written over. A name already taken by another text
//   (another computer's Draft 04) leaves that file alone, and this one is written as
//   `Boca – Draft 04 (2).fountain`. Draft files are written with line feeds: a draft's ID is of
//   the editor's text, which has them (DECISIONS).
// - The cuts file is only ever grown: the file is read, its entries checked (`read.ts`), merged
//   with the stored cuts (the trusted side), and the whole written back; what the file had that
//   storage hadn't is merged into storage too. A block the merge can't hold whole (damaged,
//   forged, of another kind, or dated ahead of this clock) is carried to the end of the file byte
//   for byte, so the file never loses anything it held (DECISIONS).
import {
  type BesideNames,
  type CutEntry,
  cutsFile,
  type DraftFacts,
  draftFile,
  draftFileName,
  draftName as draftLabel,
  mergeCuts,
  type WorkKind,
} from '@drafter/history';

export { type BesideNames, besideNames } from '@drafter/history';

import { entryOf, listCuts, mergeIntoCuts } from '../cuts/store';
import {
  addDraftFromFile,
  type DraftRow,
  draftText,
  listDrafts,
  setDraftWritten,
} from '../drafts/store';
import { CANT_READ, readCutsBytes, readDraftBytes } from './read';

/** Somewhere drafts and cuts can be written: names are relative to the work's folder. */
export interface BesideFolder {
  /** The file's bytes, or null when it isn't there. */
  read(rel: string): Promise<Uint8Array | null>;
  /** The draft files' names in the drafts folder `folder` (none when it isn't there). */
  list(folder: string): Promise<string[]>;
  /** Writes a new file only where nothing is: `exists` (and the file untouched) otherwise. */
  create(rel: string, bytes: Uint8Array): Promise<'written' | 'exists'>;
  /** Replaces the file whole (the cuts file only). */
  replace(rel: string, bytes: Uint8Array): Promise<void>;
}

/** The most `(2)`, `(3)` … tried for one draft number before giving up. */
export const MAX_COPIES = 50;

/** A draft's file name, the `copy`th of its number when another text has the plain one. */
export function draftName(names: BesideNames, n: number, kind: WorkKind, copy = 1): string {
  const name = draftFileName(names.work, n, kind);
  if (copy === 1) return name;
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)} (${copy})${name.slice(dot)}`;
}

/** A draft's facts, as its file holds them. */
export function factsOf(row: DraftRow): DraftFacts {
  return {
    draft: row.n,
    id: row.id,
    frozen: new Date(row.frozenAt).toISOString(),
    note: row.note,
    ...(row.from ? { from: { draft: row.from.n, id: row.from.id } } : {}),
  };
}

/**
 * Writes Draft `row` beside the work, never over a file: the plain name, else the first `(k)`
 * that is free or already holds this very draft. Resolves with the name it is at, or null when
 * every name is taken by other texts.
 */
export async function writeDraft(
  folder: BesideFolder,
  names: BesideNames,
  row: DraftRow,
  text: string,
  kind: WorkKind,
): Promise<string | null> {
  const bytes = new TextEncoder().encode(draftFile(text, factsOf(row), kind));
  for (let copy = 1; copy <= MAX_COPIES; copy++) {
    const name = draftName(names, row.n, kind, copy);
    const rel = `${names.folder}/${name}`;
    if ((await folder.create(rel, bytes)) === 'written') return name;
    const there = await folder.read(rel);
    if (there) {
      const read = await readDraftBytes(there, kind);
      if (read.facts && read.matches && read.hash === row.id) return name;
    }
  }
  return null;
}

/** What `mergeCutsFile` did. */
export interface CutsMerged {
  /** The file's entries that passed its checks. */
  incoming: CutEntry[];
  /** Entries left out of the list (damaged, forged, or of another kind); they stay in the file. */
  skipped: number;
  /** Whether the file was written. */
  written: boolean;
  /** Why the file couldn't be read (too big, not UTF-8): it is then left as it is. */
  problem: string | null;
}

/**
 * Grows the cuts file beside the work: reads it, checks its entries, merges them with `local`
 * (the stored cuts, the trusted side), and writes the whole back when that adds anything. A file
 * that can't be read at all is left alone, so nothing in it is lost.
 */
export async function mergeCutsFile(
  folder: BesideFolder,
  names: BesideNames,
  local: readonly CutEntry[],
  kind: WorkKind,
  now: Date,
): Promise<CutsMerged> {
  let there: Uint8Array | null;
  try {
    there = await folder.read(names.cuts);
  } catch {
    // Never written over unread: what it holds could be another computer's cuts.
    return { incoming: [], skipped: 0, written: false, problem: CANT_READ };
  }
  let incoming: CutEntry[] = [];
  let skipped = 0;
  let blocks: { body: string; entry: CutEntry | null }[] = [];
  if (there) {
    const read = await readCutsBytes(there, kind);
    if (read.problem) return { incoming: [], skipped: 0, written: false, problem: read.problem };
    incoming = read.entries;
    skipped = read.skipped;
    blocks = read.blocks;
  }
  const merged = mergeCuts(local, incoming, { kind, now });
  if (merged.length === 0 && !there) return { incoming, skipped, written: false, problem: null };
  const bytes = new TextEncoder().encode(
    cutsFile(names.file, merged, carriedBlocks(blocks, merged)),
  );
  if (there && sameBytes(there, bytes)) return { incoming, skipped, written: false, problem: null };
  await folder.replace(names.cuts, bytes);
  return { incoming, skipped, written: true, problem: null };
}

/**
 * The file's blocks the merged list doesn't hold whole: unreadable or unverified ones, ones of
 * another kind, and ones with a date the merge left out (ahead of the clock, or past the cap).
 * Each once, in the file's order.
 */
export function carriedBlocks(
  blocks: readonly { body: string; entry: CutEntry | null }[],
  merged: readonly CutEntry[],
): string[] {
  const dates = new Map<string, Set<string>>();
  for (const entry of merged)
    dates.set(entry.id, new Set(entry.cuts.map((c) => `${c.at}|${c.draft}`)));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { body, entry } of blocks) {
    const held = entry ? dates.get(entry.id) : undefined;
    if (held && entry?.cuts.every((c) => held.has(`${c.at}|${c.draft}`))) continue;
    if (seen.has(body)) continue;
    seen.add(body);
    out.push(body);
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** What `syncBeside` did, for the lists and the status line. */
export interface Synced {
  /** Drafts read from the folder that the script hadn't. */
  draftsAdded: number;
  /** Drafts written to the folder. */
  draftsWritten: number;
  /** Cuts from the file that storage hadn't (or had fewer dates of). */
  cutsAdded: number;
  /** Cuts in the file left out. */
  skipped: number;
  /** The draft files found that were changed outside Drafter. */
  changed: string[];
  /** Why the cuts file couldn't be read, or null. */
  problem: string | null;
  /**
   * What couldn't be written this time ("Draft 03", or the cuts file's name), each with its error;
   * the next sync tries again. One failing never stops the rest.
   */
  failed: { what: string; error: unknown }[];
}

/** How `syncBeside` runs. */
export interface SyncOptions {
  /** Read the drafts folder and keep what is new (on opening the work). */
  readDrafts: boolean;
  /** Merge and write the cuts file (on opening, after a cut, after a move). */
  cuts: boolean;
  now: Date;
}

/**
 * Brings the script's drafts and cuts and the files beside its work together: reads the drafts
 * folder (when asked) and keeps every draft it hasn't got, writes every draft not yet written
 * here, and grows the cuts file, merging what it had into storage. `where` names this place, so
 * a draft written somewhere else (before a Save As) is written again here.
 */
export async function syncBeside(
  projectId: string,
  folder: BesideFolder,
  names: BesideNames,
  kind: WorkKind,
  where: string,
  options: SyncOptions,
): Promise<Synced> {
  const out: Synced = {
    draftsAdded: 0,
    draftsWritten: 0,
    cutsAdded: 0,
    skipped: 0,
    changed: [],
    problem: null,
    failed: [],
  };
  if (options.readDrafts) {
    for (const found of await readDraftsFolder(folder, names, kind)) {
      if (found.read.facts === null) continue;
      const { facts, text, matches, hash } = found.read;
      if (!matches) out.changed.push(found.name);
      const added = await addDraftFromFile(projectId, {
        n: facts.draft,
        id: hash,
        text,
        frozenAt: Date.parse(facts.frozen),
        note: facts.note,
        ...(facts.from ? { from: { n: facts.from.draft, id: facts.from.id } } : {}),
        changed: !matches,
        kind,
        file: found.name,
        where,
      });
      if (added) out.draftsAdded++;
    }
  }
  const place = `${where}|`;
  for (const row of (await listDrafts(projectId)).reverse()) {
    if (row.written?.startsWith(place)) continue;
    const text = await draftText(projectId, row.key);
    if (text === null) continue;
    // One draft that can't be written (a full disk, a name refused) leaves the rest, and the cuts
    // file, to be written: it is reported, and tried again at the next sync.
    try {
      const name = await writeDraft(folder, names, row, text, kind);
      if (name === null) continue;
      await setDraftWritten(row.key, `${place}${name}`);
      out.draftsWritten++;
    } catch (error) {
      out.failed.push({ what: draftLabel(row.n), error });
    }
  }
  if (options.cuts) {
    const local = (await listCuts(projectId)).map(entryOf);
    let merged: CutsMerged;
    try {
      merged = await mergeCutsFile(folder, names, local, kind, options.now);
    } catch (error) {
      out.failed.push({ what: names.cuts, error });
      return out;
    }
    out.skipped = merged.skipped;
    out.problem = merged.problem;
    out.cutsAdded = await mergeIntoCuts(projectId, kind, merged.incoming, options.now);
  }
  return out;
}

/** The draft files in the work's drafts folder, each read and checked. */
export async function readDraftsFolder(
  folder: BesideFolder,
  names: BesideNames,
  kind: WorkKind,
): Promise<{ name: string; read: Awaited<ReturnType<typeof readDraftBytes>> }[]> {
  const ext = kind === 'fountain' ? '.fountain' : '.md';
  const out = [];
  for (const name of await folder.list(names.folder)) {
    // A Markdown work's drafts are `.md`; a script's `.fountain`: two works with one stem share
    // the folder, and each reads only its own.
    if (!name.startsWith(`${names.work} – Draft `) || !name.endsWith(ext)) continue;
    const bytes = await folder.read(`${names.folder}/${name}`).catch(() => null);
    if (!bytes) continue;
    out.push({ name, read: await readDraftBytes(bytes, kind) });
  }
  // A number's plain file first, then its `(2)`, `(3)` …: the plain one is the draft of that
  // number, as it was written first.
  const copyOf = (name: string) => Number(/ \((\d+)\)\.[a-z]+$/.exec(name)?.[1] ?? 1);
  return out.sort((a, b) => copyOf(a.name) - copyOf(b.name) || (a.name < b.name ? -1 : 1));
}
