import { db } from '../storage/db';
import { DEFINITIONS_SOURCE, isTheFile } from './source';

// Where the downloaded dictionary is kept (definitions design §7.2): one row in IndexedDB's
// `definitions` table, on drafter.dev and the desktop alike, holding the file as published (still
// gzipped). Only the pinned file is ever stored, and Remove deletes the row.

export interface DefinitionsRow {
  /** Always 'w1913': one dictionary, one row. */
  key: string;
  edition: string;
  sha256: string;
  bytes: Blob;
  added: number;
}

const KEY = 'w1913';

/** Stores the pinned file; refuses anything else. */
export async function saveDefinitions(bytes: Uint8Array): Promise<void> {
  if (!(await isTheFile(bytes)))
    throw new Error('The downloaded dictionary isn’t the expected file.');
  await db.definitions.put({
    key: KEY,
    edition: DEFINITIONS_SOURCE.edition,
    sha256: DEFINITIONS_SOURCE.sha256,
    bytes: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    added: Date.now(),
  });
}

/** Whether the pinned edition is stored (a row of another edition counts as not). */
export async function hasDefinitions(): Promise<boolean> {
  const row = await db.definitions.get(KEY);
  return !!row && row.sha256 === DEFINITIONS_SOURCE.sha256;
}

/** The stored file's bytes, checked again, or null. */
export async function readDefinitions(): Promise<Uint8Array | null> {
  const row = await db.definitions.get(KEY);
  if (!row || row.sha256 !== DEFINITIONS_SOURCE.sha256) return null;
  const bytes = new Uint8Array(await row.bytes.arrayBuffer());
  return (await isTheFile(bytes)) ? bytes : null;
}

export async function removeDefinitions(): Promise<void> {
  await db.definitions.delete(KEY);
}
