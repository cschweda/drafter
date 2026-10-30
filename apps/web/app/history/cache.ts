import { PRINT_VERSION, type ScenePrint, type SceneSlot } from '@drafter/history';
import Dexie, { type EntityTable, type Table } from 'dexie';
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

/** The cache, opened on first use; null where there is no IndexedDB: scan without it. */
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
 * After a full scan: drops the rows of the script's snapshots that are gone (not in `liveIds`),
 * then the prints no remaining row names.
 */
export async function sweep(projectId: string, liveIds: ReadonlySet<string>): Promise<void> {
  const db = cacheDb();
  if (!db) return;
  await db.transaction('rw', db.snapshotScenes, db.prints, async () => {
    const rows = await db.snapshotScenes.where('projectId').equals(projectId).toArray();
    const gone = rows.filter((row) => !liveIds.has(row.id)).map((row) => row.id);
    if (gone.length > 0) await db.snapshotScenes.bulkDelete(gone);
    const named = new Set<string>();
    for (const row of rows)
      if (liveIds.has(row.id)) for (const slot of row.scenes) named.add(slot.hash);
    const keys = await db.prints.where('projectId').equals(projectId).primaryKeys();
    const unnamed = keys.filter(([, hash]) => !named.has(hash));
    if (unnamed.length > 0) await db.prints.bulkDelete(unnamed);
  });
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
  return { scenes: readScenes, prints: readPrints, put: putScenes, sweep };
}
