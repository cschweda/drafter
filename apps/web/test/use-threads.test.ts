import { history, redo, undo } from '@codemirror/commands';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import { setMarkdownMeta } from '@drafter/markdown';
import { novelStructure, readFacts } from '@drafter/novel';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShallowRef } from 'vue';

// The threads session (Threads plan, Task 5): the lanes of a script or a novel, held fresh while
// something shows them, and every edit one transaction and one undo step. The editor is a stand-in
// over a real EditorState with history and the facts-carrying filter, as use-novel.test.ts has it.

const env = vi.hoisted(() => ({
  view: null as unknown as {
    state: EditorState;
    dispatch(spec: TransactionSpec): void;
  },
  refs: {} as Record<'kind' | 'novel' | 'locked' | 'doc', ShallowRef<unknown>>,
  listeners: new Set<(changes: unknown) => void>(),
  goto: vi.fn(),
  carry: null as unknown as typeof import('../app/novel/carry'),
}));

vi.mock('../app/editor/session', () => ({
  useEditor: () => ({
    view: env.view,
    kind: env.refs.kind,
    novel: env.refs.novel,
    locked: env.refs.locked,
    doc: env.refs.doc,
    template: { value: builtins['us-screenplay'] as Template },
    goto: env.goto,
    onChange: (listener: (changes: unknown) => void) => {
      env.listeners.add(listener);
      return () => env.listeners.delete(listener);
    },
  }),
}));
vi.mock('../app/editor/layout', async () => {
  const { shallowRef } = await import('vue');
  return { useLayout: () => ({ layout: shallowRef(null), failed: shallowRef(false) }) };
});
vi.mock('../app/outline/notice', () => ({ sayOutline: vi.fn() }));

const SCRIPT = [
  'INT. HALL - DAY',
  '',
  'Ann waits.',
  '',
  '[[Thread: Heist]]',
  '',
  'EXT. YARD - NIGHT',
  '',
  'Rain.',
  '',
  'INT. VAULT - NIGHT',
  '',
  'Dust.',
  '',
].join('\n');

const BOOK = setMarkdownMeta(
  [
    '# The Salt Road',
    '',
    '## Low Tide',
    '',
    'The tide went out.',
    '',
    '## What the Sand Kept',
    '',
    'A bottle.',
    '',
  ].join('\n'),
  {
    template: 'novel',
    novel: {
      nodes: {
        'section:low-tide:0': { threads: ['Tide'] },
        'section:what-the-sand-kept:0': { threads: ['Tide', 'Bottle'] },
      },
    },
  },
);

function stand(text: string, kind: 'script' | 'markdown') {
  env.refs.kind.value = kind;
  env.refs.novel.value = kind === 'markdown';
  env.view = {
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        env.carry.carryNovelFacts({
          active: () => env.refs.kind.value === 'markdown',
          structure: novelStructure,
        }),
      ],
    }),
    dispatch(spec) {
      const tr = this.state.update(spec);
      this.state = tr.state;
      env.refs.doc.value = parse(this.state.doc.toString());
      for (const l of env.listeners) l(tr.changes);
    },
  };
  env.refs.doc.value = parse(text);
}

const unitId = (threads: { lanes: { value: { units: { id: string }[] } | null } }, n: number) =>
  threads.lanes.value?.units[n]?.id ?? '';
const text = () => env.view.state.doc.toString();
const cmd = (run: typeof undo) =>
  run({ state: env.view.state, dispatch: (tr) => env.view.dispatch(tr) });

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const { shallowRef } = await import('vue');
  env.refs = {
    kind: shallowRef('script'),
    novel: shallowRef(false),
    locked: shallowRef(false),
    doc: shallowRef(parse('')),
  };
  env.listeners.clear();
  env.goto.mockReset();
  env.carry = await import('../app/novel/carry');
});
afterEach(() => vi.useRealTimers());

async function session(text0: string, kind: 'script' | 'markdown' = 'script') {
  stand(text0, kind);
  const { useThreads } = await import('../app/threads/use-threads');
  const threads = useThreads();
  const release = threads.hold();
  return { threads, release };
}

describe('useThreads, for a script', () => {
  test('lanes are read at hold, and null for plain Markdown', async () => {
    const { threads } = await session(SCRIPT);
    expect(threads.noun.value).toBe('scene');
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Heist']);
    expect(threads.info.value.map((t) => [t.label, t.units])).toEqual([['Heist', 1]]);
    vi.resetModules();
    const plain = await session('# Notes\n\nText.\n', 'markdown');
    env.refs.novel.value = false;
    plain.release();
    plain.threads.hold();
    expect(plain.threads.lanes.value).toBeNull();
  });

  test('tagging a scene is one undo step, and the lanes follow after typing pauses', async () => {
    const { threads } = await session(SCRIPT);
    const yard = threads.lanes.value?.units[1];
    expect(yard?.heading).toContain('YARD');
    expect(threads.setUnitThreads((yard as { id: string }).id, ['Heist', 'Rain'])).toBe(true);
    expect(text()).toContain('[[Thread: Heist, Rain]]');
    vi.advanceTimersByTime(1000);
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Heist', 'Rain']);
    cmd(undo);
    expect(text()).toBe(SCRIPT);
    vi.advanceTimersByTime(1000);
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Heist']);
    cmd(redo);
    expect(text()).toContain('[[Thread: Heist, Rain]]');
  });

  test('nothing is computed while nothing holds it', async () => {
    const { threads, release } = await session(SCRIPT);
    release();
    const before = threads.lanes.value;
    env.view.dispatch({ changes: { from: 0, insert: 'x' } });
    vi.advanceTimersByTime(1000);
    expect(threads.lanes.value).toBe(before);
  });

  test('rename counts the scenes, one undo step; remove and setMeta too', async () => {
    const { threads } = await session(SCRIPT);
    const unit = (n: number) => unitId(threads, n);
    threads.setUnitThreads(unit(1), ['heist']);
    expect(threads.rename('Heist', 'Caper')).toEqual({ units: 2, merged: false });
    expect(text()).toContain('[[Thread: Caper]]');
    cmd(undo);
    expect(text()).toContain('[[Thread: Heist]]');
    expect(threads.setMeta('Heist', { name: 'The job', color: 'red' })).toBe(true);
    expect(text()).toContain('The job');
    cmd(undo);
    expect(text()).not.toContain('The job');
    expect(threads.remove('Heist')).toBe(2);
    expect(text()).not.toContain('Heist');
    cmd(undo);
    expect(text()).toContain('Heist');
  });

  test('a bad label changes nothing', async () => {
    const { threads } = await session(SCRIPT);
    const id = unitId(threads, 1);
    expect(threads.setUnitThreads(id, ['a\nb'])).toBe(false);
    expect(threads.rename('Heist', '')).toBeNull();
    expect(text()).toBe(SCRIPT);
  });

  test('locked: readOnly gives the outline’s reason and edits return false or null', async () => {
    const { threads } = await session(SCRIPT);
    expect(threads.readOnly()).toBeNull();
    env.refs.locked.value = true;
    expect(threads.readOnly()).toMatch(/another Drafter tab/);
    const id = unitId(threads, 1);
    expect(threads.setUnitThreads(id, ['Rain'])).toBe(false);
    expect(threads.rename('Heist', 'Caper')).toBeNull();
    expect(threads.remove('Heist')).toBeNull();
    expect(threads.setMeta('Heist', { name: 'x' })).toBe(false);
    expect(text()).toBe(SCRIPT);
  });

  test('go puts the cursor at the scene', async () => {
    const { threads } = await session(SCRIPT);
    threads.go(unitId(threads, 1));
    expect(env.goto).toHaveBeenCalledWith(SCRIPT.indexOf('EXT. YARD'));
  });
});

describe('useThreads, across a kind switch', () => {
  test('the novel hold follows the document kind, one at a time, and goes on release', async () => {
    const { threads, release } = await session(SCRIPT);
    const { useNovel } = await import('../app/novel/use-novel');
    const novel = useNovel();
    let open = 0;
    const real = novel.hold.bind(novel);
    vi.spyOn(novel, 'hold').mockImplementation(() => {
      open++;
      const drop = real();
      return () => {
        open--;
        drop();
      };
    });
    expect(open).toBe(0);
    // The same session becomes a novel.
    env.view.state = EditorState.create({ doc: BOOK });
    env.refs.kind.value = 'markdown';
    env.refs.novel.value = true;
    await Promise.resolve();
    expect(open).toBe(1);
    expect(threads.noun.value).toBe('passage');
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Tide', 'Bottle']);
    env.refs.novel.value = false;
    await Promise.resolve();
    expect(open).toBe(0);
    env.refs.novel.value = true;
    await Promise.resolve();
    expect(open).toBe(1);
    release();
    expect(open).toBe(0);
  });

  test('plain Markdown: setMeta is false, and remove of a bad label is null', async () => {
    const { threads } = await session('# Notes\n\nText.\n', 'markdown');
    env.refs.novel.value = false;
    await Promise.resolve();
    expect(threads.lanes.value).toBeNull();
    expect(threads.setMeta('Heist', { name: 'x' })).toBe(false);
    expect(threads.remove('a\nb')).toBeNull();
  });
});

describe('useThreads, for a novel', () => {
  test('lanes in words, with the novel’s noun and thread colors', async () => {
    const { threads } = await session(BOOK, 'markdown');
    expect(threads.noun.value).toBe('passage');
    expect(threads.lanes.value?.unit).toBe('words');
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Tide', 'Bottle']);
    expect(threads.info.value.map((t) => [t.label, t.units])).toEqual([
      ['Tide', 2],
      ['Bottle', 1],
    ]);
    expect(new Set(threads.info.value.map((t) => t.color)).size).toBe(2);
  });

  test('rename touches the facts, not the text, in one undo step', async () => {
    const { threads } = await session(BOOK, 'markdown');
    const before = text();
    expect(threads.rename('Tide', 'Sea')).toEqual({ units: 2, merged: false });
    expect(text().slice(0, text().indexOf('<!--'))).toBe(before.slice(0, before.indexOf('<!--')));
    expect(readFacts(text()).nodes['section:low-tide:0']?.threads).toEqual(['Sea']);
    vi.advanceTimersByTime(1000);
    expect(threads.lanes.value?.threads.map((t) => t.label)).toEqual(['Sea', 'Bottle']);
    cmd(undo);
    expect(text()).toBe(before);
  });

  test('tag, setMeta, remove are each one undo step', async () => {
    const { threads } = await session(BOOK, 'markdown');
    const before = text();
    const id = 'section:low-tide:0';
    expect(threads.setUnitThreads(id, ['Tide', 'Moon'])).toBe(true);
    expect(readFacts(text()).nodes[id]?.threads).toEqual(['Tide', 'Moon']);
    cmd(undo);
    expect(text()).toBe(before);
    expect(threads.setMeta('Tide', { name: 'The sea', color: 'blue' })).toBe(true);
    expect(readFacts(text()).threads).toBeDefined();
    cmd(undo);
    expect(text()).toBe(before);
    expect(threads.remove('Tide')).toBe(2);
    expect(readFacts(text()).nodes[id]?.threads).toBeUndefined();
    cmd(undo);
    expect(text()).toBe(before);
  });

  test('locked: the novel’s reason, and no edit', async () => {
    const { threads } = await session(BOOK, 'markdown');
    env.refs.locked.value = true;
    expect(threads.readOnly()).toBeTruthy();
    expect(threads.rename('Tide', 'Sea')).toBeNull();
    expect(threads.remove('Tide')).toBeNull();
    expect(threads.setUnitThreads('section:low-tide:0', ['Moon'])).toBe(false);
    expect(threads.setMeta('Tide', { name: 'x' })).toBe(false);
  });

  test('go goes to the passage', async () => {
    const { threads } = await session(BOOK, 'markdown');
    threads.go('section:low-tide:0');
    expect(env.goto).toHaveBeenCalledWith(BOOK.indexOf('## Low Tide'));
  });
});
