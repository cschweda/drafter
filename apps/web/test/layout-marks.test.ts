import { changesOf, markPages, type PageMarks } from '@drafter/compare';
import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createLayoutClient,
  type LayoutReply,
  type LayoutRequest,
} from '../app/editor/layout-client';
import { createLayoutCompute } from '../app/workers/compute';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Show changes' marks (version-history design §4.2, Call 17): the Script pane's layout request
// carries the baseline's id, and its text only when the id changed; the worker answers the layout
// first, then the marks of that same text against the baseline, with the same request number.

const template = builtins['us-screenplay'] as Template;

const BEFORE = 'INT. HALL - DAY\n\nShe waits by the door.\n\nThe phone rings.\n';
const AFTER = 'INT. HALL - DAY\n\nShe paces by the door.\n\nThe phone rings.\n\nA dog barks.\n';

/** Runs one request through the worker's logic and returns its replies, in order. */
function answer(compute: ReturnType<typeof createLayoutCompute>, request: LayoutRequest) {
  const replies: LayoutReply[] = [];
  compute.handle(request, (reply) => replies.push(reply));
  return replies;
}

function fakeWorker() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const posted: LayoutRequest[] = [];
  return {
    posted,
    postMessage(message: LayoutRequest) {
      posted.push(message);
    },
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    terminate() {},
    reply(data: unknown) {
      for (const listener of listeners.get('message') ?? []) listener({ data });
    },
  };
}

describe("Show changes' marks in the layout worker", () => {
  test('answers the layout, then marks with the same seq', () => {
    const compute = createLayoutCompute();
    const replies = answer(compute, {
      seq: 7,
      source: AFTER,
      template,
      baseline: { id: 1, text: BEFORE },
    });
    expect(replies.map((r) => Object.keys(r).sort())).toEqual([
      ['layout', 'seq'],
      ['marks', 'seq'],
    ]);
    expect(replies.map((r) => r.seq)).toEqual([7, 7]);
    const layout = (replies[0] as { layout: Layout }).layout;
    const marks = (replies[1] as { marks: PageMarks }).marks;
    // The marks are of the text laid out, against the baseline: never another keystroke's.
    expect(marks).toEqual(markPages(layout, changesOf(BEFORE, AFTER)));
    expect(marks.lines.map((m) => m.kind)).toEqual(['changed', 'added']);
  });

  test('no baseline, no marks reply', () => {
    const compute = createLayoutCompute();
    expect(answer(compute, { seq: 1, source: AFTER, template }).map((r) => Object.keys(r))).toEqual(
      [['seq', 'layout']],
    );
    // A baseline whose text the worker never had (it can't happen, but) answers no marks.
    const replies = answer(compute, { seq: 2, source: AFTER, template, baseline: { id: 9 } });
    expect(replies).toHaveLength(1);
  });

  test('keeps the baseline it was sent until another id comes', () => {
    const compute = createLayoutCompute();
    answer(compute, { seq: 1, source: AFTER, template, baseline: { id: 1, text: BEFORE } });
    // The next requests carry the id only.
    const again = answer(compute, {
      seq: 2,
      source: `${AFTER}\nRain.\n`,
      template,
      baseline: { id: 1 },
    });
    expect((again[1] as { marks: PageMarks }).marks.lines.length).toBe(3);
    // Against itself, nothing is marked.
    const same = answer(compute, {
      seq: 3,
      source: AFTER,
      template,
      baseline: { id: 2, text: AFTER },
    });
    expect((same[1] as { marks: PageMarks }).marks).toEqual({ lines: [], gaps: [], stops: [] });
  });

  test('a layout that fails answers its error and no marks', () => {
    const compute = createLayoutCompute();
    const broken = { ...template, page: null } as unknown as Template;
    const replies = answer(compute, {
      seq: 4,
      source: AFTER,
      template: broken,
      baseline: { id: 1, text: BEFORE },
    });
    expect(replies).toHaveLength(1);
    expect('error' in (replies[0] as object)).toBe(true);
  });
});

describe("the layout client's baseline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('sends the baseline text once per id', () => {
    const worker = fakeWorker();
    const client = createLayoutClient(worker, () => {});
    client.request('a', template, { id: 1, text: BEFORE });
    vi.advanceTimersByTime(50);
    client.request('ab', template, { id: 1, text: BEFORE });
    vi.advanceTimersByTime(50);
    client.request('abc', template, { id: 2, text: AFTER });
    vi.advanceTimersByTime(50);
    client.request('abcd', template);
    vi.advanceTimersByTime(50);
    client.request('abcde', template, { id: 2, text: AFTER });
    vi.advanceTimersByTime(50);
    expect(worker.posted.map((p) => p.baseline)).toEqual([
      { id: 1, text: BEFORE },
      { id: 1 },
      { id: 2, text: AFTER },
      undefined,
      { id: 2 },
    ]);
  });

  test("a debounced request sends the text when the sent one didn't", () => {
    const worker = fakeWorker();
    const client = createLayoutClient(worker, () => {});
    // Two calls within one pause: only the last is posted, and it carries the text.
    client.request('a', template, { id: 1, text: BEFORE });
    client.request('ab', template, { id: 1, text: BEFORE });
    vi.advanceTimersByTime(50);
    expect(worker.posted.map((p) => p.baseline)).toEqual([{ id: 1, text: BEFORE }]);
  });

  test('marks reach the caller only for the layout shown', () => {
    const worker = fakeWorker();
    const shown: number[] = [];
    const marked: number[] = [];
    const client = createLayoutClient(
      worker,
      (_, seq) => shown.push(seq),
      () => {},
      (_, seq) => marked.push(seq),
    );
    client.request('a', template, { id: 1, text: BEFORE });
    vi.advanceTimersByTime(50);
    const empty: PageMarks = { lines: [], gaps: [], stops: [] };
    const layout = { pages: [], index: [], diagnostics: [] } as unknown as Layout;
    worker.reply({ seq: 2, layout });
    // Marks of an older layout than the one shown are dropped; the shown one's come through.
    worker.reply({ seq: 1, marks: empty });
    worker.reply({ seq: 2, marks: empty });
    expect(shown).toEqual([2]);
    expect(marked).toEqual([2]);
  });
});

describe("Show changes' cost per layout", () => {
  /** A script of `scenes` scenes of invented words, and the same with every third line changed. */
  function scripts(scenes: number) {
    const lines: string[] = [];
    for (let s = 0; s < scenes; s++) {
      lines.push(`INT. VARROW ROOM ${s} - DAY`, '');
      for (let i = 0; i < 12; i++) lines.push(`Tolven ${s} marsk ${i} quenby orrel pask.`, '');
    }
    const before = lines.join('\n');
    const after = lines
      .map((line, i) => (i % 6 === 2 ? line.replace('marsk', 'brindle') : line))
      .join('\n');
    return { before, after };
  }

  test(
    'the diff and marks grow no faster than the script (n and 4n)',
    () => {
      const { small, large, growth } = scaling(
        (n) => {
          const { before, after } = scripts(n);
          return { before, after, layout: paginate(parse(after), template) };
        },
        ({ before, after, layout }) => markPages(layout, changesOf(before, after)),
        30,
      );
      console.log(
        `Show changes' diff and marks: ${small.toFixed(1)} ms for 30 scenes, ${large.toFixed(1)} ms for 120 (growth ${growth.toFixed(1)}).`,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
