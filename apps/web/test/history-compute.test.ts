import 'fake-indexeddb/auto';
import type { SceneVersion, VersionRow } from '@drafter/history';
import { beforeEach, describe, expect, test } from 'vitest';
import { cacheDb, cacheStore, clearProjectCache } from '../app/history/cache';
import {
  type HistoryReply,
  type HistoryRequest,
  MAX_SNAPSHOTS,
  STREAM_MS,
} from '../app/history/protocol';
import { db } from '../app/storage/db';
import { gzip } from '../app/storage/gzip';
import { createProject, removeProject } from '../app/storage/projects';
import {
  createHistoryCompute,
  dexieSource,
  type PrintStore,
  type SnapshotSource,
} from '../app/workers/history-compute';

// The history worker's logic (version-history design §3.4): newest first, lazily, cached, streamed,
// cancelled by a newer request, and never another script's scenes.

/** A scene of `words` invented words under `heading`, so each scene is clearly its own. */
function scene(heading: string, seed: string, words = 30): string {
  const body = Array.from(
    { length: words },
    (_, i) => `${seed}${String.fromCharCode(97 + (i % 26))}${i}`,
  );
  return `${heading}\n\n${body.slice(0, words / 2).join(' ')}.\n\n${body.slice(words / 2).join(' ')}.\n`;
}
const A = scene('INT. COPPER MILL - DAY', 'mil');
const B = scene('EXT. FERN BRIDGE - NIGHT', 'fer');
const C = scene('INT. LOW ATTIC - DAWN', 'att');
const D = scene('EXT. CHALK ROAD - DAY', 'cha');
const E = scene('INT. QUIET VAULT - NIGHT', 'vau');
/** A, a little longer: another version of it. */
const A2 = A.replace('mila0', 'mila0 mila0x');
const script = (...scenes: string[]) => `Title: Copper Mill\n\n${scenes.join('\n')}`;

const T0 = new Date(2026, 9, 30, 9, 0, 0).getTime();
const MIN = 60_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const cache = cacheDb();
  if (cache) await Promise.all(cache.tables.map((table) => table.clear()));
  // The scripts 'p1' and 'p2' exist, so a scan's prune keeps their rows.
  const made = await createProject({ source: '' });
  await db.projects.bulkPut([
    { ...made, id: 'p1' },
    { ...made, id: 'p2' },
  ]);
  await db.projects.delete(made.id);
});

/** A history snapshot row, gzip-compressed as the app keeps them. */
async function seed(projectId: string, id: string, at: number, text: string) {
  await db.snapshots.put({ id, projectId, createdAt: at, gz: await gzip(text), reason: 'timed' });
}

/** Runs one request to its end and returns every reply. */
async function run(
  compute: ReturnType<typeof createHistoryCompute>,
  request: HistoryRequest,
): Promise<HistoryReply[]> {
  const replies: HistoryReply[] = [];
  await compute.handle(request, (reply) => replies.push(reply));
  return replies;
}

/** A scan of the versions of scene A, which every `now` here has, by its span. */
const scan = (seq: number, projectId: string, now: string): HistoryRequest => {
  const from = now.indexOf('INT. COPPER MILL - DAY');
  return { seq, kind: 'versions', projectId, now, scene: { from, to: from + A.trimEnd().length } };
};
const versionReplies = (replies: HistoryReply[]) =>
  replies.filter((r): r is Extract<HistoryReply, { kind: 'versions' }> => r.kind === 'versions');
const last = <T>(list: readonly T[]): T => list[list.length - 1] as T;
/** The snapshots each row of the last list names, as `shape` in the versions test. */
const rowsShape = (replies: HistoryReply[]) =>
  last(versionReplies(replies)).rows.map((r) =>
    'gap' in r ? `gap ${r.snapshots}` : `${r.snapshots}`,
  );

/** The Dexie source, counting the rows it reads. */
function counted(source: SnapshotSource) {
  const reads: string[] = [];
  return {
    reads,
    source: {
      list: (projectId: string) => source.list(projectId),
      read: (id: string) => {
        reads.push(id);
        return source.read(id);
      },
    } satisfies SnapshotSource,
  };
}

/** A source of `count` snapshots held in memory, newest first. */
function memorySource(
  texts: readonly string[],
  options: { onRead?: (i: number) => void | Promise<void> } = {},
) {
  const reads: number[] = [];
  const source: SnapshotSource = {
    list: async () => texts.map((_, i) => ({ id: `m${i}`, at: T0 - i * MIN })),
    read: async (id) => {
      const i = Number(id.slice(1));
      reads.push(i);
      await options.onRead?.(i);
      return texts[i] ?? null;
    },
  };
  return { source, reads };
}

describe('a step of Draft by draft', () => {
  test('is counted in the worker and answered once', async () => {
    const replies = await run(createHistoryCompute(memorySource([]).source, null), {
      seq: 7,
      kind: 'step',
      before: script(A, B),
      after: script(A, C),
      docKind: 'fountain',
    });
    expect(replies).toEqual([
      { seq: 7, kind: 'step', counts: expect.objectContaining({ added: 1, cut: 1, changed: 0 }) },
    ]);
  });
});

describe('the history scan', () => {
  test('lists versions newest first as it reads', async () => {
    // Now: A and E. The newest snapshot had A as it is; the one before it a longer A; the oldest
    // no A at all.
    await seed('p1', 's1', T0, script(A, B, E));
    await seed('p1', 's2', T0 - MIN, script(A2, C, E));
    await seed('p1', 's3', T0 - 2 * MIN, script(D, E));
    let time = 0;
    const compute = createHistoryCompute(dexieSource(), cacheStore(), () => (time += STREAM_MS));
    const replies = await run(compute, scan(1, 'p1', script(A, E)));
    const lists = versionReplies(replies);
    // The first list came after the first snapshot: only s1.
    expect(lists[0]?.rows.map((r) => `${r.snapshots}`)).toEqual(['s1']);
    expect(lists[0]?.done).toBe(false);
    const final = last(lists);
    expect(final.done).toBe(true);
    expect(rowsShape(replies)).toEqual(['s1', 's2', 'gap s3']);
    const progress = replies.filter((r) => r.kind === 'progress');
    expect(last(progress)).toEqual({
      seq: 1,
      kind: 'progress',
      read: 3,
      total: 3,
      unreadable: 0,
      capped: false,
    });
  });

  test('reads each snapshot once, then from the cache', async () => {
    await seed('p1', 's1', T0, script(A, B));
    await seed('p1', 's2', T0 - MIN, script(A2, C));
    const now = script(A);
    const first = counted(dexieSource());
    const compute = createHistoryCompute(first.source, cacheStore());
    const cold = await run(compute, scan(1, 'p1', now));
    expect(first.reads.sort()).toEqual(['s1', 's2']);
    // Again in the same worker: nothing is read.
    const again = await run(compute, scan(2, 'p1', now));
    expect(first.reads).toHaveLength(2);
    // A new worker reads the cache, not the snapshots.
    const second = counted(dexieSource());
    const warm = await run(createHistoryCompute(second.source, cacheStore()), scan(3, 'p1', now));
    expect(second.reads).toEqual([]);
    expect(rowsShape(again)).toEqual(rowsShape(cold));
    expect(rowsShape(warm)).toEqual(rowsShape(cold));
    expect(rowsShape(cold)).toEqual(['s1', 's2']);
  });

  test('skips an unreadable snapshot and counts it', async () => {
    await seed('p1', 's1', T0, script(A, B));
    await db.snapshots.put({
      id: 's2',
      projectId: 'p1',
      createdAt: T0 - MIN,
      gz: new Uint8Array([1, 2, 3, 4, 5]),
      reason: 'timed',
    });
    await db.snapshots.put({ id: 's3', projectId: 'p1', createdAt: T0 - 2 * MIN, reason: 'timed' });
    await seed('p1', 's4', T0 - 3 * MIN, script(A, C));
    const replies = await run(
      createHistoryCompute(dexieSource(), cacheStore()),
      scan(1, 'p1', script(A)),
    );
    expect(last(replies.filter((r) => r.kind === 'progress'))).toMatchObject({
      read: 4,
      total: 4,
      unreadable: 2,
    });
    expect(last(versionReplies(replies)).done).toBe(true);
  });

  test('stops at 1,000 snapshots and says so', async () => {
    const texts = Array.from({ length: MAX_SNAPSHOTS + 5 }, (_, i) =>
      i === MAX_SNAPSHOTS + 2 ? script(A, B) : script(A),
    );
    const { source, reads } = memorySource(texts);
    const replies = await run(createHistoryCompute(source, null), scan(1, 'p1', script(A)));
    expect(reads).toHaveLength(MAX_SNAPSHOTS);
    expect(Math.max(...reads)).toBe(MAX_SNAPSHOTS - 1);
    expect(last(replies.filter((r) => r.kind === 'progress'))).toMatchObject({
      read: MAX_SNAPSHOTS,
      total: MAX_SNAPSHOTS,
      capped: true,
    });
    expect(last(versionReplies(replies)).done).toBe(true);
  });

  test('a newer request stops the older', async () => {
    const texts = Array.from({ length: 6 }, (_, i) => script(A, i % 2 ? B : C));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gated = false;
    // The older scan's read of its second snapshot waits until the newer request has come.
    const { source, reads } = memorySource(texts, {
      onRead: (i) => {
        if (i !== 1 || gated) return;
        gated = true;
        return gate;
      },
    });
    const compute = createHistoryCompute(source, null);
    const older: HistoryReply[] = [];
    const newer: HistoryReply[] = [];
    const first = compute.handle(scan(1, 'p1', script(A)), (r) => older.push(r));
    while (!gated) await new Promise((resolve) => setTimeout(resolve, 0));
    const second = compute.handle(scan(2, 'p1', script(A, B, C)), (r) => newer.push(r));
    release();
    await Promise.all([first, second]);
    expect(older.some((r) => r.kind === 'versions' && r.done)).toBe(false);
    expect(older.every((r) => r.seq === 1)).toBe(true);
    const done = last(versionReplies(newer));
    expect(done.done).toBe(true);
    // The older read nothing after the newer came, and nothing was read twice: the snapshot the
    // older was reading when it stopped is the newer's from memory.
    expect([...reads].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    // The older's one update was after its first snapshot.
    expect(older.map((r) => r.kind)).toEqual(['progress', 'versions']);
  });

  test('a cancel stops a scan', async () => {
    const texts = Array.from({ length: 4 }, () => script(A, B));
    let compute: ReturnType<typeof createHistoryCompute> | null = null;
    const { source, reads } = memorySource(texts, {
      onRead: (i) => {
        // A cancel names the request it stops.
        if (i === 1) void compute?.handle({ seq: 1, kind: 'cancel' }, () => undefined);
      },
    });
    compute = createHistoryCompute(source, null);
    const replies = await run(compute, scan(1, 'p1', script(A)));
    expect(reads).toEqual([0, 1]);
    expect(replies.some((r) => r.kind === 'versions' && r.done)).toBe(false);
  });

  test('never answers for another project', async () => {
    await seed('p1', 's1', T0, script(A, B));
    await seed('p2', 't1', T0 + MIN, script(A, C, D));
    const compute = createHistoryCompute(dexieSource(), cacheStore());
    // Another script's scan fills the cache first.
    await run(compute, scan(1, 'p2', script(A)));
    const replies = await run(compute, scan(2, 'p1', script(A)));
    expect(replies.every((r) => r.seq === 2)).toBe(true);
    expect(rowsShape(replies)).toEqual(['s1']);
    expect(last(replies.filter((r) => r.kind === 'progress'))).toMatchObject({ total: 1 });
    // A fresh worker, reading p1 from the cache, still sees only p1's.
    const warm = await run(
      createHistoryCompute(dexieSource(), cacheStore()),
      scan(3, 'p1', script(A)),
    );
    expect(rowsShape(warm)).toEqual(['s1']);
  });

  test('streams no more often than every 100 ms', async () => {
    const texts = Array.from({ length: 20 }, (_, i) => script(A, i % 3 ? B : C));
    let time = 0;
    // Each snapshot takes 30 ms on the fake clock.
    const { source } = memorySource(texts, {
      onRead: () => {
        time += 30;
      },
    });
    const posted: number[] = [];
    const compute = createHistoryCompute(source, null, () => time);
    const replies: HistoryReply[] = [];
    await compute.handle(scan(1, 'p1', script(A)), (r) => {
      replies.push(r);
      if (r.kind === 'versions' && !r.done) posted.push(time);
    });
    expect(posted.length).toBeGreaterThan(2);
    // The first comes with the first snapshot read.
    expect(posted[0]).toBe(30);
    for (let i = 1; i < posted.length; i++)
      expect((posted[i] as number) - (posted[i - 1] as number)).toBeGreaterThanOrEqual(STREAM_MS);
    // Each list comes with its progress, just before it.
    const kinds = replies.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'progress')).toHaveLength(
      kinds.filter((k) => k === 'versions').length,
    );
  });

  test('versions follow a scene by its span now or by a snapshot slot', async () => {
    const B2 = B.replace('fera0', 'fera0 fera0x');
    await seed('p1', 's1', T0, script(A, B2));
    await seed('p1', 's2', T0 - MIN, script(A, C));
    await seed('p1', 's3', T0 - 2 * MIN, script(A, B));
    const now = script(A, B2, E);
    const from = now.indexOf('EXT. FERN BRIDGE');
    const to = from + B2.trimEnd().length;
    const compute = createHistoryCompute(dexieSource(), cacheStore());
    const bySpan = await run(compute, {
      seq: 1,
      kind: 'versions',
      projectId: 'p1',
      now,
      scene: { from, to },
    });
    const rowsOf = (replies: HistoryReply[]) => {
      const lists = replies.filter(
        (r): r is Extract<HistoryReply, { kind: 'versions' }> => r.kind === 'versions',
      );
      const final = last(lists);
      expect(final.done).toBe(true);
      return final.rows;
    };
    const shape = (rows: VersionRow[]) =>
      rows.map((r) => ('gap' in r ? `gap ${r.snapshots}` : `${r.snapshots}`));
    expect(shape(rowsOf(bySpan))).toEqual(['s1', 'gap s2', 's3']);
    const [newest, , oldest] = rowsOf(bySpan) as [SceneVersion, VersionRow, SceneVersion];
    expect(newest.hash).not.toBe(oldest.hash);

    // The deleted C, from the slot it had in s2.
    const bySlot = await run(compute, {
      seq: 2,
      kind: 'versions',
      projectId: 'p1',
      now,
      scene: { snapshot: 's2', slot: 1 },
    });
    expect(shape(rowsOf(bySlot))).toEqual(['gap s1', 's2', 'gap s3']);

    // The reply names the version it followed: the scene now's, or the slot's.
    const startOf = (replies: HistoryReply[]) =>
      last(replies.filter((r) => r.kind === 'versions') as Array<{ start: string | null }>).start;
    // s1 holds B2 as it is now.
    expect(startOf(bySpan)).toBe(newest.hash);
    expect(startOf(bySlot)).toBe((rowsOf(bySlot)[1] as SceneVersion).hash);
    // A span that is no scene now: no start, and no rows.
    const nowhere = await run(compute, {
      seq: 3,
      kind: 'versions',
      projectId: 'p1',
      now: 'Just a line of action, no scene.',
      scene: { from: 0, to: 5 },
    });
    expect(startOf(nowhere)).toBe(null);
  });

  /** The cache's rows of a script. */
  const rowsOf = async (projectId: string) => {
    const cache = cacheDb() as NonNullable<ReturnType<typeof cacheDb>>;
    return {
      scenes: await cache.snapshotScenes.where('projectId').equals(projectId).primaryKeys(),
      prints: await cache.prints.where('projectId').equals(projectId).count(),
    };
  };

  /**
   * Scans `projectId` (four snapshots seeded) and cancels it while it reads the third, after
   * `before` (say, the script's removal).
   */
  async function cancelledScan(projectId: string, before?: () => Promise<void>) {
    for (let i = 0; i < 4; i++)
      await seed(projectId, `${projectId}-${i}`, T0 - i * MIN, script(A, i % 2 ? B : C));
    let compute: ReturnType<typeof createHistoryCompute> | null = null;
    const inner = dexieSource();
    const source: SnapshotSource = {
      list: (id) => inner.list(id),
      read: async (id) => {
        if (id === `${projectId}-2`) {
          await before?.();
          await compute?.handle({ seq: 1, kind: 'cancel' }, () => undefined);
        }
        return inner.read(id);
      },
    };
    compute = createHistoryCompute(source, cacheStore());
    const replies = await run(compute, scan(1, projectId, script(A)));
    expect(replies.some((r) => r.kind === 'versions' && r.done)).toBe(false);
    return compute;
  }

  test("a stopped scan's rows never reach the cache after the script is cleared", async () => {
    const a = await createProject({ source: script(A) });
    const b = await createProject({ source: script(A) });
    await seed(b.id, 'b-0', T0, script(A, D));
    const compute = await cancelledScan(a.id);
    await clearProjectCache(a.id);
    // Another script's scan, in the same worker, stores only its own.
    await run(compute, scan(2, b.id, script(A)));
    expect(await rowsOf(a.id)).toEqual({ scenes: [], prints: 0 });
    expect((await rowsOf(b.id)).scenes).toEqual(['b-0']);
  });

  test('scan A, cancel, removeProject(A), scan B: A has no rows', async () => {
    const a = await createProject({ source: script(A) });
    const b = await createProject({ source: script(A) });
    await seed(b.id, 'b-0', T0, script(A, D));
    const compute = await cancelledScan(a.id);
    await removeProject(a.id);
    await run(compute, scan(2, b.id, script(A)));
    expect(await rowsOf(a.id)).toEqual({ scenes: [], prints: 0 });
  });

  test('a script removed mid-scan has no rows once its stopped scan has stored', async () => {
    const a = await createProject({ source: script(A) });
    // No other scan follows: the stopped scan's own store is pruned.
    await cancelledScan(a.id, () => removeProject(a.id));
    expect(await rowsOf(a.id)).toEqual({ scenes: [], prints: 0 });
  });

  /**
   * A worker that has pruned once scans `a` (four snapshots held in memory, so its removal leaves
   * them readable), and the script is removed while the third is read: its rows are written after
   * `removeProject` cleared the cache. `stop` cancels the scan at the fourth, which reads nothing.
   */
  async function removedMidScan(stop: boolean) {
    const a = await createProject({ source: script(A) });
    const texts = [0, 1, 2, 3].map((i) => script(A, i % 2 ? B : C, i === 2 ? D : E));
    let compute: ReturnType<typeof createHistoryCompute> | null = null;
    const source: SnapshotSource = {
      list: async () => texts.map((_, i) => ({ id: `m${i}`, at: T0 - i * MIN })),
      read: async (id) => {
        const i = Number(id.slice(1));
        if (i === 2) await removeProject(a.id);
        if (i === 3 && stop) {
          await compute?.handle({ seq: 2, kind: 'cancel' }, () => undefined);
          return undefined;
        }
        return texts[i] ?? null;
      },
    };
    // Each step a stream's worth later: every snapshot read is written at once.
    let t = 0;
    compute = createHistoryCompute(source, cacheStore(), () => (t += STREAM_MS));
    // The worker's first scan, which prunes.
    await run(compute, scan(1, 'p1', script(A)));
    const replies = await run(compute, scan(2, a.id, script(A)));
    expect(replies.some((r) => r.kind === 'versions' && r.done)).toBe(!stop);
    return a.id;
  }

  test('a scan that writes after its script was removed, then finishes, leaves no rows', async () => {
    expect(await rowsOf(await removedMidScan(false))).toEqual({ scenes: [], prints: 0 });
  });

  test('a scan that writes after its script was removed, then is cancelled, leaves no rows', async () => {
    expect(await rowsOf(await removedMidScan(true))).toEqual({ scenes: [], prints: 0 });
  });

  test('a scan drops the rows of scripts that no longer exist', async () => {
    const b = await createProject({ source: script(A) });
    await seed(b.id, 'b-0', T0, script(A, D));
    // Rows left by a script removed while a worker was still writing for it.
    const { slots, prints } = (await import('@drafter/history')).scenePrints(script(A, B));
    await cacheStore()?.put('gone', [{ id: 'g-0', slots }], prints);
    await run(createHistoryCompute(dexieSource(), cacheStore()), scan(1, b.id, script(A)));
    expect(await rowsOf('gone')).toEqual({ scenes: [], prints: 0 });
    expect((await rowsOf(b.id)).scenes).toEqual(['b-0']);
  });

  test("two requests for one script never take another script's memory", async () => {
    const a = await createProject({ source: script(A) });
    const b = await createProject({ source: script(A) });
    await seed(a.id, 'a-0', T0, script(A, B));
    await seed(b.id, 'b-0', T0, script(A, C));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asked: string[] = [];
    const inner = cacheStore() as PrintStore;
    // The cache's first read for A waits until B's scan has started.
    const store: PrintStore = {
      ...inner,
      scenes: async (projectId) => {
        asked.push(projectId);
        if (projectId === a.id) await gate;
        return inner.scenes(projectId);
      },
    };
    const compute = createHistoryCompute(dexieSource(), store);
    const nowA = script(A, B);
    const first = compute.handle(scan(1, a.id, nowA), () => undefined);
    while (!asked.includes(a.id)) await new Promise((resolve) => setTimeout(resolve, 0));
    // B's scan stops A's, waiting on the cache, and takes the worker's memory for B.
    const second = compute.handle(scan(2, b.id, script(A)), () => undefined);
    while (!asked.includes(b.id)) await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second]);
    // A's later scan reads A's own snapshot, never B's.
    const versions = await run(compute, scan(3, a.id, nowA));
    expect(rowsShape(versions)).toEqual(['a-0']);
    expect((await rowsOf(b.id)).scenes).toEqual(['b-0']);
    expect((await rowsOf(a.id)).scenes).toEqual(['a-0']);
  });

  test("scans without a cache when it can't open, with the same results", async () => {
    await seed('p1', 's1', T0, script(A, B, E));
    await seed('p1', 's2', T0 - MIN, script(A, C, E));
    await seed('p1', 's3', T0 - 2 * MIN, script(D, E));
    const request: HistoryRequest = scan(1, 'p1', script(A, E));
    const finalOf = async (store: PrintStore | null) =>
      last(versionReplies(await run(createHistoryCompute(dexieSource(), store), request)));
    const failing: PrintStore = {
      scenes: () => Promise.reject(new Error('closed')),
      prints: () => Promise.reject(new Error('closed')),
      put: () => Promise.reject(new Error('closed')),
      sweep: () => Promise.reject(new Error('closed')),
      prune: () => Promise.reject(new Error('closed')),
    };
    const cached = await finalOf(cacheStore());
    expect(cached.rows.length).toBeGreaterThan(0);
    expect(await finalOf(null)).toEqual(cached);
    expect(await finalOf(failing)).toEqual(cached);
  });
});
