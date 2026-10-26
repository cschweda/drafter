import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMarkdownClient } from '../app/markdown/client';
import { computeMarkdown, type MarkdownRequest } from '../app/markdown/compute';
import { PREVIEW_DELAY_MS } from '../app/markdown/preview';

function fakeWorker() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const posted: MarkdownRequest[] = [];
  return {
    posted,
    terminated: false,
    postMessage(message: MarkdownRequest) {
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
    fail() {
      for (const listener of listeners.get('error') ?? []) listener({});
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('computeMarkdown', () => {
  test('answers with the tree, without positions, and the words', () => {
    const reply = computeMarkdown({ seq: 3, source: '# Title\n\nOne *two* three.\n' });
    expect(reply).toMatchObject({ seq: 3, words: 4 });
    expect(JSON.stringify(reply)).not.toContain('position');
    const tree = 'tree' in reply ? reply.tree : null;
    expect(tree?.children?.map((c) => c.type)).toEqual(['heading', 'paragraph']);
  });
});

describe('createMarkdownClient', () => {
  test('sends one request per pause in typing', () => {
    const worker = fakeWorker();
    const client = createMarkdownClient(
      worker,
      () => {},
      () => {},
    );
    client.request('a');
    client.request('ab');
    const last = client.request('abc');
    expect(worker.posted).toEqual([]);
    vi.advanceTimersByTime(PREVIEW_DELAY_MS);
    expect(worker.posted).toEqual([{ seq: last, source: 'abc' }]);
  });

  test('ignores an older reply after a newer one, and reports an error reply', () => {
    const worker = fakeWorker();
    const trees: Array<[number, number]> = [];
    const errors: string[] = [];
    const client = createMarkdownClient(
      worker,
      (_tree, words, seq) => trees.push([seq, words]),
      (message) => errors.push(message),
    );
    worker.reply({ seq: 2, tree: { type: 'root' }, words: 2 });
    worker.reply({ seq: 1, tree: { type: 'root' }, words: 1 });
    expect(trees).toEqual([[2, 2]]);
    worker.reply({ seq: 3, error: 'boom' });
    expect(errors).toEqual(['boom']);
    worker.fail();
    expect(errors).toHaveLength(2);
    client.destroy();
    worker.reply({ seq: 9, tree: { type: 'root' }, words: 9 });
    expect(trees).toHaveLength(1);
    expect(worker.terminated).toBe(true);
  });
});
