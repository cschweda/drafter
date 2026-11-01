import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { drafterDatabaseV1 } from '../e2e/seed';

// Version 2 of Drafter's database (v0.24.0) adds the drafts and cuts tables. A browser that ran
// v0.23.1 has version 1 with scripts, snapshots, file handles, and settings in it: the upgrade must
// keep every one of them as it was.

/** Makes the database as v0.23.1 left it, from the same shape the browser tests seed. */
function makeV1(rows: Record<string, unknown[]>): Promise<void> {
  const shape = drafterDatabaseV1([]);
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(shape.name, shape.version);
    open.onupgradeneeded = () => {
      const idb = open.result;
      for (const store of shape.stores) {
        const made = idb.createObjectStore(store.name, { keyPath: store.keyPath });
        for (const index of store.indexes)
          made.createIndex(index.name, (index.keyPathArray ?? index.keyPath) as string | string[]);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction(Object.keys(rows), 'readwrite');
      for (const [name, list] of Object.entries(rows))
        for (const row of list) tx.objectStore(name).put(row);
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

const deleteDrafter = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('drafter');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

afterEach(async () => {
  const { db } = await import('../app/storage/db');
  db.close();
  vi.resetModules();
  await deleteDrafter();
});

describe('upgrading Drafter’s database from v0.23.1', () => {
  test('keeps every script, snapshot, handle, and setting, and adds drafts and cuts', async () => {
    vi.resetModules();
    await deleteDrafter();
    const { gzip } = await import('../app/storage/gzip');
    const gz = await gzip('INT. HALL - DAY\n\nOld words.\n');
    const projects = [
      {
        id: 'p1',
        title: 'Boca',
        templateId: 'us-screenplay',
        source: 'INT. HALL - DAY\n\nNew words.\n',
        lineBreak: '\n',
        meta: null,
        createdAt: 1,
        updatedAt: 2,
        fsHandleId: 'h1',
        fileName: 'Boca.fountain',
      },
      {
        id: 'p2',
        title: 'Notes',
        kind: 'markdown',
        templateId: 'us-screenplay',
        source: '# Notes\n',
        lineBreak: '\r\n',
        meta: null,
        createdAt: 3,
        updatedAt: 4,
      },
    ];
    const snapshots = [
      { id: 'saved:p1', projectId: 'p1', createdAt: 5, source: 'saved text', label: 'Saved' },
      { id: 's1', projectId: 'p1', createdAt: 6, gz, reason: 'timed', hash: 'abc', words: 4 },
      {
        id: 's2',
        projectId: 'p1',
        createdAt: 7,
        source: 'plain',
        reason: 'manual',
        label: 'Act 1',
      },
      { id: 's3', projectId: 'p2', createdAt: 8, source: '# Notes\n', reason: 'opened' },
    ];
    const handles = [{ id: 'h1', ref: { name: 'Boca.fountain' } }];
    const settings = [
      { key: 'sample-seen:screenplay', value: true },
      { key: 'settings', value: { theme: 'dark' } },
    ];
    await makeV1({ projects, snapshots, handles, settings, templates: [] });

    const { db } = await import('../app/storage/db');
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.projects.toArray()).toEqual(projects);
    const kept = await db.snapshots.orderBy('createdAt').toArray();
    expect(kept.map(({ gz: _gz, ...rest }) => rest)).toEqual(
      snapshots.map(({ gz: _gz, ...rest }) => rest),
    );
    const { snapshotText } = await import('../app/storage/snapshots');
    expect(await snapshotText('s1')).toBe('INT. HALL - DAY\n\nOld words.\n');
    expect(await db.handles.toArray()).toEqual(handles);
    expect(await db.settings.toArray()).toEqual(settings);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.cuts.count()).toBe(0);
    // The indexes are there and work: a draft of the old script is frozen and found.
    const { freezeDraft, listDrafts, draftsByPrefix } = await import('../app/drafts/store');
    const out = await freezeDraft('p1', projects[0]?.source as string, 'after the upgrade');
    expect(out.result).toBe('frozen');
    expect((await listDrafts('p1')).map((row) => row.n)).toEqual([1]);
    const id = out.result === 'frozen' ? out.row.id : '';
    expect(await draftsByPrefix(id.slice(0, 8))).toHaveLength(1);
  });

  test('a database already at version 2 opens as it is', async () => {
    vi.resetModules();
    await deleteDrafter();
    {
      const { db } = await import('../app/storage/db');
      const { createProject } = await import('../app/storage/projects');
      const { freezeDraft } = await import('../app/drafts/store');
      const p = await createProject({ source: 'x' });
      await freezeDraft(p.id, 'x', '');
      db.close();
    }
    vi.resetModules();
    const { db } = await import('../app/storage/db');
    await db.open();
    expect(await db.drafts.count()).toBe(1);
    expect(await db.projects.count()).toBe(1);
  });
});
