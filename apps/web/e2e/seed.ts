// What the browser tests' storage state puts in Drafter's database before each test (see
// playwright.config.ts). test/e2e-seed.test.ts checks it against app/storage/db.ts.

export const sampleSeenRows = ['screenplay', 'stage-play', 'markdown'].map((kind) => ({
  key: `sample-seen:${kind}`,
  value: true,
}));

type IndexSpec = string | { name: string; keyPath: string[] };
interface StoreIndex {
  name: string;
  keyPath?: string;
  keyPathArray?: string[];
  multiEntry: boolean;
  unique: boolean;
}

/** The stores of Drafter's database at IndexedDB version `version` (Dexie's times 10). */
function database(version: 10 | 20, settings: Array<{ key: string; value: unknown }>) {
  // A compound index's key path is Playwright's `keyPathArray`.
  const index = (spec: IndexSpec): StoreIndex =>
    typeof spec === 'string'
      ? { name: spec, keyPath: spec, multiEntry: false, unique: false }
      : { name: spec.name, keyPathArray: spec.keyPath, multiEntry: false, unique: false };
  const store = (
    name: string,
    keyPath: string,
    indexes: IndexSpec[] = [],
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
    version,
    stores: [
      store('projects', 'id', ['title', 'updatedAt']),
      store('snapshots', 'id', ['projectId', 'createdAt']),
      store('templates', 'id'),
      store('handles', 'id'),
      store('settings', 'key', [], settings),
      ...(version === 20
        ? [
            store('drafts', 'key', [
              'projectId',
              { name: '[projectId+n]', keyPath: ['projectId', 'n'] },
              'id',
            ]),
            store('cuts', 'key', ['projectId', 'id']),
          ]
        : []),
    ],
  };
}

/**
 * Drafter's database (`app/storage/db.ts`: Dexie's version 2, which IndexedDB knows as 20) holding
 * these settings rows, as Playwright's storage state restores it. The stores and indexes are the
 * ones Dexie makes, so it opens the database as its own.
 */
export function drafterDatabase(settings: Array<{ key: string; value: unknown }>) {
  return database(20, settings);
}

/**
 * The database as v0.23.1 left it (Dexie's version 1, IndexedDB's 10): no drafts or cuts tables.
 * Drafter upgrades it on first use (test/db-upgrade.test.ts, e2e/drafts.spec.ts).
 */
export function drafterDatabaseV1(settings: Array<{ key: string; value: unknown }>) {
  return database(10, settings);
}

/**
 * The tests' storage state (playwright.config.ts) with these settings rows as well, for
 * `test.use({ storageState })`.
 */
export function stateWithSettings(settings: Array<{ key: string; value: unknown }>) {
  return {
    cookies: [],
    origins: [
      {
        origin: `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}`,
        localStorage: [
          { name: 'drafter-tour-v1', value: 'true' },
          { name: 'drafter-storage-toast-v1', value: 'true' },
          { name: 'nuxt-color-mode', value: 'dark' },
        ],
        indexedDB: [drafterDatabase([...sampleSeenRows, ...settings])],
      },
    ],
  };
}
