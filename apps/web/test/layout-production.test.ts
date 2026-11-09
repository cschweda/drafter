import { type Doc, parse } from '@drafter/fountain';
import type { Layout, Marks } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type ShallowRef, shallowRef, watch } from 'vue';
import type { LayoutRequest } from '../app/editor/layout-client';
import type { ProductionState } from '../app/production/use-production';

// The Script pane's layout session with a locked script (production design §6.2): the layout of a
// locked request is published once, already marked, so no page is drawn twice and no watcher of
// the layout runs twice; an unlocked one is published at once, as before.

const TEXT = 'INT. HALL - DAY\n\nShe waits.\n';

const env = vi.hoisted(() => ({
  doc: null as unknown as ShallowRef<Doc>,
  production: null as unknown as ShallowRef<ProductionState | null>,
  workers: [] as Array<{
    posted: LayoutRequest[];
    reply: (data: unknown) => void;
  }>,
}));

vi.mock('../app/editor/session', () => ({
  useEditor: () => ({
    view: {
      state: {
        doc: { toString: () => env.doc.value.source },
        field: () => env.doc.value,
        selection: { main: { head: 0 } },
      },
    },
    doc: env.doc,
    template: shallowRef(builtins['us-screenplay'] as Template),
    kind: shallowRef('fountain'),
    onState: () => () => {},
  }),
}));
vi.mock('../app/production/use-production', () => ({
  useProduction: () => ({ state: env.production }),
}));

class FakeWorker {
  posted: LayoutRequest[] = [];
  listeners: Array<(event: unknown) => void> = [];
  constructor() {
    env.workers.push({
      posted: this.posted,
      reply: (data) => {
        for (const listener of this.listeners) listener({ data });
      },
    });
  }
  postMessage(message: LayoutRequest) {
    this.posted.push(message);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (type === 'message') this.listeners.push(listener);
  }
  terminate() {}
}

const pageOf = (from: number) =>
  ({
    pages: [
      {
        number: 1,
        label: '1',
        lines: [{ col: 0, runs: [], role: 'action', blockIndex: 0, span: { from, to: from + 5 } }],
        sceneNumbersLeft: [],
        sceneNumbersRight: [],
      },
    ],
    index: [{ page: 1, line: 0 }],
    diagnostics: [],
  }) as unknown as Layout;
const blue: Marks = { spans: [{ from: 0, to: 100, set: 'Blue' }], gaps: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
  env.workers.length = 0;
  env.doc = shallowRef(parse(TEXT));
  env.production = shallowRef(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function session() {
  const { useLayout } = await import('../app/editor/layout');
  const s = useLayout();
  const sets: Layout[] = [];
  watch(
    s.layout,
    (next) => {
      if (next) sets.push(next);
    },
    { flush: 'sync' },
  );
  return { s, sets, worker: env.workers[0] as (typeof env.workers)[number] };
}

describe('the layout session with a locked script', () => {
  test('a locked request sets the layout exactly once, already marked', async () => {
    env.production.value = {
      lockedAt: '2026-11-09',
      firstScene: 1,
      numbers: [],
      pages: [],
      sets: [{ name: 'Blue', color: '#8fb4e8', date: '2026-11-09', draft: 'd' }],
      baseline: 'x',
      baselineText: TEXT,
    };
    const { s, sets, worker } = await session();
    vi.advanceTimersByTime(50);
    const seq = worker.posted[0]?.seq as number;
    expect(worker.posted[0]?.production?.locked?.open).toBe('Blue');
    worker.reply({ seq, layout: pageOf(0) });
    expect(sets).toHaveLength(0);
    worker.reply({ seq, production: blue });
    expect(sets).toHaveLength(1);
    expect(sets[0]?.pages[0]?.lines[0]?.mark).toEqual({ set: 'Blue' });
    expect(s.shownSeq.value).toBe(seq);
    expect(s.updating.value).toBe(false);
  });

  test('an unlocked request sets the layout once, at once', async () => {
    const { sets, worker } = await session();
    vi.advanceTimersByTime(50);
    const seq = worker.posted[0]?.seq as number;
    expect(worker.posted[0]?.production).toBeUndefined();
    worker.reply({ seq, layout: pageOf(0) });
    expect(sets).toHaveLength(1);
    expect(sets[0]?.pages[0]?.lines[0]?.mark).toBeUndefined();
  });
});
