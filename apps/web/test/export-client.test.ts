import { builtins } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/** The export worker, as the client talks to it: a test sends its messages. */
class FakeWorker {
  static last: FakeWorker | undefined;
  listeners = new Map<string, Array<(event: unknown) => void>>();
  posted: unknown[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== listener),
    );
  }
  terminate() {}
  send(data: unknown) {
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

const request = { kind: 'pdf', source: 'A.', template: builtins['us-screenplay'] } as const;

describe('the export client', () => {
  test('passes on how far an export is, and answers with the file at the end', async () => {
    const { renderExport } = await import('../app/storage/export-client');
    const seen: Array<number | null> = [];
    let settled = false;
    const done = renderExport(request, (fraction) => seen.push(fraction)).then((reply) => {
      settled = true;
      return reply;
    });
    const worker = FakeWorker.last as FakeWorker;
    worker.send({ progress: null });
    worker.send({ progress: 0.4 });
    worker.send({ progress: 1 });
    await Promise.resolve();
    // Progress is not the reply.
    expect(settled).toBe(false);
    worker.send({ data: 'file' });
    expect(await done).toEqual({ data: 'file', missing: [] });
    expect(seen).toEqual([null, 0.4, 1]);
    // Nothing after the reply reaches this export.
    worker.send({ progress: 0.9 });
    expect(seen).toHaveLength(3);
  });

  test('an export asked without a progress callback still gets its file', async () => {
    const { renderExport } = await import('../app/storage/export-client');
    const done = renderExport(request);
    const worker = FakeWorker.last as FakeWorker;
    worker.send({ progress: 0.5 });
    worker.send({ data: 'file', missing: ['漢'] });
    expect(await done).toEqual({ data: 'file', missing: ['漢'] });
  });
});
