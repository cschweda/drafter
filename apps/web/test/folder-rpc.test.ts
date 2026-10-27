import { parse, toJSON } from '@drafter/fountain';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeContext } from '../../../modules/fake-context';
import { frameChannel } from '../app/modules/folder-channel';
import {
  type HostMessage,
  LIMITS,
  readFrameMessage,
  readParts,
} from '../app/modules/folder-protocol';
import { answerCall } from '../app/modules/folder-rpc';

// A folder module's calls, as they cross from its frame (docs/plans/2026-10-27-desktop-modules-folder.md §4).

describe('readFrameMessage', () => {
  test('takes the messages a frame sends', () => {
    expect(
      readFrameMessage({ drafter: 1, kind: 'call', id: 3, method: 'source', args: [] }),
    ).toEqual({
      drafter: 1,
      kind: 'call',
      id: 3,
      method: 'source',
      args: [],
    });
    expect(
      readFrameMessage({ drafter: 1, kind: 'call', id: 4, run: 2, method: 'notify', args: ['hi'] }),
    ).toMatchObject({ run: 2 });
    expect(readFrameMessage({ drafter: 1, kind: 'done', run: 2 })).toEqual({
      drafter: 1,
      kind: 'done',
      run: 2,
    });
    expect(readFrameMessage({ drafter: 1, kind: 'done', run: 2, error: 'no' })).toMatchObject({
      error: 'no',
    });
    expect(readFrameMessage({ drafter: 1, kind: 'failed', error: 'bad export' })).toMatchObject({
      kind: 'failed',
    });
    expect(readFrameMessage({ drafter: 1, kind: 'size', height: 120 })).toMatchObject({
      height: 120,
    });
    expect(readFrameMessage({ drafter: 1, kind: 'ready', parts: {} })).toMatchObject({
      kind: 'ready',
    });
  });

  test('ignores anything else', () => {
    for (const data of [
      null,
      'call',
      { kind: 'call', id: 1, method: 'source', args: [] },
      { drafter: 2, kind: 'call', id: 1, method: 'source', args: [] },
      { drafter: 1, kind: 'call', id: '1', method: 'source', args: [] },
      { drafter: 1, kind: 'call', id: 1, method: 7, args: [] },
      { drafter: 1, kind: 'call', id: 1, method: 'source', args: 'x' },
      { drafter: 1, kind: 'reply', id: 1, ok: true },
      { drafter: 1, kind: 'run', run: 1, what: 'action' },
      { drafter: 1, kind: 'done', run: 'x' },
      { drafter: 1, kind: 'size', height: Number.NaN },
    ]) {
      expect(readFrameMessage(data), JSON.stringify(data)).toBeNull();
    }
  });
});

describe('readParts', () => {
  test('takes what a module offers: a button, a tab, commands, settings', () => {
    expect(
      readParts({
        action: { label: 'Tidy' },
        tab: { id: 'tidy', label: 'Tidy' },
        commands: [{ id: 'trim', title: 'Tidy: remove spaces' }],
        settings: true,
      }),
    ).toEqual({
      action: { label: 'Tidy' },
      tab: { id: 'tidy', label: 'Tidy' },
      commands: [{ id: 'trim', title: 'Tidy: remove spaces' }],
      settings: true,
    });
    expect(readParts({})).toEqual({ commands: [], settings: false });
  });

  test('says what is wrong with parts that aren’t right', () => {
    const cases: [unknown, RegExp][] = [
      [null, /not an object/],
      [{ action: { label: '' } }, /action needs a label/],
      [{ action: { label: 'x'.repeat(81) } }, /action needs a label/],
      [{ tab: { id: 'Bad Id', label: 'T' } }, /tab needs an id/],
      [{ commands: 'trim' }, /commands must be a list/],
      [
        {
          commands: [
            { id: 'a', title: 'A' },
            { id: 'a', title: 'B' },
          ],
        },
        /twice/,
      ],
      [{ commands: [{ id: 'a b', title: 'A' }] }, /each command needs an id/],
      [
        { commands: Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, title: 'C' })) },
        /at most 50/,
      ],
    ];
    for (const [value, why] of cases) expect(readParts(value), JSON.stringify(value)).toMatch(why);
  });
});

describe('answerCall', () => {
  test('answers the read-only views, with the parse as plain data', async () => {
    const ctx = fakeContext({ source: 'INT. HOUSE - DAY\n\nHello.\n', cursor: 4 });
    expect(await answerCall(ctx, 'source', [])).toBe('INT. HOUSE - DAY\n\nHello.\n');
    expect(await answerCall(ctx, 'doc', [])).toEqual(toJSON(parse('INT. HOUSE - DAY\n\nHello.\n')));
    expect(await answerCall(ctx, 'cursor', [])).toBe(4);
    expect(await answerCall(ctx, 'kind', [])).toBe('fountain');
    expect(await answerCall(ctx, 'title', [])).toBe('The Call');
    expect(await answerCall(ctx, 'layoutFailed', [])).toBe(false);
    const layout = (await answerCall(ctx, 'layout', [])) as { pages: unknown[] };
    expect(layout.pages.length).toBeGreaterThan(0);
    // Everything it answers crosses postMessage.
    for (const method of ['doc', 'layout', 'template']) {
      const value = await answerCall(ctx, method, []);
      expect(() => structuredClone(value), method).not.toThrow();
    }
  });

  test('passes the changes and problems on, as copies of what was asked', async () => {
    const ctx = fakeContext({ source: 'Hello  \n' });
    expect(
      await answerCall(ctx, 'applyChanges', [[{ from: 5, to: 7, insert: '', extra: 1 }]]),
    ).toBe(true);
    expect(ctx.text).toBe('Hello\n');
    expect(ctx.calls.changes).toEqual([[{ from: 5, to: 7, insert: '' }]]);
    expect(
      await answerCall(ctx, 'setProblems', [
        [{ message: 'Spaces', from: 0, to: 1, severity: 'info' }],
      ]),
    ).toBe(true);
    expect(ctx.calls.problems).toEqual([[{ message: 'Spaces', from: 0, to: 1, severity: 'info' }]]);
    await answerCall(ctx, 'goto', [3]);
    await answerCall(ctx, 'openTab', []);
    await answerCall(ctx, 'notify', ['Done.']);
    expect(await answerCall(ctx, 'confirm', ['Remove?', { confirmLabel: 'Remove' }])).toBe(true);
    expect(ctx.calls).toMatchObject({ goto: [3], openedTab: 1, notices: ['Done.'] });
    expect(ctx.calls.confirms).toEqual([
      { message: 'Remove?', options: { confirmLabel: 'Remove' } },
    ]);
  });

  test('keeps the module’s storage, for values that are JSON', async () => {
    const ctx = fakeContext();
    await answerCall(ctx, 'storage.set', ['tabs', { on: true }]);
    expect(await answerCall(ctx, 'storage.get', ['tabs'])).toEqual({ on: true });
    await answerCall(ctx, 'storage.remove', ['tabs']);
    expect(await answerCall(ctx, 'storage.get', ['tabs'])).toBeUndefined();
  });

  test('refuses what isn’t a call it knows, or arguments of the wrong kind', async () => {
    const ctx = fakeContext();
    const cases: [string, unknown[], RegExp][] = [
      ['readFile', [], /Drafter has no “readFile”/],
      ['constructor', [], /Drafter has no “constructor”/],
      ['storage', [], /Drafter has no “storage”/],
      ['applyChanges', ['x'], /list of changes/],
      ['applyChanges', [[{ from: '1', to: 2, insert: '' }]], /list of changes/],
      [
        'applyChanges',
        [Array.from({ length: LIMITS.changes + 1 }, () => ({ from: 0, to: 0, insert: '' }))],
        /at most/,
      ],
      ['setProblems', [{}], /list of problems/],
      ['setProblems', [Array.from({ length: LIMITS.problems + 1 }, () => ({}))], /at most/],
      ['goto', ['3'], /a number/],
      ['notify', [42], /text/],
      ['notify', ['x'.repeat(LIMITS.text + 1)], /longer than/],
      ['confirm', ['x'.repeat(LIMITS.text + 1)], /longer than/],
      ['confirm', ['Sure?', { confirmLabel: 3 }], /labels/],
      ['storage.get', [''], /key/],
      ['storage.get', ['k'.repeat(LIMITS.key + 1)], /key/],
      ['storage.set', ['k', () => 1], /JSON/],
      ['storage.set', ['k', undefined], /JSON/],
      ['storage.set', ['k', 'x'.repeat(LIMITS.value + 1)], /larger than/],
    ];
    for (const [method, args, why] of cases) {
      await expect(answerCall(ctx, method, args), method).rejects.toThrow(why);
    }
  });

  test('passes the host’s own refusal on', async () => {
    const ctx = fakeContext({ source: 'Hi' });
    ctx.applyChanges = () => {
      throw new Error('A change lies outside the text.');
    };
    await expect(
      answerCall(ctx, 'applyChanges', [[{ from: 0, to: 9, insert: '' }]]),
    ).rejects.toThrow('A change lies outside the text.');
  });
});

describe('frameChannel', () => {
  const FRAME = { name: 'the frame' };
  let posted: HostMessage[];
  let ready: unknown[];
  let failed: string[];
  const make = (ctx = fakeContext()) =>
    frameChannel({
      name: 'Tidy',
      frame: () => FRAME,
      post: (message) => posted.push(message),
      context: () => ctx,
      onReady: (parts) => ready.push(parts),
      onFailed: (error) => failed.push(error),
    });
  const from = (data: unknown, source: unknown = FRAME, origin = 'null') => ({
    data,
    source,
    origin,
  });
  const call = (id: number, method: string, args: unknown[] = [], run?: number) =>
    from({ drafter: 1, kind: 'call', id, method, args, ...(run !== undefined && { run }) });
  const replies = () => posted.filter((m) => m.kind === 'reply');

  beforeEach(() => {
    posted = [];
    ready = [];
    failed = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test('answers a call from its own frame with its own module’s context', async () => {
    const channel = make(fakeContext({ source: 'Hello' }));
    channel.receive(call(1, 'source'));
    await vi.runAllTimersAsync();
    expect(replies()).toEqual([{ drafter: 1, kind: 'reply', id: 1, ok: true, value: 'Hello' }]);
    channel.receive(call(2, 'nope'));
    await vi.runAllTimersAsync();
    expect(replies()[1]).toMatchObject({ id: 2, ok: false, error: 'Drafter has no “nope”.' });
  });

  test('hears only its own frame, from an opaque origin', async () => {
    const channel = make();
    channel.receive(
      from({ drafter: 1, kind: 'call', id: 1, method: 'source', args: [] }, { other: true }),
    );
    channel.receive(
      from({ drafter: 1, kind: 'call', id: 2, method: 'source', args: [] }, FRAME, 'app://drafter'),
    );
    channel.receive(from({ drafter: 1, kind: 'call', id: 3, method: 'source', args: [] }, null));
    await vi.runAllTimersAsync();
    expect(posted).toEqual([]);
  });

  test('refuses a message over the size limit', async () => {
    const channel = make();
    channel.receive(call(1, 'notify', ['x'.repeat(LIMITS.message + 1)]));
    await vi.runAllTimersAsync();
    expect(replies()[0]).toMatchObject({
      id: 1,
      ok: false,
      error: expect.stringMatching(/larger than 4 MB/),
    });
  });

  test('refuses calls past the most that may wait at once', async () => {
    const ctx = fakeContext();
    // A question the writer hasn't answered keeps its call waiting.
    ctx.confirm = () => new Promise(() => {});
    const channel = make(ctx);
    for (let id = 1; id <= LIMITS.inFlight + 1; id++)
      channel.receive(call(id, 'confirm', ['Sure?']));
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()).toEqual([
      expect.objectContaining({
        id: LIMITS.inFlight + 1,
        ok: false,
        error: expect.stringMatching(/too many/),
      }),
    ]);
  });

  test('reports the module’s parts once it is ready, and a frame that never says so', async () => {
    const channel = make();
    channel.start();
    channel.receive(from({ drafter: 1, kind: 'ready', parts: { action: { label: 'Tidy' } } }));
    expect(ready).toEqual([{ action: { label: 'Tidy' }, commands: [], settings: false }]);
    await vi.advanceTimersByTimeAsync(LIMITS.startMs + 1);
    expect(failed).toEqual([]);

    const silent = make();
    silent.start();
    await vi.advanceTimersByTimeAsync(LIMITS.startMs + 1);
    expect(failed).toEqual(['it didn’t answer']);
  });

  test('reports a module that couldn’t load, or offered parts that aren’t right', () => {
    const channel = make();
    channel.receive(from({ drafter: 1, kind: 'failed', error: 'index.js has no default export' }));
    channel.receive(from({ drafter: 1, kind: 'ready', parts: { commands: 'x' } }));
    expect(failed).toEqual(['index.js has no default export', 'its commands must be a list']);
    expect(ready).toEqual([]);
  });

  test('runs a button with the run’s own context, and settles when the frame says it is done', async () => {
    const own = fakeContext({ source: 'own' });
    const run = fakeContext({ source: 'run' });
    const channel = make(own);
    channel.receive(from({ drafter: 1, kind: 'ready', parts: {} }));
    const done = channel.run('action', run);
    const sent = posted.find((m) => m.kind === 'run');
    expect(sent).toEqual({ drafter: 1, kind: 'run', run: 1, what: 'action' });
    channel.receive(call(1, 'source', [], 1));
    channel.receive(call(2, 'source'));
    await vi.advanceTimersByTimeAsync(0);
    expect(replies().map((r) => (r.kind === 'reply' && r.ok ? r.value : r))).toEqual([
      'run',
      'own',
    ]);
    channel.receive(from({ drafter: 1, kind: 'done', run: 1 }));
    await expect(done).resolves.toBeUndefined();
    // Once done, the run's context is gone.
    channel.receive(call(3, 'source', [], 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()[2]).toMatchObject({ id: 3, ok: false, error: 'That run has ended.' });
  });

  test('runs a command by its id, and passes a failure on', async () => {
    const channel = make();
    channel.receive(
      from({ drafter: 1, kind: 'ready', parts: { commands: [{ id: 'trim', title: 'Trim' }] } }),
    );
    const done = channel.run('command', fakeContext(), 'trim');
    expect(posted.at(-1)).toEqual({
      drafter: 1,
      kind: 'run',
      run: 1,
      what: 'command',
      command: 'trim',
    });
    channel.receive(from({ drafter: 1, kind: 'done', run: 1, error: 'Nothing to trim' }));
    await expect(done).rejects.toThrow('Nothing to trim');
  });

  test('refuses to run before the module is ready, and ends a run that takes too long', async () => {
    const channel = make();
    await expect(channel.run('action', fakeContext())).rejects.toThrow('it hasn’t started yet');
    channel.receive(from({ drafter: 1, kind: 'ready', parts: {} }));
    const done = channel.run('action', fakeContext());
    const settled = expect(done).rejects.toThrow('it took longer than 5 minutes');
    await vi.advanceTimersByTimeAsync(LIMITS.runMs + 1);
    await settled;
  });

  test('tells the frame when the script changes, and stops when it is gone', async () => {
    const channel = make();
    channel.changed();
    expect(posted).toEqual([{ drafter: 1, kind: 'changed' }]);
    channel.receive(from({ drafter: 1, kind: 'ready', parts: {} }));
    const done = channel.run('action', fakeContext());
    channel.dispose();
    await expect(done).rejects.toThrow('it was turned off');
    channel.changed();
    channel.receive(call(9, 'source'));
    await vi.advanceTimersByTimeAsync(0);
    expect(posted.filter((m) => m.kind !== 'run')).toEqual([{ drafter: 1, kind: 'changed' }]);
  });
});
