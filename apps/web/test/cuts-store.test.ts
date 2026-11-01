import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as store from '../app/cuts/store';
import { isPutBack, listCuts, markPutBack, recordCuts } from '../app/cuts/store';
import { DAY_MS } from '../app/snapshots/retention';
import { db } from '../app/storage/db';
import { hashText } from '../app/storage/hash';
import { createProject, removeProject } from '../app/storage/projects';
import { takeSnapshot, thinSnapshots } from '../app/storage/snapshots';

// Cuts in the browser's storage (drafts-and-cuts design §3, §5): one entry per text, with every
// date and draft it was cut in, never thinned, with no Delete, and gone only with the script.

const NOW = new Date(2026, 10, 1, 12, 0, 0).getTime();
const HALL = 'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.';
const cut = (text: string, title = 'INT. HALL - DAY') => ({
  title,
  text,
  where: { after: 'INT. KITCHEN - DAY', before: null, within: null, ordinal: 2 },
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('cuts in storage', () => {
  test('the same text cut twice is one entry with both dates and drafts', async () => {
    const { id } = await createProject({ source: '' });
    await recordCuts(id, 'fountain', [cut(HALL)], 2, NOW);
    await recordCuts(id, 'fountain', [cut(HALL)], 4, NOW + DAY_MS);
    // The same date and draft again is still one date.
    await recordCuts(id, 'fountain', [cut(HALL)], 4, NOW + DAY_MS);
    const rows = await listCuts(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(await hashText(HALL));
    expect(rows[0]?.cuts).toEqual([
      { at: new Date(NOW).toISOString(), draft: 2 },
      { at: new Date(NOW + DAY_MS).toISOString(), draft: 4 },
    ]);
  });

  test('its text is kept with LF line breaks, so a CRLF copy is the same cut', async () => {
    const { id } = await createProject({ source: '' });
    await recordCuts(id, 'fountain', [cut(HALL.replace(/\n/g, '\r\n'))], 1, NOW);
    await recordCuts(id, 'fountain', [cut(HALL)], 1, NOW + 1000);
    const rows = await listCuts(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(HALL);
  });

  test('newest cut first, and "before drafts" is a null draft', async () => {
    const { id } = await createProject({ source: '' });
    await recordCuts(id, 'fountain', [cut('Old words, cut first.', 'Old')], null, NOW - DAY_MS);
    await recordCuts(id, 'fountain', [cut('New words, cut last.', 'New')], 3, NOW);
    expect((await listCuts(id)).map((r) => [r.title, r.cuts[0]?.draft])).toEqual([
      ['New', 3],
      ['Old', null],
    ]);
  });

  test('cuts found together are listed as they stood in the text', async () => {
    const { id } = await createProject({ source: '' });
    const found = ['Zebra words first.', 'Apple words second.', 'Mango words third.'];
    await recordCuts(
      id,
      'fountain',
      found.map((t) => cut(t, t)),
      1,
      NOW,
    );
    expect((await listCuts(id)).map((r) => r.title)).toEqual(found);
  });

  test('Put back marks a cut and keeps it listed', async () => {
    const { id } = await createProject({ source: '' });
    const [row] = await recordCuts(id, 'fountain', [cut(HALL)], 1, NOW);
    await markPutBack(id, row?.id as string, NOW + 1000);
    const [after] = await listCuts(id);
    expect(after?.putBack).toBe(new Date(NOW + 1000).toISOString());
    expect(after && isPutBack(after)).toBe(true);
    // Cut again later: no longer put back.
    await recordCuts(id, 'fountain', [cut(HALL)], 2, NOW + 2000);
    const [again] = await listCuts(id);
    expect(again && isPutBack(again)).toBe(false);
  });

  test('cuts survive thinning and have no delete', async () => {
    const { id } = await createProject({ source: '' });
    await recordCuts(id, 'fountain', [cut(HALL)], 1, NOW);
    for (let i = 0; i < 40; i++) {
      vi.setSystemTime(NOW + i * 60_000);
      await takeSnapshot(id, `INT. HALL - DAY\n\nTake ${i}.`, 'timed');
    }
    await thinSnapshots(id, NOW + 400 * DAY_MS);
    expect(await listCuts(id)).toHaveLength(1);
    expect(Object.keys(store).filter((name) => /delete|remove|clear/i.test(name))).toEqual([]);
  });

  test('they go with the script, and only with it', async () => {
    const one = await createProject({ source: '' });
    const two = await createProject({ source: '' });
    await recordCuts(one.id, 'fountain', [cut(HALL)], 1, NOW);
    await recordCuts(two.id, 'fountain', [cut(HALL)], 1, NOW);
    await db.settings.put({ key: `cuts-point:${one.id}`, value: { hash: 'x' } });
    await db.settings.put({ key: `cuts-backfill:${one.id}`, value: { done: true } });
    await removeProject(one.id);
    expect(await listCuts(one.id)).toEqual([]);
    expect(await db.settings.get(`cuts-point:${one.id}`)).toBeUndefined();
    expect(await db.settings.get(`cuts-backfill:${one.id}`)).toBeUndefined();
    expect(await listCuts(two.id)).toHaveLength(1);
  });

  test('a progress row is written with the cuts, in one transaction', async () => {
    const { id } = await createProject({ source: '' });
    await recordCuts(id, 'fountain', [cut(HALL)], null, NOW, {
      key: `cuts-backfill:${id}`,
      value: { upTo: NOW },
    });
    expect((await db.settings.get(`cuts-backfill:${id}`))?.value).toEqual({ upTo: NOW });
  });
});
