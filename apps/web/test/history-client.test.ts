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

const deleted = { kind: 'deleted', projectId: 'p1', now: '' } as const;

describe('the history client', () => {
  test('makes the worker on first request and ends it when the last view releases', () => {
    const { workers, clients } = setup();
    const one = clients.use();
    const two = clients.use();
    expect(workers).toHaveLength(0);
    one.request(deleted, () => undefined);
    two.request(deleted, () => undefined);
    expect(workers).toHaveLength(1);
    one.release();
    expect(workers[0]?.ended).toBe(false);
    two.release();
    expect(workers[0]?.ended).toBe(true);
    // A view opened later gets a new worker.
    clients.use().request(deleted, () => undefined);
    expect(workers).toHaveLength(2);
  });

  test("a place request is answered once, and leaves the deleted scan's listener alone", () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const scan: HistoryReply[] = [];
    const placed: HistoryReply[] = [];
    const n = view.request(deleted, (r) => scan.push(r));
    const p = view.request(
      { kind: 'place', projectId: 'p1', now: '', snapshot: 's1', slot: 0 },
      (r) => placed.push(r),
    );
    const worker = workers[0] as FakeWorker;
    worker.reply({ seq: p, kind: 'place', place: null });
    worker.reply({ seq: p, kind: 'place', place: null });
    worker.reply({ seq: n, kind: 'deleted', scenes: [], done: true });
    expect(placed).toHaveLength(1);
    expect(scan).toHaveLength(1);
  });

  test('each request hears only its own replies, until it is done', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: HistoryReply[] = [];
    const first = view.request(deleted, (r) => heard.push(r));
    const second = view.request(
      { kind: 'versions', projectId: 'p1', now: '', scene: { from: 0, to: 1 } },
      () => undefined,
    );
    expect(second).toBeGreaterThan(first);
    const worker = workers[0] as FakeWorker;
    expect(worker.posted).toEqual([
      { seq: first, ...deleted },
      { seq: second, kind: 'versions', projectId: 'p1', now: '', scene: { from: 0, to: 1 } },
    ]);
    worker.reply({ seq: second, kind: 'versions', rows: [], done: false });
    worker.reply({ seq: first, kind: 'deleted', scenes: [], done: true });
    worker.reply({ seq: first, kind: 'deleted', scenes: [], done: true });
    expect(heard).toEqual([{ seq: first, kind: 'deleted', scenes: [], done: true }]);
  });

  test('a newer request of a kind replaces the older, as the worker stops it', () => {
    const { workers, clients } = setup();
    const view = clients.use();
    const heard: number[] = [];
    const older = view.request(deleted, (r) => heard.push(r.seq));
    const newer = view.request(deleted, (r) => heard.push(r.seq));
    const worker = workers[0] as FakeWorker;
    worker.reply({ seq: older, kind: 'deleted', scenes: [], done: false });
    worker.reply({ seq: newer, kind: 'deleted', scenes: [], done: true });
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
    const gone = leave.request(deleted, () => undefined);
    leave.release();
    const worker = workers[0] as FakeWorker;
    expect(worker.posted.at(-1)).toEqual({ seq: gone, kind: 'cancel' });
    expect(worker.posted.some((m) => m.kind === 'cancel' && m.seq === kept)).toBe(false);
  });

  test('a worker that fails answers each request with an error', () => {
    const { workers, clients } = setup();
    const heard: HistoryReply[] = [];
    const seq = clients.use().request(deleted, (r) => heard.push(r));
    workers[0]?.dispatchEvent(new Event('error'));
    expect(heard).toEqual([{ seq, kind: 'error', message: 'The history worker stopped.' }]);
  });

  test('a browser that can’t make the worker answers with an error', async () => {
    const clients = createHistoryClients(() => {
      throw new Error('blocked');
    });
    const heard: HistoryReply[] = [];
    const seq = clients.use().request(deleted, (r) => heard.push(r));
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
