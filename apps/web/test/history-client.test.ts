import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createHistoryClients, sceneText } from '../app/history/client';
import type { HistoryReply, HistoryRequest } from '../app/history/protocol';
import { db } from '../app/storage/db';
import { gzip } from '../app/storage/gzip';

// The talk with the history worker (version-history design §3.4, Call 9): made on first use by a
// view, ended when the last view closes, each view hearing only its own requests' replies.

class FakeWorker extends EventTarget {
  posted: HistoryRequest[] = [];
  ended = false;
  postMessage(message: HistoryRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.ended = true;
  }
  reply(data: HistoryReply) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const clients = createHistoryClients(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, clients };
}

const versions = {
  kind: 'versions',
  projectId: 'p1',
  now: '',
  scene: { from: 0, to: 1 },
} as const;
const backfill = {
  kind: 'backfill',
  projectId: 'p1',
  docKind: 'fountain',
  since: 1,
  upTo: null,
  end: null,
} as const;

describe('the history client', () => {
  test('makes the worker on first request and ends it when the last view releases', () => {
    const { workers, clients } = setup();
    const one = clients.use();
    const two = clients.use();
    expect(workers).toHaveLength(0);
    one.request(versions, () => undefined);
    two.request(versions, () => undefined);
    expect(workers).toHaveLength(1);
    one.release();
    expect(workers[0]?.ended).toBe(false);
    two.release();
    expect(workers[0]?.ended).toBe(true);
    // A view opened later gets a new worker.
    clients.use().request(versions, () => undefined);
    expect(workers).toHaveLength(2);
  });

  test('two cuts questions at once are both answered: neither stops the other', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: number[] = [];
    const ask = { kind: 'cuts', before: 'a', after: 'b', docKind: 'fountain' } as const;
    const one = view.request(ask, (r) => heard.push(r.seq));
    const two = view.request(ask, (r) => heard.push(r.seq));
    const worker = workers[0] as FakeWorker;
    worker.reply({ seq: two, kind: 'cuts', cuts: [] });
    worker.reply({ seq: one, kind: 'cuts', cuts: [] });
    worker.reply({ seq: one, kind: 'cuts', cuts: [] });
    expect(heard).toEqual([two, one]);
  });

  test('a step of Draft by draft is answered once, beside a cuts question', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: number[] = [];
    const cuts = view.request({ kind: 'cuts', before: 'a', after: 'b', docKind: 'fountain' }, (r) =>
      heard.push(r.seq),
    );
    const step = view.request({ kind: 'step', before: 'a', after: 'b', docKind: 'markdown' }, (r) =>
      heard.push(r.seq),
    );
    const worker = workers[0] as FakeWorker;
    const counts = { words: 1, pages: null, added: 0, cut: 0, changed: 1, newShare: 1 };
    worker.reply({ seq: step, kind: 'step', counts });
    worker.reply({ seq: step, kind: 'step', counts });
    worker.reply({ seq: cuts, kind: 'cuts', cuts: [] });
    expect(heard).toEqual([step, cuts]);
  });

  test('a backfill streams its pairs until the last', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: HistoryReply[] = [];
    const n = view.request(
      { kind: 'backfill', projectId: 'p1', docKind: 'fountain', since: 1, upTo: null, end: null },
      (r) => heard.push(r),
    );
    const worker = workers[0] as FakeWorker;
    const pair = { seq: n, kind: 'backfill', at: 1, cuts: [], read: 1, total: 2 } as const;
    worker.reply({ ...pair, done: false });
    worker.reply({ ...pair, done: true });
    worker.reply({ ...pair, done: true });
    expect(heard).toHaveLength(2);
  });

  test('each request hears only its own replies, until it is done', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: HistoryReply[] = [];
    const first = view.request(versions, (r) => heard.push(r));
    const second = view.request(backfill, () => undefined);
    expect(second).toBeGreaterThan(first);
    const worker = workers[0] as FakeWorker;
    expect(worker.posted).toEqual([
      { seq: first, ...versions },
      { seq: second, ...backfill },
    ]);
    const pair = { seq: second, kind: 'backfill', at: 1, cuts: [], read: 1, total: 2 } as const;
    worker.reply({ ...pair, done: false });
    const done = { seq: first, kind: 'versions', rows: [], start: null, done: true } as const;
    worker.reply(done);
    worker.reply(done);
    expect(heard).toEqual([done]);
  });

  test('a newer request of a kind replaces the older, as the worker stops it', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: number[] = [];
    const older = view.request(versions, (r) => heard.push(r.seq));
    const newer = view.request(versions, (r) => heard.push(r.seq));
    const worker = workers[0] as FakeWorker;
    worker.reply({ seq: older, kind: 'versions', rows: [], start: null, done: false });
    worker.reply({ seq: newer, kind: 'versions', rows: [], start: null, done: true });
    expect(heard).toEqual([newer]);
  });

  test('release cancels what is still running', () => {
    const { workers, clients } = setup();
    const keep = clients.use();
    const leave = clients.use();
    const kept = keep.request(
      { kind: 'versions', projectId: 'p1', now: '', scene: { snapshot: 's1', slot: 0 } },
      () => undefined,
    );
    const gone = leave.request(backfill, () => undefined);
    leave.release();
    const worker = workers[0] as FakeWorker;
    expect(worker.posted.at(-1)).toEqual({ seq: gone, kind: 'cancel' });
    expect(worker.posted.some((m) => m.kind === 'cancel' && m.seq === kept)).toBe(false);
  });

  test('a worker that fails answers each request with an error', () => {
    const { workers, clients } = setup();
    const heard: HistoryReply[] = [];
    const seq = clients.use().request(versions, (r) => heard.push(r));
    workers[0]?.dispatchEvent(new Event('error'));
    expect(heard).toEqual([{ seq, kind: 'error', message: 'The history worker stopped.' }]);
  });

  test('a browser that can’t make the worker answers with an error', async () => {
    const clients = createHistoryClients(() => {
      throw new Error('blocked');
    });
    const heard: HistoryReply[] = [];
    const seq = clients.use().request(versions, (r) => heard.push(r));
    await Promise.resolve();
    expect(heard).toEqual([{ seq, kind: 'error', message: 'blocked' }]);
  });

  test('sceneText is one scene of a snapshot, or null when it can’t be read', async () => {
    const text =
      'Title: Wells\n\nINT. DRY WELL - DAY\n\nPell climbs down.\n\nEXT. RIM - DAY\n\nRain.\n';
    await db.snapshots.put({ id: 'w1', projectId: 'p1', createdAt: 1, gz: await gzip(text) });
    await db.snapshots.put({ id: 'w2', projectId: 'p1', createdAt: 2, gz: new Uint8Array([9, 9]) });
    const from = text.indexOf('INT.');
    const to = text.indexOf('down.') + 'down.'.length;
    expect(await sceneText('w1', { from, to })).toBe('INT. DRY WELL - DAY\n\nPell climbs down.');
    expect(await sceneText('w2', { from, to })).toBeNull();
    expect(await sceneText('gone', { from, to })).toBeNull();
    // A span past the text (the wrong snapshot) is no scene.
    expect(await sceneText('w1', { from, to: text.length + 5 })).toBeNull();
  });
});
