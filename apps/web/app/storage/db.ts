import Dexie, { type EntityTable } from 'dexie';
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

  constructor() {
    super('drafter');
    // The whole of technical design §8.1's version 1, so later plans add no migration.
    this.version(1).stores({
      projects: 'id, title, updatedAt',
      snapshots: 'id, projectId, createdAt',
      templates: 'id',
      handles: 'id',
      settings: 'key',
    });
  }
}

/** Opens on first use, so importing this does nothing where IndexedDB is missing. */
export const db = new DrafterDb();
