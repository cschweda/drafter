import type { Layout } from '@drafter/layout';
import { builtins } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createLayoutClient, type LayoutRequest } from '../app/editor/layout-client';
import { computeLayout } from '../app/workers/compute';

const template = builtins['us-screenplay'];
const layout = (marker: number) => ({ pages: [], index: [], diagnostics: [], marker }) as Layout;

/** A worker that records what it was sent and lets a test send replies. */
function fakeWorker() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const posted: LayoutRequest[] = [];
  return {
    posted,
    terminated: false,
    postMessage(message: LayoutRequest) {
      posted.push(message);
    },
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    terminate() {
      this.terminated = true;
    },
    reply(data: unknown) {
      for (const listener of listeners.get('message') ?? []) listener({ data });
    },
    fail(type: 'error' | 'messageerror') {
      for (const listener of listeners.get(type) ?? []) listener({});
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createLayoutClient', () => {
  test('sends one request per pause in typing', () => {
    const worker = fakeWorker();
    const client = createLayoutClient(worker, () => {});
    client.request('a', template);
    vi.advanceTimersByTime(20);
    client.request('ab', template);
    vi.advanceTimersByTime(20);
    client.request('abc', template);
    expect(worker.posted).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]?.source).toBe('abc');
    expect(worker.posted[0]?.template).toBe(template);
    // A later pause sends another.
    client.request('abcd', template);
    vi.advanceTimersByTime(50);
    expect(worker.posted.map((p) => p.source)).toEqual(['abc', 'abcd']);
  });

  test('drops a result older than the newest one shown', () => {
    const worker = fakeWorker();
    const shown: number[] = [];
    const client = createLayoutClient(worker, (l) =>
      shown.push((l as unknown as { marker: number }).marker),
    );
    client.request('one', template);
    vi.advanceTimersByTime(50);
    client.request('two', template);
    vi.advanceTimersByTime(50);
    const [first, second] = worker.posted;
    worker.reply({ seq: second?.seq, layout: layout(2) });
    worker.reply({ seq: first?.seq, layout: layout(1) });
    expect(shown).toEqual([2]);
  });

  test('reports an error without throwing', () => {
    const worker = fakeWorker();
    const onLayout = vi.fn();
    const onError = vi.fn();
    const client = createLayoutClient(worker, onLayout, onError);
    const seq = client.request('x', template);
    vi.advanceTimersByTime(50);
    expect(() => worker.reply({ seq, error: 'boom' })).not.toThrow();
    expect(onError).toHaveBeenCalledWith('boom', seq);
    expect(onLayout).not.toHaveBeenCalled();
    // Without a handler it is still no throw.
    const quiet = createLayoutClient(fakeWorker(), onLayout);
    expect(() => quiet.destroy()).not.toThrow();
  });

  test('reports a worker that fails to load', () => {
    const worker = fakeWorker();
    const onError = vi.fn();
    createLayoutClient(worker, () => {}, onError);
    worker.fail('error');
    expect(onError).toHaveBeenCalledOnce();
  });

  test('numbers each request, and a result is not shown after destroy', () => {
    const worker = fakeWorker();
    const onLayout = vi.fn();
    const client = createLayoutClient(worker, onLayout);
    const a = client.request('a', template);
    const b = client.request('b', template);
    expect(b).toBeGreaterThan(a);
    vi.advanceTimersByTime(50);
    client.destroy();
    expect(worker.terminated).toBe(true);
    worker.reply({ seq: b, layout: layout(1) });
    expect(onLayout).not.toHaveBeenCalled();
    // A request pending in the debounce is never sent.
    const other = fakeWorker();
    const c = createLayoutClient(other, onLayout);
    c.request('x', template);
    c.destroy();
    vi.advanceTimersByTime(100);
    expect(other.posted).toHaveLength(0);
  });
});

describe('computeLayout', () => {
  test('lays out the source it is sent', () => {
    const reply = computeLayout({ seq: 7, source: 'INT. HALL - DAY\n\nHello.\n', template });
    expect(reply.seq).toBe(7);
    expect('layout' in reply && reply.layout.pages.map((p) => p.number)).toEqual([1]);
  });

  test('answers a template it cannot lay out with an error, not a throw', () => {
    const proportional = {
      ...template,
      page: { ...template.page, font: { ...template.page.font, monospace: false } },
    };
    const reply = computeLayout({ seq: 8, source: 'Hi.\n', template: proportional });
    expect(reply).toMatchObject({ seq: 8, error: expect.stringContaining('proportional') });
  });
});
