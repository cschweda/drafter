import Dexie, { type EntityTable } from 'dexie';
import type { DraftRow } from '../drafts/store';
import type { FileRef } from './files';
import type { Project } from './projects';
import type { SnapshotReason } from './snapshots';

/**
 * A saved copy of a script's text (technical design §8.4): the saved row, `saved:<projectId>`, the
 * text as last saved to its file, as Phase 1 wrote it; or a history snapshot (`storage/snapshots.ts`).
 * Every field after `createdAt` is optional and unindexed, so they needed no new version, and a row
 * written before they existed reads as it did.
 */
export interface Snapshot {
  id: string;
  projectId: string;
  createdAt: number;
  /** The saved row's text, and a history snapshot's where it was kept uncompressed. */
  source?: string;
  /** The text, gzip-compressed. */
  gz?: Uint8Array;
  /** The writer's; the saved row's 'Saved' stays as it is. */
  label?: string;
  /** Every history snapshot has one; the saved row has none. */
  reason?: SnapshotReason;
  /** A file's name, for 'opened' and 'imported'. */
  detail?: string;
  /** `hashText` of the text. */
  hash?: string;
  /** `wordsIn` of the text. */
  words?: number;
}

/** A user template. Plan 3 creates none; the table is here so no later plan adds a migration. */
export interface UserTemplate {
  id: string;
  [key: string]: unknown;
}

/** The file a project was saved to or opened from, as the `FileAccess` in use made it (a handle, on Chromium). */
export interface HandleRow {
  id: string;
  ref: FileRef;
}

/**
 * A cut (drafts-and-cuts design §3): something that left the text, kept for good. Keyed
 * `${projectId}:${id}`, where `id` is the SHA-256 of its text. Version 2 makes the table; the cuts
 * recorder (Task 4) fills it and adds its fields, all unindexed.
 */
export interface CutRow {
  key: string;
  projectId: string;
  id: string;
  [field: string]: unknown;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

class DrafterDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  templates!: EntityTable<UserTemplate, 'id'>;
  handles!: EntityTable<HandleRow, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  drafts!: EntityTable<DraftRow, 'key'>;
  cuts!: EntityTable<CutRow, 'key'>;

  constructor() {
    super('drafter');
    // Technical design §8.1's version 1, which held every table until drafts and cuts.
    this.version(1).stores({
      projects: 'id, title, updatedAt',
      snapshots: 'id, projectId, createdAt',
      templates: 'id',
      handles: 'id',
      settings: 'key',
    });
    // Version 2 (v0.24.0, drafts-and-cuts design §2, §3): two new tables, and nothing else changes,
    // so the upgrade only adds them; every row of version 1 stays as it is. A draft is keyed
    // `${projectId}:${n}` and found by its ID's prefix (`id`); a cut, `${projectId}:${id}`.
    this.version(2).stores({
      drafts: 'key, projectId, [projectId+n], id',
      cuts: 'key, projectId, id',
    });
  }
}

/** Opens on first use, so importing this does nothing where IndexedDB is missing. */
export const db = new DrafterDb();
