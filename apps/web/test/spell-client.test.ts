import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSpellClient, SPELL_DEBOUNCE_MS, type SpellState } from '../app/spell/spell-client';
import type { SpellRequest } from '../app/workers/spell-compute';

/** A worker that records what it was sent and lets a test send replies. */
function fakeWorker() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const posted: SpellRequest[] = [];
  return {
    posted,
    terminated: false,
    dead: false,
    postMessage(message: SpellRequest) {
      if (this.dead) throw new Error('The worker is gone.');
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

const input = (source: string) => ({
  source,
  kind: 'fountain' as const,
  notes: false,
  mine: [] as string[],
});
const checks = (worker: ReturnType<typeof fakeWorker>) =>
  worker.posted.filter((p) => p.type === 'check');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSpellClient', () => {
  test('sends once after 300 ms of quiet', () => {
    const worker = fakeWorker();
    const client = createSpellClient(
      worker,
      () => {},
      () => {},
    );
    expect(SPELL_DEBOUNCE_MS).toBe(300);
    client.check(input('a'));
    vi.advanceTimersByTime(200);
    client.check(input('ab'));
    vi.advanceTimersByTime(200);
    client.check(input('abc'));
    expect(checks(worker)).toHaveLength(0);
    vi.advanceTimersByTime(299);
    expect(checks(worker)).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(checks(worker).map((p) => p.type === 'check' && p.source)).toEqual(['abc']);
  });

  test('with no delay, sends at once (the caller has taken the pause)', () => {
    const worker = fakeWorker();
    const client = createSpellClient(
      worker,
      () => {},
      () => {},
      0,
    );
    const seq = client.check(input('now'));
    expect(checks(worker)).toEqual([{ type: 'check', seq, ...input('now') }]);
  });

  test('ignores a reply older than the newest request', () => {
    const worker = fakeWorker();
    const onMarks = vi.fn();
    const client = createSpellClient(worker, onMarks, () => {});
    const first = client.check(input('one'));
    vi.advanceTimersByTime(SPELL_DEBOUNCE_MS);
    const second = client.check(input('two'));
    expect(second).toBeGreaterThan(first);
    // The first check's reply comes back while the second is waiting for its pause: it is for text
    // that has been typed over.
    worker.reply({ type: 'checked', seq: first, marks: [{ from: 0, to: 3, word: 'one' }] });
    expect(onMarks).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SPELL_DEBOUNCE_MS);
    worker.reply({ type: 'checked', seq: second, marks: [] });
    expect(onMarks).toHaveBeenCalledWith([], second);
  });

  test('reports loading, ready, and failed', () => {
    const worker = fakeWorker();
    const states: SpellState[] = [];
    const client = createSpellClient(
      worker,
      () => {},
      (state) => states.push(state),
    );
    client.language('en-GB');
    expect(worker.posted).toEqual([{ type: 'language', language: 'en-GB' }]);
    expect(states).toEqual(['loading']);
    worker.reply({ type: 'ready', language: 'en-GB' });
    expect(states).toEqual(['loading', 'ready']);
    client.language('en-US');
    worker.reply({ type: 'failed', message: 'offline' });
    expect(states).toEqual(['loading', 'ready', 'loading', 'failed']);
    // A check that comes back means the dictionary is there after all.
    const seq = client.check(input('x'));
    vi.advanceTimersByTime(SPELL_DEBOUNCE_MS);
    worker.reply({ type: 'checked', seq, marks: [] });
    expect(states.at(-1)).toBe('ready');
  });

  test('suggests at once, and a failed worker answers with none', async () => {
    const worker = fakeWorker();
    const client = createSpellClient(
      worker,
      () => {},
      () => {},
    );
    const asked = client.suggest('phnoe');
    const request = worker.posted.at(-1);
    expect(request).toMatchObject({ type: 'suggest', word: 'phnoe' });
    worker.reply({
      type: 'suggestions',
      seq: request?.type === 'suggest' ? request.seq : 0,
      word: 'phnoe',
      suggestions: ['phone'],
    });
    expect(await asked).toEqual(['phone']);
    const pending = client.suggest('wuold');
    worker.fail('error');
    expect(await pending).toEqual([]);
  });

  test('a dead worker is failed, not thrown', async () => {
    const worker = fakeWorker();
    const states: SpellState[] = [];
    const client = createSpellClient(
      worker,
      () => {},
      (state) => states.push(state),
    );
    worker.fail('error');
    expect(states).toEqual(['failed']);
    // Posting to a worker that is gone doesn't throw either.
    worker.dead = true;
    expect(() => client.language('en-US')).not.toThrow();
    client.check(input('x'));
    expect(() => vi.advanceTimersByTime(SPELL_DEBOUNCE_MS)).not.toThrow();
    expect(await client.suggest('x')).toEqual([]);
    expect(states.at(-1)).toBe('failed');
    client.destroy();
    expect(worker.terminated).toBe(true);
    // Nothing is reported after destroy.
    const count = states.length;
    worker.fail('messageerror');
    worker.reply({ type: 'ready', language: 'en-US' });
    expect(states).toHaveLength(count);
  });
});
