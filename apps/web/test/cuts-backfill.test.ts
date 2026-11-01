import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type BackfillDeps,
  CUTS_SINCE_KEY,
  runBackfill,
  storageBackfill,
} from '../app/cuts/backfill';
import { createCutRecorder } from '../app/cuts/recorder';
import { listCuts } from '../app/cuts/store';
import { storageDeps } from '../app/cuts/use-recorder';
import type { HistoryReply } from '../app/history/protocol';
import { db } from '../app/storage/db';
import { gzip } from '../app/storage/gzip';
import { createProject } from '../app/storage/projects';
import { foundCuts } from '../app/workers/cuts-compute';
import { createHistoryCompute, dexieSource } from '../app/workers/history-compute';

// The first-run backfill (drafts-and-cuts design §3.1, Call 18): old snapshots' cuts become cuts
// "before drafts", once, in the history worker, resumable, and the page never blocks writing them.

/** A text `findCuts` throws on, standing for any comparison that fails. */
const THROWS = 'FINDCUTS-THROWS-HERE';
vi.mock('@drafter/history', async (actual) => {
  const real = await actual<typeof import('@drafter/history')>();
  return {
    ...real,
    findCuts: (before: string, after: string, kind: 'fountain' | 'markdown') => {
      if (after.includes(THROWS)) throw new Error('findCuts failed');
      return real.findCuts(before, after, kind);
    },
  };
});

const scene = (heading: string, body: string) => `${heading}\n\n${body}\n`;
const HALL = scene(
  'INT. HALL - DAY',
  'Marra waits by the door, turning the brass key over in her hands.',
);
const CELLAR = scene(
  'INT. CELLAR - NIGHT',
  'A lamp swings from a hook and the shelves of jars tilt with it as Osken counts them.',
);
const YARD = scene(
  'EXT. COAL YARD - DAWN',
  'Two carts wait under a tarpaulin, their wheels chocked.',
);
const ROOF = scene(
  'EXT. ROOF - NIGHT',
  'Wind drags the washing lines across the wet slates of the roof.',
);
const PIER = scene(
  'EXT. PIER - DUSK',
  'Gulls quarrel over a crate of fish that nobody will claim tonight.',
);
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime();
const HOUR = 3_600_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function seed(projectId: string, texts: string[]) {
  for (const [i, text] of texts.entries())
    await db.snapshots.put({
      id: `s${i}`,
      projectId,
      createdAt: T0 + i * HOUR,
      gz: await gzip(text),
      reason: 'timed',
    });
}

/** The backfill with the real worker logic run in this thread; `stopAfter` pairs, then it stops. */
function deps(stopAfter = Number.POSITIVE_INFINITY): BackfillDeps {
  const compute = createHistoryCompute(dexieSource(), null);
  return {
    ...storageBackfill(),
    run(request, on) {
      let pairs = 0;
      void compute.handle({ ...request, seq: 1 }, (reply: HistoryReply) => {
        if (reply.kind === 'backfill' && !reply.done) pairs++;
        // Past `stopAfter`, the tab closed: nothing more is heard, and nothing more is written.
        if (pairs <= stopAfter) on(reply);
      });
    },
  };
}

describe('the backfill', () => {
  test('old snapshots’ deleted scenes become cuts before drafts', async () => {
    const { id } = await createProject({ source: script(HALL) });
    await seed(id, [script(HALL, CELLAR, YARD), script(HALL, YARD), script(HALL, YARD, ROOF)]);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    await runBackfill(deps());
    const rows = await listCuts(id);
    // CELLAR left between the first two; YARD and ROOF between the newest and now.
    expect(rows.map((r) => r.title).sort()).toEqual([
      'EXT. COAL YARD - DAWN',
      'EXT. ROOF - NIGHT',
      'INT. CELLAR - NIGHT',
    ]);
    for (const row of rows) expect(row.cuts.map((c) => c.draft)).toEqual([null]);
    const cellar = rows.find((r) => r.title === 'INT. CELLAR - NIGHT');
    expect(cellar?.cuts[0]?.at).toBe(new Date(T0 + HOUR).toISOString());
    expect((await db.settings.get(`cuts-backfill:${id}`))?.value).toEqual({ done: true });
  });

  test('it runs once, and the recorder carries on where it ended', async () => {
    const { id } = await createProject({ source: script(HALL, YARD) });
    await seed(id, [script(HALL, CELLAR, YARD)]);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    await runBackfill(deps());
    await runBackfill(deps());
    expect((await listCuts(id)).map((r) => [r.title, r.cuts.length])).toEqual([
      ['INT. CELLAR - NIGHT', 1],
    ]);
    // The writer cuts another scene, and the next snapshot finds it, from the backfill's end.
    const recorder = createCutRecorder({
      ...storageDeps(),
      find: async (a, b, k) => foundCuts(a, b, k),
    });
    await recorder.kept(id, script(HALL), 'timed');
    expect((await listCuts(id)).map((r) => r.title).sort()).toEqual([
      'EXT. COAL YARD - DAWN',
      'INT. CELLAR - NIGHT',
    ]);
  });

  test('it resumes after an interruption, with no duplicates, and finishes', async () => {
    const { id } = await createProject({ source: script(PIER) });
    const texts = [
      script(HALL, CELLAR, YARD, ROOF, PIER),
      script(HALL, YARD, ROOF, PIER),
      script(YARD, ROOF, PIER),
      script(ROOF, PIER),
      script(PIER),
    ];
    await seed(id, texts);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    // Stopped after pair 3: no "done", and the progress is that pair's.
    await Promise.race([runBackfill(deps(3)), new Promise((r) => setTimeout(r, 300))]);
    expect((await db.settings.get(`cuts-backfill:${id}`))?.value).toEqual({ upTo: T0 + 3 * HOUR });
    expect((await listCuts(id)).map((r) => r.title).sort()).toEqual([
      'EXT. COAL YARD - DAWN',
      'INT. CELLAR - NIGHT',
      'INT. HALL - DAY',
    ]);
    await runBackfill(deps());
    const rows = await listCuts(id);
    expect(rows.map((r) => r.title).sort()).toEqual([
      'EXT. COAL YARD - DAWN',
      'EXT. ROOF - NIGHT',
      'INT. CELLAR - NIGHT',
      'INT. HALL - DAY',
    ]);
    for (const row of rows) expect(row.cuts).toHaveLength(1);
    expect((await db.settings.get(`cuts-backfill:${id}`))?.value).toEqual({ done: true });
  });

  test('snapshots taken since the first run are the recorder’s, not the backfill’s', async () => {
    const { id } = await createProject({ source: script(HALL) });
    await seed(id, [script(HALL, CELLAR), script(HALL)]);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + HOUR / 2 });
    await runBackfill(deps());
    // Only s0 is old: its pair is with the end (the script now), which lost CELLAR.
    expect((await listCuts(id)).map((r) => [r.title, r.cuts[0]?.at])).toEqual([
      ['INT. CELLAR - NIGHT', new Date(T0 + HOUR / 2).toISOString()],
    ]);
  });

  test('a script that fails is left as it was, the next goes on, and after 3 tries it is given up', async () => {
    const bad = await createProject({ source: script(HALL) });
    const good = await createProject({ source: script(HALL) });
    await seed(bad.id, [script(HALL, CELLAR), script(HALL)]);
    for (const [i, text] of [script(HALL, YARD), script(HALL)].entries())
      await db.snapshots.put({
        id: `g${i}`,
        projectId: good.id,
        createdAt: T0 + i * HOUR,
        gz: await gzip(text),
        reason: 'timed',
      });
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    const base = deps();
    const failing: BackfillDeps = {
      ...base,
      run(request, on) {
        if (request.projectId === bad.id) on({ seq: 1, kind: 'error', message: 'stopped' });
        else base.run(request, on);
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runBackfill(failing);
    expect((await db.settings.get(`cuts-backfill:${bad.id}`))?.value).toEqual({ tries: 1 });
    expect(await listCuts(bad.id)).toEqual([]);
    expect((await listCuts(good.id)).map((r) => r.title)).toEqual(['EXT. COAL YARD - DAWN']);
    await runBackfill(failing);
    await runBackfill(failing);
    expect((await db.settings.get(`cuts-backfill:${bad.id}`))?.value).toEqual({ tries: 3 });
    await runBackfill(failing);
    expect((await db.settings.get(`cuts-backfill:${bad.id}`))?.value).toEqual({
      done: true,
      gaveUp: true,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test('a comparison that throws stops the run without moving its progress on', async () => {
    const { id } = await createProject({ source: script(HALL) });
    // The third snapshot is one findCuts can't take (see the mock above).
    await seed(id, [script(HALL, CELLAR), script(HALL), `${script(YARD)}\n${THROWS}`]);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    await runBackfill(deps());
    const progress = (await db.settings.get(`cuts-backfill:${id}`))?.value as { upTo?: number };
    expect(progress).toEqual({ upTo: T0 + HOUR, tries: 1 });
  });

  test('resumed later, it still ends where the recorder took over, not at today’s text', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR, YARD) });
    await seed(id, [script(HALL, CELLAR, YARD, ROOF)]);
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 10 * HOUR });
    // The recorder took over at HALL CELLAR YARD, then recorded CELLAR itself.
    const recorder = createCutRecorder({
      ...storageDeps(),
      find: async (a, b, k) => foundCuts(a, b, k),
    });
    await recorder.kept(id, script(HALL, CELLAR, YARD), 'timed');
    await recorder.kept(id, script(HALL, YARD), 'timed');
    await runBackfill(deps());
    const rows = await listCuts(id);
    expect(rows.map((r) => [r.title, r.cuts.map((c) => c.draft)]).sort()).toEqual([
      ['EXT. ROOF - NIGHT', [null]],
      ['INT. CELLAR - NIGHT', [1]],
    ]);
  });

  test('1,000 snapshots, 300 scenes: the main thread never blocks for 50 ms', async () => {
    const { id } = await createProject({ source: '' });
    await db.settings.put({ key: CUTS_SINCE_KEY, value: T0 + 2000 * HOUR });
    const cut = (i: number) => ({
      title: `INT. ROOM ${i} - NIGHT`,
      text: `INT. ROOM ${i} - NIGHT\n\n${'Words of the scene that was cut, at some length. '.repeat(12)}${i}`,
      where: { after: `INT. ROOM ${i - 1} - NIGHT`, before: null, within: null, ordinal: i % 300 },
    });
    const longest: number[] = [];
    const base = storageBackfill();
    await runBackfill({
      ...base,
      run(_request, on) {
        // The worker's replies, as fast as it can send them: 1,000 pairs, each with a few cuts.
        for (let i = 1; i <= 1000; i++)
          on({
            seq: 1,
            kind: 'backfill',
            at: T0 + i * HOUR,
            cuts: i % 3 === 0 ? [cut(i), cut(i + 5000)] : [],
            read: i,
            total: 1000,
            done: i === 1000,
          });
      },
      async write(...args) {
        const started = performance.now();
        const done = base.write(...args);
        // The synchronous part of a write is what holds the main thread.
        longest.push(performance.now() - started);
        await done;
      },
    });
    expect(longest).toHaveLength(1000);
    expect(Math.max(...longest)).toBeLessThan(50);
    expect(await listCuts(id)).toHaveLength(666);
    expect((await db.settings.get(`cuts-backfill:${id}`))?.value).toEqual({ done: true });
  });
});
