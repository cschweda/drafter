import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DAY_MS } from '../app/snapshots/retention';
import { db } from '../app/storage/db';
import { gunzip } from '../app/storage/gzip';
import { hashText } from '../app/storage/hash';
import {
  createProject,
  getSavedText,
  removeProject,
  setSavedText,
  updateProject,
} from '../app/storage/projects';
import {
  deleteSnapshot,
  listSnapshots,
  setSnapshotLabel,
  snapshotText,
  takeSnapshot,
  thinSnapshots,
} from '../app/storage/snapshots';

const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const history = async (projectId: string) =>
  (await db.snapshots.where('projectId').equals(projectId).toArray()).filter(
    (row) => !row.id.startsWith('saved:'),
  );

describe('the snapshot store', () => {
  test('takes a snapshot, gzip-compressed, with its reason, hash, and words', async () => {
    const p = await createProject({ source: 'x' });
    const text = 'INT. HALL - DAY\n\nThree small words.\n';
    expect(await takeSnapshot(p.id, text, 'opened', { detail: 'hall.fountain' })).toBe('taken');
    const [row] = await history(p.id);
    expect(row).toMatchObject({
      projectId: p.id,
      createdAt: NOW,
      reason: 'opened',
      detail: 'hall.fountain',
      hash: await hashText(text),
      words: 7,
    });
    expect(row?.source).toBeUndefined();
    expect(row?.gz).toBeInstanceOf(Uint8Array);
    expect(await gunzip(row?.gz as Uint8Array)).toBe(text);
    expect(await snapshotText(row?.id ?? '')).toBe(text);
  });

  test('takes nothing when the text equals the newest', async () => {
    const p = await createProject({ source: 'x' });
    expect(await takeSnapshot(p.id, 'one', 'timed')).toBe('taken');
    vi.setSystemTime(NOW + 60_000);
    expect(await takeSnapshot(p.id, 'one', 'saved')).toBe('same');
    expect(await takeSnapshot(p.id, 'two', 'timed')).toBe('taken');
    vi.setSystemTime(NOW + 120_000);
    // Equal to an older one, but not the newest: taken.
    expect(await takeSnapshot(p.id, 'one', 'timed')).toBe('taken');
    expect(await history(p.id)).toHaveLength(3);
  });

  test('takes one snapshot when two takes of the same text race', async () => {
    const p = await createProject({ source: 'x' });
    const results = await Promise.all([
      takeSnapshot(p.id, 'same text', 'manual'),
      takeSnapshot(p.id, 'same text', 'timed'),
      takeSnapshot(p.id, 'same text', 'saved'),
    ]);
    expect(results.sort()).toEqual(['same', 'same', 'taken']);
    expect(await history(p.id)).toHaveLength(1);
  });

  test('stores plain text where CompressionStream is missing, and reads it back', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const p = await createProject({ source: 'x' });
    expect(await takeSnapshot(p.id, 'plain words', 'manual')).toBe('taken');
    const [row] = await history(p.id);
    expect(row?.gz).toBeUndefined();
    expect(row?.source).toBe('plain words');
    expect(await snapshotText(row?.id ?? '')).toBe('plain words');
    expect((await listSnapshots(p.id))[0]?.readable).toBe(true);
  });

  test('lists history rows newest first, never the saved row', async () => {
    const p = await createProject({ source: 'x' });
    const other = await createProject({ source: 'y' });
    await setSavedText(p.id, 'saved text');
    await takeSnapshot(p.id, 'first', 'opened', { detail: 'a.fountain' });
    vi.setSystemTime(NOW + 1_000);
    await takeSnapshot(p.id, 'second one', 'manual', { label: 'Draft 2' });
    await takeSnapshot(other.id, 'elsewhere', 'timed');
    const list = await listSnapshots(p.id);
    expect(list).toEqual([
      {
        id: expect.any(String),
        createdAt: NOW + 1_000,
        reason: 'manual',
        label: 'Draft 2',
        words: 2,
        readable: true,
      },
      {
        id: expect.any(String),
        createdAt: NOW,
        reason: 'opened',
        detail: 'a.fountain',
        words: 1,
        readable: true,
      },
    ]);
    expect(list.some((s) => s.id.startsWith('saved:'))).toBe(false);
  });

  test('takes the next snapshot after the newest when the clock stands still', async () => {
    const p = await createProject({ source: 'x' });
    await takeSnapshot(p.id, 'one', 'timed');
    await takeSnapshot(p.id, 'two', 'timed');
    const list = await listSnapshots(p.id);
    expect(list.map((s) => s.createdAt)).toEqual([NOW + 1, NOW]);
    expect(await snapshotText(list[0]?.id ?? '')).toBe('two');
  });

  test('lists a row that can’t be read', async () => {
    const p = await createProject({ source: 'x' });
    await db.snapshots.put({
      id: 'damaged',
      projectId: p.id,
      createdAt: NOW - 1_000,
      reason: 'timed',
      gz: new Uint8Array([31, 139, 8, 0, 9, 9, 9, 9]),
      words: 3,
    });
    await db.snapshots.put({
      id: 'empty',
      projectId: p.id,
      createdAt: NOW - 2_000,
      reason: 'timed',
    });
    let list = await listSnapshots(p.id);
    expect(list.find((s) => s.id === 'damaged')?.readable).toBe(true);
    expect(await snapshotText('damaged')).toBeNull();
    expect(list.find((s) => s.id === 'empty')?.readable).toBe(false);
    expect(await snapshotText('empty')).toBeNull();
    expect(await snapshotText('missing')).toBeNull();

    vi.stubGlobal('DecompressionStream', undefined);
    list = await listSnapshots(p.id);
    expect(list.find((s) => s.id === 'damaged')?.readable).toBe(false);
  });

  test('an old-shape saved row still reads, is never listed, and is never thinned', async () => {
    const p = await createProject({ source: 'x' });
    // Phase 1's row, exactly as it wrote it.
    await db.snapshots.put({
      id: `saved:${p.id}`,
      projectId: p.id,
      createdAt: NOW - 400 * DAY_MS,
      source: 'saved long ago',
      label: 'Saved',
    });
    expect(await getSavedText(p.id)).toBe('saved long ago');
    expect(await listSnapshots(p.id)).toEqual([]);
    await takeSnapshot(p.id, 'now', 'timed');
    await thinSnapshots(p.id, NOW + 400 * DAY_MS);
    expect(await getSavedText(p.id)).toBe('saved long ago');
    expect(await snapshotText(`saved:${p.id}`)).toBe('saved long ago');
  });

  test('labels, unlabels, and deletes', async () => {
    const p = await createProject({ source: 'x' });
    await takeSnapshot(p.id, 'one', 'timed');
    const [{ id } = { id: '' }] = await listSnapshots(p.id);
    await setSnapshotLabel(id, 'Table read');
    expect((await listSnapshots(p.id))[0]?.label).toBe('Table read');
    await setSnapshotLabel(id, '');
    expect((await listSnapshots(p.id))[0]).not.toHaveProperty('label');
    await setSnapshotLabel(id, 'Again');
    await setSnapshotLabel(id, null);
    expect((await db.snapshots.get(id))?.label).toBeUndefined();
    await deleteSnapshot(id);
    expect(await listSnapshots(p.id)).toEqual([]);
    // The saved row is not History's to change.
    await setSavedText(p.id, 'saved');
    await setSnapshotLabel(`saved:${p.id}`, 'Mine');
    await deleteSnapshot(`saved:${p.id}`);
    expect(await db.snapshots.get(`saved:${p.id}`)).toMatchObject({ label: 'Saved' });
  });

  test('a take racing the script’s removal leaves no row behind', async () => {
    const p = await createProject({ source: 'x' });
    // The take reads, hashes, and compresses before it writes; the removal lands in between.
    const [result] = await Promise.all([takeSnapshot(p.id, 'words', 'timed'), removeProject(p.id)]);
    expect(await db.snapshots.where('projectId').equals(p.id).count()).toBe(0);
    // Nothing to keep, which is no failure of storage.
    expect(result).toBe('same');
    // A script that was never there: nothing either.
    expect(await takeSnapshot('gone', 'words', 'timed')).toBe('same');
    expect(await db.snapshots.where('projectId').equals('gone').count()).toBe(0);
  });

  test('a failed write resolves ‘failed’ and never throws', async () => {
    const p = await createProject({ source: 'x' });
    vi.spyOn(db.snapshots, 'put').mockRejectedValue(new Error('IndexedDB is down'));
    await expect(takeSnapshot(p.id, 'words', 'timed')).resolves.toBe('failed');
    vi.restoreAllMocks();
    // The queue isn't stuck after a failure.
    await expect(takeSnapshot(p.id, 'words', 'timed')).resolves.toBe('taken');
  });

  test('thins and tries once more when storage is full', async () => {
    const p = await createProject({ source: 'x' });
    // An old snapshot thinning will delete.
    await db.snapshots.put({
      id: 'old',
      projectId: p.id,
      createdAt: NOW - 200 * DAY_MS,
      reason: 'timed',
      source: 'old',
      hash: await hashText('old'),
      words: 1,
    });
    await db.snapshots.put({
      id: 'older',
      projectId: p.id,
      createdAt: NOW - 201 * DAY_MS,
      reason: 'timed',
      source: 'older',
      hash: await hashText('older'),
      words: 1,
    });
    const full = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const put = db.snapshots.put.bind(db.snapshots);
    const spy = vi
      .spyOn(db.snapshots, 'put')
      .mockImplementationOnce(() => Promise.reject(full()) as never)
      .mockImplementation(put);
    expect(await takeSnapshot(p.id, 'new', 'timed')).toBe('taken');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await db.snapshots.get('older')).toBeUndefined();

    spy.mockReset();
    spy.mockImplementation(() => Promise.reject(full()) as never);
    expect(await takeSnapshot(p.id, 'newer', 'timed')).toBe('failed');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('thinning keeps the snapshot of the last save', async () => {
    const p = await createProject({ source: 'x' });
    vi.setSystemTime(NOW - 120 * DAY_MS);
    await updateProject(p.id, { savedHash: await hashText('as saved') });
    await takeSnapshot(p.id, 'as saved', 'saved');
    vi.setSystemTime(NOW - 110 * DAY_MS);
    await takeSnapshot(p.id, 'edited after', 'timed');
    vi.setSystemTime(NOW);
    // This take thins: the save's snapshot stays, and the one after it, unsaved, goes.
    await takeSnapshot(p.id, 'today', 'timed');
    await thinSnapshots(p.id, NOW + 400 * DAY_MS);
    const texts = await Promise.all((await listSnapshots(p.id)).map((s) => snapshotText(s.id)));
    expect(texts).toEqual(['today', 'as saved']);
  });
});
