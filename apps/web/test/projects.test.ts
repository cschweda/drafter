import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '../app/storage/db';
import {
  createProject,
  getProject,
  getSavedText,
  listProjects,
  removeProject,
  setSavedText,
  updateProject,
} from '../app/storage/projects';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.useRealTimers());

const STAGE =
  'Title: The Crossing\n\nINT. HALL - DAY\n\nHi.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';

describe('projects', () => {
  test('creates, reads, updates, lists newest first, and removes a project', async () => {
    const a = await createProject({ source: 'Title: One\n\nINT. A - DAY\n' });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({
      title: 'One',
      templateId: 'us-screenplay',
      lineBreak: '\n',
      meta: null,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(await getProject(a.id)).toEqual(a);

    vi.setSystemTime(2_000);
    const b = await createProject({
      source: 'Title: Two\n',
      lineBreak: '\r\n',
      fileName: 'two.fountain',
    });
    expect(b).toMatchObject({ lineBreak: '\r\n', fileName: 'two.fountain' });
    expect((await listProjects()).map((p) => p.title)).toEqual(['Two', 'One']);

    vi.setSystemTime(3_000);
    await updateProject(a.id, { fileName: 'one.fountain' });
    expect(await getProject(a.id)).toMatchObject({
      fileName: 'one.fountain',
      updatedAt: 3_000,
      createdAt: 1_000,
    });
    expect((await listProjects()).map((p) => p.title)).toEqual(['One', 'Two']);

    await removeProject(a.id);
    expect(await getProject(a.id)).toBeUndefined();
    expect((await listProjects()).map((p) => p.title)).toEqual(['Two']);
  });

  test('derives the title and template from the source on update', async () => {
    const p = await createProject({ source: 'INT. A - DAY\n' });
    expect(p.title).toBe('Untitled');
    await updateProject(p.id, { source: STAGE });
    const after = await getProject(p.id);
    expect(after).toMatchObject({
      title: 'The Crossing',
      templateId: 'stage-play-standard',
      meta: { v: 1, template: 'stage-play-standard' },
      source: STAGE,
    });
    // The source wins over a patch that disagrees with it.
    await updateProject(p.id, {
      source: 'Title: Back\n',
      title: 'Wrong',
      templateId: 'stage-play-standard',
    });
    expect(await getProject(p.id)).toMatchObject({
      title: 'Back',
      templateId: 'us-screenplay',
      meta: null,
    });
    // A patch without a source leaves the derived fields alone.
    await updateProject(p.id, { title: 'Kept' });
    expect((await getProject(p.id))?.title).toBe('Kept');
  });

  test('an update to a project that is gone does nothing', async () => {
    await updateProject('missing', { source: 'x' });
    expect(await getProject('missing')).toBeUndefined();
    expect(await listProjects()).toEqual([]);
  });

  test('keeps the saved text apart from the recovery copy', async () => {
    const p = await createProject({ source: 'one' });
    expect(await getSavedText(p.id)).toBeUndefined();
    await setSavedText(p.id, 'saved');
    await updateProject(p.id, { source: 'edited' });
    expect(await getSavedText(p.id)).toBe('saved');
    await setSavedText(p.id, 'saved again');
    expect(await getSavedText(p.id)).toBe('saved again');
    expect(await db.snapshots.count()).toBe(1);
    expect((await getProject(p.id))?.source).toBe('edited');
  });

  test('removing a project removes its snapshot and handle', async () => {
    const keep = await createProject({ source: 'keep' });
    await setSavedText(keep.id, 'keep saved');
    await db.handles.put({ id: 'keep-handle', handle: {} as FileSystemFileHandle });

    const p = await createProject({ source: 'gone', fsHandleId: 'h1' });
    await db.handles.put({ id: 'h1', handle: {} as FileSystemFileHandle });
    await setSavedText(p.id, 'gone saved');
    await removeProject(p.id);

    expect(await getSavedText(p.id)).toBeUndefined();
    expect(await db.handles.get('h1')).toBeUndefined();
    expect(await db.snapshots.where('projectId').equals(p.id).count()).toBe(0);
    // Other projects' rows stay.
    expect(await getSavedText(keep.id)).toBe('keep saved');
    expect(await db.handles.get('keep-handle')).toBeDefined();
    // Removing it again is harmless.
    await removeProject(p.id);
  });

  test('keeps the file’s byte-order mark, with no index and no new version', async () => {
    const withBom = await createProject({ source: 'Title: One\n', bom: true });
    const without = await createProject({ source: 'Title: Two\n' });
    expect((await getProject(withBom.id))?.bom).toBe(true);
    expect((await getProject(without.id))?.bom).toBeUndefined();
    // An update that doesn't mention it leaves it, and one that does changes it.
    await updateProject(withBom.id, { source: 'Title: One!\n' });
    expect((await getProject(withBom.id))?.bom).toBe(true);
    await updateProject(withBom.id, { bom: false });
    expect((await getProject(withBom.id))?.bom).toBe(false);
    expect(db.verno).toBe(1);
    expect(db.table('projects').schema.idxByName.bom).toBeUndefined();
  });

  test('keeps the text a new script started from, with no index and no new version', async () => {
    const started = await createProject({
      source: 'Title: Untitled\n\n',
      baseline: 'Title: Untitled\n\n',
    });
    const plain = await createProject({ source: 'Title: Two\n' });
    expect((await getProject(started.id))?.baseline).toBe('Title: Untitled\n\n');
    expect((await getProject(plain.id))?.baseline).toBeUndefined();
    await updateProject(started.id, { source: 'Title: Untitled\n\nTyped.' });
    expect((await getProject(started.id))?.baseline).toBe('Title: Untitled\n\n');
    expect(db.verno).toBe(1);
    expect(db.table('projects').schema.idxByName.baseline).toBeUndefined();
  });

  test('has the whole version-1 schema', () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'handles',
      'projects',
      'settings',
      'snapshots',
      'templates',
    ]);
    expect(db.projects.schema.indexes.map((i) => i.name).sort()).toEqual(['title', 'updatedAt']);
    expect(db.snapshots.schema.indexes.map((i) => i.name).sort()).toEqual([
      'createdAt',
      'projectId',
    ]);
  });
});
