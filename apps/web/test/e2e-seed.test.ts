import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { db } from '../app/storage/db';
import { drafterDatabase, sampleSeenRows } from '../e2e/seed';

// The browser tests start with a database made from `drafterDatabase`: if it drifts from what Dexie
// declares in `app/storage/db.ts`, Dexie would upgrade or refuse it, and every test would start
// from something other than a browser Drafter has seen.
describe('the browser tests’ seeded database', () => {
  test('has the stores, keys, indexes, and version that db.ts declares', async () => {
    await db.open();
    const seeded = drafterDatabase(sampleSeenRows);
    expect(seeded.name).toBe(db.name);
    expect(seeded.version).toBe(Math.round(db.verno * 10));
    const shape = (stores: Array<{ name: string; keyPath: unknown; indexes: string[] }>) =>
      [...stores].sort((a, b) => a.name.localeCompare(b.name));
    expect(
      shape(
        seeded.stores.map((store) => ({
          name: store.name,
          keyPath: store.keyPath,
          indexes: store.indexes.map((index) => index.name).sort(),
        })),
      ),
    ).toEqual(
      shape(
        db.tables.map((table) => ({
          name: table.name,
          keyPath: table.schema.primKey.keyPath,
          indexes: table.schema.indexes.map((index) => index.name).sort(),
        })),
      ),
    );
    db.close();
  });
});
