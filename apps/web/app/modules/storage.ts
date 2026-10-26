import { db } from '../storage/db';
import type { ModuleContext } from './types';

/**
 * A module's own storage: rows of the `settings` table named `module:<id>:<key>`. A module id
 * has no colon, so one module's prefix is never the start of another's, and the app's own
 * settings (`strict`, `modules:enabled`) are not reachable from here.
 */
export function moduleStorage(id: string): ModuleContext['storage'] {
  const rowKey = (key: string) => `module:${id}:${key}`;
  return {
    async get<T>(key: string) {
      const row = await db.settings.get(rowKey(key));
      return row?.value as T | undefined;
    },
    async set<T>(key: string, value: T) {
      await db.settings.put({ key: rowKey(key), value });
    },
    async remove(key: string) {
      await db.settings.delete(rowKey(key));
    },
  };
}
