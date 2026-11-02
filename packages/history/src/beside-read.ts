// Reading the drafts and the cuts file found beside the work (drafts-and-cuts design §4.2, §8; moved from the app so the app and Drafter for Claude share it):
// the writer's own text, but untrusted, since it may have been edited elsewhere (another computer,
// a text editor, anything that can write to the folder). Pure: bytes in, entries out, with no app
// state, so the trap documents run it on hostile files (fixtures/trap, entry point `beside-read`).
//
// - Bytes are capped, then decoded strictly as UTF-8 with the byte order mark kept
//   (`ignoreBOM`), as `drafter convert` does, so a draft's hash still matches.
// - The cuts file is read with `readCutsFile` (a linear scan), then every entry is checked by
//   `verifyCuts` (its ID must be the SHA-256 of its text), and entries of another kind are left
//   out. What was left out is counted, never thrown, and its block kept for the rewrite to carry.
// - A draft file's line breaks are made line feeds before its ID is checked: a draft's ID is of
//   the editor's text, which always has line feeds (the file's own line break is kept apart).
import { type CutEntry, cutsFileBlocks, verifyCuts } from './cuts-file';
import { type DraftFacts, readDraftFile, type WorkKind } from './draft-file';

/** The SHA-256 of the text's UTF-8 bytes, as lower-case hex. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The largest draft or cuts file read: Open's own cap for a file (32 MB). */
export const MAX_BESIDE_BYTES = 32 * 1024 * 1024;

export const TOO_BIG = 'it is too big (over 32 MB)';
export const NOT_UTF8 = 'it isn’t UTF-8 text';
export const CANT_READ = 'it can’t be read';

/** Strict UTF-8, the byte order mark kept; null when the bytes aren't UTF-8. */
export function decodeBeside(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The cuts file, read and checked. */
export interface CutsRead {
  /** The entries that passed: their IDs verified, of the work's kind. */
  entries: CutEntry[];
  /** How many were left out: damaged, forged, or of another kind. */
  skipped: number;
  /** Why none could be read at all (too big, not UTF-8), or null. */
  problem: string | null;
  /**
   * Every cut's block, exactly as the file has it, with its entry when it passed (else null), so
   * a rewrite can carry what it couldn't read.
   */
  blocks: { body: string; entry: CutEntry | null }[];
}

/** Reads the cuts file's bytes for a work of `kind`: only entries whose IDs check out. */
export async function readCutsBytes(bytes: Uint8Array, kind: WorkKind): Promise<CutsRead> {
  if (bytes.byteLength > MAX_BESIDE_BYTES)
    return { entries: [], skipped: 0, problem: TOO_BIG, blocks: [] };
  const file = decodeBeside(bytes);
  if (file === null) return { entries: [], skipped: 0, problem: NOT_UTF8, blocks: [] };
  const blocks: CutsRead['blocks'] = [];
  const entries: CutEntry[] = [];
  let skipped = 0;
  for (const block of cutsFileBlocks(file)) {
    let entry: CutEntry | null = null;
    if (block.entry) {
      const [verified] = (await verifyCuts([block.entry])).entries;
      if (verified && verified.kind === kind) entry = verified;
    }
    if (entry) entries.push(entry);
    else skipped++;
    blocks.push({ body: block.body, entry });
  }
  return { entries, skipped, problem: null, blocks };
}

/** A draft file, read and checked. */
export type DraftRead =
  | {
      facts: DraftFacts;
      /** The draft's text, with line feeds. */
      text: string;
      /** Its ID is the hash of its text: false when it was changed outside Drafter. */
      matches: boolean;
      /** The hash of its text, as it is now. */
      hash: string;
    }
  | { facts: null; problem: string };

/** Reads a draft file's bytes: its facts, its text (line feeds), and whether its ID still holds. */
export async function readDraftBytes(bytes: Uint8Array, kind: WorkKind): Promise<DraftRead> {
  if (bytes.byteLength > MAX_BESIDE_BYTES) return { facts: null, problem: TOO_BIG };
  const file = decodeBeside(bytes);
  if (file === null) return { facts: null, problem: NOT_UTF8 };
  const read = readDraftFile(file.replace(/\r\n?/g, '\n'), kind);
  if (read.facts === null) return { facts: null, problem: read.problem };
  const hash = await sha256Hex(read.text);
  return { facts: read.facts, text: read.text, matches: hash === read.facts.id, hash };
}

/** What the lists say about a cuts file's entries left out. */
export function skippedLine(skipped: number, file: string): string {
  if (skipped === 0) return '';
  return skipped === 1
    ? `1 cut in “${file}” couldn’t be read. It stays in the file, but isn’t listed.`
    : `${skipped} cuts in “${file}” couldn’t be read. They stay in the file, but aren’t listed.`;
}

/** Said of a draft file whose text no longer matches its ID. */
export const CHANGED_OUTSIDE = 'changed outside Drafter';
