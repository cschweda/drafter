// What the browser tests' storage state puts in Drafter's database before each test (see
// playwright.config.ts). test/e2e-seed.test.ts checks it against app/storage/db.ts.

export const sampleSeenRows = ['screenplay', 'stage-play', 'markdown'].map((kind) => ({
  key: `sample-seen:${kind}`,
  value: true,
}));

/**
 * Drafter's database (`app/storage/db.ts`: Dexie's version 1, which IndexedDB knows as 10) holding
 * these settings rows, as Playwright's storage state restores it. The stores and indexes are the
 * ones Dexie makes, so it opens the database as its own.
 */
export function drafterDatabase(settings: Array<{ key: string; value: unknown }>) {
  const index = (name: string) => ({ name, keyPath: name, multiEntry: false, unique: false });
  const store = (
    name: string,
    keyPath: string,
    indexes: string[] = [],
    records: unknown[] = [],
  ) => ({
    name,
    keyPath,
    autoIncrement: false,
    indexes: indexes.map(index),
    records: records.map((value) => ({ value })),
  });
  return {
    name: 'drafter',
    version: 10,
    stores: [
      store('projects', 'id', ['title', 'updatedAt']),
      store('snapshots', 'id', ['projectId', 'createdAt']),
      store('templates', 'id'),
      store('handles', 'id'),
      store('settings', 'key', [], settings),
    ],
  };
}
