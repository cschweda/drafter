import { db } from '../storage/db';
import type { ModuleContext } from './types';

/** A module's share of this browser's storage: enough for its own data, far from the app's own. */
export const STORAGE_QUOTA = { bytes: 4 * 1024 * 1024, keys: 500 } as const;

/** The size a stored value and its key take, roughly: the key plus the value as JSON. */
function sizeOf(key: string, value: unknown): number {
  try {
    return key.length + (JSON.stringify(value)?.length ?? 0);
  } catch {
    return key.length;
  }
}

/**
 * A module's own storage: rows of the `settings` table named `module:<id>:<key>`. A module id
 * has no colon, so one module's prefix is never the start of another's, and the app's own
 * settings (`strict`, `modules:enabled`) are not reachable from here. A module is held to its own
 * share of the browser's storage (`STORAGE_QUOTA`), so it can't fill the table the recovery copies
 * also live in (minor 4).
 */
export function moduleStorage(id: string): ModuleContext['storage'] {
  const prefix = `module:${id}:`;
  const rowKey = (key: string) => `${prefix}${key}`;
  return {
    async get<T>(key: string) {
      const row = await db.settings.get(rowKey(key));
      return row?.value as T | undefined;
    },
    async set<T>(key: string, value: T) {
      const full = rowKey(key);
      const rows = await db.settings.where('key').startsWith(prefix).toArray();
      let bytes = sizeOf(full, value);
      let keys = 1;
      for (const row of rows) {
        if (row.key === full) continue; // Overwriting this key reuses its room.
        bytes += sizeOf(row.key, row.value);
        keys += 1;
      }
      if (bytes > STORAGE_QUOTA.bytes || keys > STORAGE_QUOTA.keys) {
        throw new Error('This module has used up its share of this browser’s storage.');
      }
      await db.settings.put({ key: full, value });
    },
    async remove(key: string) {
      await db.settings.delete(rowKey(key));
    },
  };
}
