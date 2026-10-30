import { PRINT_VERSION, type ScenePrint, type SceneSlot } from '@drafter/history';
import Dexie, { type EntityTable, type Table } from 'dexie';
import { db as drafterDb } from '../storage/db';
import type { PrintStore } from '../workers/history-compute';

// The prints cache (version-history design §3.6, Call 13): a database of its own, `drafter-cache`,
// so `drafter` stays at version 1. Derived data, rebuilt by a scan when it's lost. It holds scene
// headings and previews, so it goes with the script (`removeProject`).

/** One print per distinct scene version of a script. */
export interface PrintRow extends ScenePrint {
  projectId: string;
  /** `PRINT_VERSION` when it was made: another is a miss. */
  version: number;
}

/** A snapshot's scenes in order, with their spans in its text. */
export interface SnapshotScenesRow {
  /** The snapshot's id. */
  id: string;
  projectId: string;
  version: number;
  scenes: SceneSlot[];
}

export class CacheDb extends Dexie {
  /** Keyed by `[projectId, hash]`. */
  prints!: Table<PrintRow, [string, string]>;
  snapshotScenes!: EntityTable<SnapshotScenesRow, 'id'>;

  constructor() {
    super('drafter-cache');
    this.version(1).stores({
      prints: '[projectId+hash], projectId',
      snapshotScenes: 'id, projectId',
    });
  }
}

let instance: CacheDb | null | undefined;

/**
 * The cache, made on first use. Null only where there is no IndexedDB at all; a database that is
 * there but won't open (private mode, a full disk, blocked storage) is still returned, and its
 * calls reject: `history-compute` then drops the cache and scans without it, with the same results.
 */
export function cacheDb(): CacheDb | null {
  if (instance === undefined)
    instance = typeof globalThis.indexedDB === 'undefined' ? null : new CacheDb();
  return instance;
}

/** The project's snapshot scenes of this `PRINT_VERSION`, by snapshot id. */
export async function readScenes(projectId: string): Promise<Map<string, SceneSlot[]>> {
  const out = new Map<string, SceneSlot[]>();
  const db = cacheDb();
  if (!db) return out;
  for (const row of await db.snapshotScenes.where('projectId').equals(projectId).toArray())
    if (row.version === PRINT_VERSION) out.set(row.id, row.scenes);
  return out;
}

/** The project's prints of this `PRINT_VERSION`, by hash. */
export async function readPrints(projectId: string): Promise<Map<string, ScenePrint>> {
  const out = new Map<string, ScenePrint>();
  const db = cacheDb();
  if (!db) return out;
  for (const { projectId: _, version: v, ...print } of await db.prints
    .where('projectId')
    .equals(projectId)
    .toArray())
    if (v === PRINT_VERSION) out.set(print.hash, print);
  return out;
}

/** Stores snapshots' scenes and the prints of their new versions, in one transaction. */
export async function putScenes(
  projectId: string,
  snapshots: readonly { id: string; slots: SceneSlot[] }[],
  prints: readonly ScenePrint[],
): Promise<void> {
  const db = cacheDb();
  if (!db || (snapshots.length === 0 && prints.length === 0)) return;
  await db.transaction('rw', db.snapshotScenes, db.prints, async () => {
    await db.snapshotScenes.bulkPut(
      snapshots.map(({ id, slots }) => ({ id, projectId, version: PRINT_VERSION, scenes: slots })),
    );
    await db.prints.bulkPut(
      prints.map((print) => ({ ...print, projectId, version: PRINT_VERSION })),
    );
  });
}

/**
 * After a full scan: drops the script's rows of snapshots that are gone (not in `liveIds`) and its
 * rows of another `PRINT_VERSION` (never read again), then the prints no remaining row names.
 */
export async function sweep(projectId: string, liveIds: ReadonlySet<string>): Promise<void> {
  const db = cacheDb();
  if (!db) return;
  await db.transaction('rw', db.snapshotScenes, db.prints, async () => {
    const rows = await db.snapshotScenes.where('projectId').equals(projectId).toArray();
    const kept = (row: SnapshotScenesRow) => liveIds.has(row.id) && row.version === PRINT_VERSION;
    const gone = rows.filter((row) => !kept(row)).map((row) => row.id);
    if (gone.length > 0) await db.snapshotScenes.bulkDelete(gone);
    const named = new Set<string>();
    for (const row of rows) if (kept(row)) for (const slot of row.scenes) named.add(slot.hash);
    const prints = await db.prints.where('projectId').equals(projectId).toArray();
    const unnamed = prints
      .filter((print) => print.version !== PRINT_VERSION || !named.has(print.hash))
      .map((print): [string, string] => [projectId, print.hash]);
    if (unnamed.length > 0) await db.prints.bulkDelete(unnamed);
  });
}

/**
 * Drops the rows of every script that no longer exists in Drafter's database: rows a worker was
 * still writing when its script was removed (`removeProject` clears the cache only once). Reads
 * keys only.
 */
export async function prune(): Promise<void> {
  const db = cacheDb();
  if (!db) return;
  // The cache's scripts first: a script removed between the two reads is then not in `projects`.
  const cached = new Set([
    ...(await db.snapshotScenes.orderBy('projectId').uniqueKeys()),
    ...(await db.prints.orderBy('projectId').uniqueKeys()),
  ]);
  const projects = new Set(await drafterDb.projects.toCollection().primaryKeys());
  for (const projectId of cached)
    if (typeof projectId === 'string' && !projects.has(projectId))
      await clearProjectCache(projectId);
}

/** Deletes every row of the script's (`removeProject` calls it). */
export async function clearProjectCache(projectId: string): Promise<void> {
  const db = cacheDb();
  if (!db) return;
  await db.transaction('rw', db.snapshotScenes, db.prints, async () => {
    await db.snapshotScenes.where('projectId').equals(projectId).delete();
    await db.prints.where('projectId').equals(projectId).delete();
  });
}

/** The cache as the history worker uses it; null without one. */
export function cacheStore(): PrintStore | null {
  if (!cacheDb()) return null;
  return { scenes: readScenes, prints: readPrints, put: putScenes, sweep, prune };
}
