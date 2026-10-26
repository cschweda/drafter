import Dexie, { type EntityTable } from 'dexie';
import type { Project } from './projects';

/** A saved copy of a script's text (technical design §8.4). */
export interface Snapshot {
  id: string;
  projectId: string;
  createdAt: number;
  source: string;
  label?: string;
}

/** A user template. Plan 3 creates none; the table is here so no later plan adds a migration. */
export interface UserTemplate {
  id: string;
  [key: string]: unknown;
}

/** A file handle kept for a project, on Chromium only. */
export interface HandleRow {
  id: string;
  handle: FileSystemFileHandle;
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
