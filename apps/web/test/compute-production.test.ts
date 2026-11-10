import { metadataSpan, parse, type TextChange } from '@drafter/fountain';
import { applyMarks, type Layout, type Marks, paginate } from '@drafter/layout';
import {
  decodeBaseline,
  lock,
  lockedPagesOf,
  type Production,
  readProduction,
  scriptText,
} from '@drafter/production';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createLayoutClient,
  type LayoutProductionFacts,
  type LayoutReply,
  type LayoutRequest,
  PRODUCTION_WAIT_MS,
} from '../app/editor/layout-client';
import { computeLayout, createLayoutCompute } from '../app/workers/compute';

// A locked script in the layout worker (production design §6.2, §7.2): the request carries the
// production's facts (its id, and the facts themselves only when the id changes, as Show changes'
// baseline does); the worker answers the layout on its locked pages first, then the revision marks
// of that same text, with the same request number.

const template = builtins['us-screenplay'] as Template;

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

/** Paragraphs enough for several pages: each prints on one row, with a blank row after. */
const paragraphs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `Line ${from + i} of the hall.\n`).join('\n');

const UNLOCKED = `INT. HALL - DAY\n\n${paragraphs(1, 120)}`;

async function locked(): Promise<{
  text: string;
  production: Production;
  facts: LayoutProductionFacts;
}> {
  const text = apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
  );
  const production = readProduction(parse(text).meta) as Production;
  const baseline = (await decodeBaseline(production.baseline)) as string;
  return {
    text,
    production,
    facts: {
      baseline,
      pages: production.pages,
      closed: production.sets.slice(0, -1),
      open: production.sets.at(-1)?.name ?? '',
    },
  };
}

/** Runs one request through the worker's logic and returns every reply it makes, in order. */
async function answer(compute: ReturnType<typeof createLayoutCompute>, request: LayoutRequest) {
  const replies: LayoutReply[] = [];
  await compute.handle(request, (reply) => replies.push(reply));
  return replies;
}

const textOf = (line: Layout['pages'][number]['lines'][number]) =>
  line.runs.map((run) => run.text).join('');

describe('a locked script in the layout worker', () => {
  test('offsets into the script without its block are offsets into the whole text', async () => {
    const { text } = await locked();
    const span = metadataSpan(parse(text));
    expect(span).not.toBeNull();
    const script = scriptText(text);
    // The block is the last thing: everything before it is the same text at the same offsets,
    // and what follows it is only white space.
    expect(text.slice(0, span?.from)).toBe(script.slice(0, span?.from));
    expect(script.slice(span?.from).trim()).toBe('');
  });

  test('answers a locked request with labels, then marks', async () => {
    const { text, facts } = await locked();
    // Fifteen new paragraphs on page 2 push its end onto an A-page; every later page keeps its label.
    const at = text.indexOf('Line 40 of');
    const edited = `${text.slice(0, at)}${paragraphs(1000, 15)}\n${text.slice(at)}`;

    const compute = createLayoutCompute();
    const replies = await answer(compute, {
      seq: 3,
      source: edited,
      template,
      production: { id: 1, locked: facts },
    });
    expect(replies.map((r) => Object.keys(r).sort())).toEqual([
      ['layout', 'seq'],
      ['production', 'seq'],
    ]);
    expect(replies.map((r) => r.seq)).toEqual([3, 3]);
    const layout = (replies[0] as { layout: Layout }).layout;
    const labels = layout.pages.map((p) => p.label);
    expect(labels.slice(0, 4)).toEqual(['1', '2', '2A', '3']);
    expect(labels).toContain(String(facts.pages.length));
    // The layout comes unmarked; the marks come next, for the same text.
    expect(layout.pages.some((p) => p.lines.some((l) => l.mark))).toBe(false);

    const marks = (replies[1] as { production: Marks }).production;
    const marked = applyMarks(layout, marks);
    const lines = marked.pages.flatMap((p) => p.lines);
    const markedTexts = lines.filter((l) => l.mark).map(textOf);
    expect(markedTexts).toHaveLength(15);
    expect(markedTexts.every((t) => /^Line 10\d\d of the hall\.$/.test(t))).toBe(true);
    expect(lines.filter((l) => l.mark).every((l) => l.mark?.set === 'Blue')).toBe(true);
  });

  test('keeps the facts it was sent until another id comes', async () => {
    const { text, facts } = await locked();
    const compute = createLayoutCompute();
    await answer(compute, { seq: 1, source: text, template, production: { id: 1, locked: facts } });
    const edited = text.replace('Line 5 of the hall.', 'Line 5 of the great hall.');
    const again = await answer(compute, {
      seq: 2,
      source: edited,
      template,
      production: { id: 1 },
    });
    expect(again).toHaveLength(2);
    const marks = (again[1] as { production: Marks }).production;
    expect(marks.spans.map((s) => edited.slice(s.from, s.to))).toEqual(['great ']);
    // An id the worker has no facts for is laid out unlocked, and answered no marks, since the
    // client holds a locked request's layout until they come.
    const unknown = await answer(compute, {
      seq: 3,
      source: edited,
      template,
      production: { id: 9 },
    });
    expect(unknown).toEqual([
      { seq: 3, layout: paginate(parse(edited), template) },
      { seq: 3, production: { spans: [], gaps: [] } },
    ]);
  });

  test('a page whose text is all gone folds into the page before it: 3-4', async () => {
    const { text, facts } = await locked();
    // Cut every line of page 3, so its start falls on page 4's and page 4's label folds into it.
    const lines = text.split('\n');
    const three = facts.pages[2]?.line as number;
    const four = facts.pages[3]?.line as number;
    const edited = [...lines.slice(0, three), ...lines.slice(four)].join('\n');
    const compute = createLayoutCompute();
    const [reply] = await answer(compute, {
      seq: 1,
      source: edited,
      template,
      production: { id: 1, locked: facts },
    });
    const labels = (reply as { layout: Layout }).layout.pages.map((p) => p.label);
    expect(labels.slice(0, 4)).toEqual(['1', '2', '3-4', '5']);
  });

  test('makes no marks for a request a newer one has replaced', async () => {
    const { text, facts } = await locked();
    const revise = vi.fn(async () => ({ spans: [], gaps: [] }));
    const compute = createLayoutCompute(undefined, revise);
    const first: LayoutReply[] = [];
    const second: LayoutReply[] = [];
    // The second comes while the first's marks are still to be made, as typing sends them.
    const one = compute.handle(
      { seq: 1, source: text, template, production: { id: 1, locked: facts } },
      (r) => first.push(r),
    );
    const two = compute.handle(
      { seq: 2, source: `${text}\nMore.\n`, template, production: { id: 1 } },
      (r) => second.push(r),
    );
    await Promise.all([one, two]);
    expect(first.map((r) => Object.keys(r).sort())).toEqual([['layout', 'seq']]);
    expect(second.map((r) => Object.keys(r).sort())).toEqual([
      ['layout', 'seq'],
      ['production', 'seq'],
    ]);
    expect(revise).toHaveBeenCalledTimes(1);
  });

  test('a request without production is answered as before', async () => {
    const { text } = await locked();
    const compute = createLayoutCompute();
    const replies = await answer(compute, { seq: 1, source: text, template });
    expect(replies).toEqual([computeLayout({ seq: 1, source: text, template })]);
    expect(replies).toEqual([{ seq: 1, layout: paginate(parse(text), template) }]);
  });

  test('marks that fail answer no marks, so the pages are not left waiting', async () => {
    const { text, facts } = await locked();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const compute = createLayoutCompute(undefined, async () => {
      throw new Error('broken');
    });
    const replies = await answer(compute, {
      seq: 1,
      source: text,
      template,
      production: { id: 1, locked: facts },
    });
    expect((replies[1] as { production: Marks }).production).toEqual({ spans: [], gaps: [] });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('lockedPagesOf', () => {
  test('a dropped label folds into the kept page before it: 13 kept, 14 dropped prints 13-14', () => {
    const baseline = 'A\n\nB\n\nC\n\nD\n';
    const pages = [
      { label: '12', line: 0, printed: 0 },
      { label: '13', line: 2, printed: 0 },
      { label: '14', line: 4, printed: 0 },
      { label: '15', line: 6, printed: 0 },
    ];
    // B, page 13's first line, is cut: 13 starts on C, page 14's line, and 14 has nowhere left.
    const current = 'A\n\nC\n\nD\n';
    const locked = lockedPagesOf(pages, baseline, current);
    expect(locked.anchors.map((a) => a.label)).toEqual(['12', '13', '15']);
    expect(locked.folded).toEqual([{ into: '13', label: '14' }]);
    expect(paginate(parse(current), template, { locked }).pages.map((p) => p.label)).toEqual([
      '12',
      '13-14',
      '15',
    ]);
  });
});

describe("the layout client's production", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeWorker() {
    const listeners: Array<(event: unknown) => void> = [];
    const posted: LayoutRequest[] = [];
    return {
      posted,
      postMessage: (message: LayoutRequest) => posted.push(message),
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        if (type === 'message') listeners.push(listener);
      },
      terminate() {},
      reply: (data: unknown) => {
        for (const listener of listeners) listener({ data });
      },
    };
  }

  const facts: LayoutProductionFacts = { baseline: 'A\n', pages: [], closed: [], open: 'Blue' };

  const layout = (n: number) =>
    ({
      pages: [
        {
          number: 1,
          label: '1',
          lines: [
            { col: 0, runs: [], role: 'action', blockIndex: 0, span: { from: n, to: n + 5 } },
          ],
          sceneNumbersLeft: [],
          sceneNumbersRight: [],
        },
      ],
      index: [],
      diagnostics: [],
    }) as unknown as Layout;
  const blue: Marks = { spans: [{ from: 0, to: 100, set: 'Blue' }], gaps: [] };
  const isMarked = (l: Layout) => l.pages[0]?.lines[0]?.mark?.set === 'Blue';

  function clientOn(worker: ReturnType<typeof fakeWorker>) {
    const shown: Array<{ seq: number; marked: boolean }> = [];
    const marked: number[] = [];
    const client = createLayoutClient(
      worker,
      (l, seq) => shown.push({ seq, marked: isMarked(l) }),
      () => {},
      (_, seq) => marked.push(seq),
    );
    return { client, shown, marked };
  }

  test('sends the facts once per id', () => {
    const worker = fakeWorker();
    const { client } = clientOn(worker);
    client.request('a', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    client.request('ab', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    client.request('abc', template);
    vi.advanceTimersByTime(50);
    client.request('abcd', template, undefined, { id: 2, facts });
    vi.advanceTimersByTime(50);
    expect(worker.posted.map((p) => p.production)).toEqual([
      { id: 1, locked: facts },
      { id: 1 },
      undefined,
      { id: 2, locked: facts },
    ]);
  });

  test('a locked layout is shown once, already marked, with Show changes’ marks after it', () => {
    const worker = fakeWorker();
    const { client, shown, marked } = clientOn(worker);
    client.request('a', template, { id: 1, text: 'a' }, { id: 1, facts });
    vi.advanceTimersByTime(50);
    worker.reply({ seq: 1, layout: layout(0) });
    worker.reply({ seq: 1, marks: { lines: [], gaps: [], stops: [] } });
    // Nothing yet: the layout waits for its revision marks, and Show changes' with it.
    expect(shown).toEqual([]);
    expect(marked).toEqual([]);
    worker.reply({ seq: 1, production: blue });
    expect(shown).toEqual([{ seq: 1, marked: true }]);
    expect(marked).toEqual([1]);
    // A stray second answer changes nothing.
    worker.reply({ seq: 1, production: blue });
    expect(shown).toHaveLength(1);
  });

  test('a newer layout replaces the waiting one, and older marks are dropped', () => {
    const worker = fakeWorker();
    const { client, shown } = clientOn(worker);
    client.request('a', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    client.request('ab', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    worker.reply({ seq: 1, layout: layout(0) });
    worker.reply({ seq: 2, layout: layout(1) });
    worker.reply({ seq: 1, production: blue });
    expect(shown).toEqual([]);
    worker.reply({ seq: 2, production: blue });
    expect(shown).toEqual([{ seq: 2, marked: true }]);
  });

  test('an unlocked layout is shown at once, and replaces a waiting locked one', () => {
    const worker = fakeWorker();
    const { client, shown } = clientOn(worker);
    client.request('a', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    client.request('ab', template);
    vi.advanceTimersByTime(50);
    worker.reply({ seq: 1, layout: layout(0) });
    worker.reply({ seq: 2, layout: layout(1) });
    expect(shown).toEqual([{ seq: 2, marked: false }]);
    worker.reply({ seq: 1, production: blue });
    vi.advanceTimersByTime(PRODUCTION_WAIT_MS);
    expect(shown).toHaveLength(1);
  });

  test('marks that never come: the layout is shown without them after PRODUCTION_WAIT_MS', () => {
    const worker = fakeWorker();
    const { client, shown } = clientOn(worker);
    client.request('a', template, undefined, { id: 1, facts });
    vi.advanceTimersByTime(50);
    worker.reply({ seq: 1, layout: layout(0) });
    vi.advanceTimersByTime(PRODUCTION_WAIT_MS - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([{ seq: 1, marked: false }]);
    worker.reply({ seq: 1, production: blue });
    expect(shown).toHaveLength(1);
  });
});
