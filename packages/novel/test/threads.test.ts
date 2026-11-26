import { setMarkdownMeta } from '@drafter/markdown';
import { describe, expect, it } from 'vitest';
import {
  carryFacts,
  type NovelFacts,
  novelStructure,
  readFacts,
  removeNovelThread,
  renameNovelThread,
  setNovelThreadMeta,
  setPassageThreads,
  writeFacts,
} from '../src';

const book = '# One\n\ntext\n\n# Two\n\nmore\n';
const empty = (): NovelFacts => ({ nodes: Object.create(null) });
const withNodes = (
  nodes: Record<string, { threads?: string[]; status?: 'todo' }>,
  threads?: NovelFacts['threads'],
): NovelFacts => {
  const f = empty();
  for (const [k, v] of Object.entries(nodes)) f.nodes[k] = v;
  if (threads) f.threads = threads;
  return f;
};

describe('threads in the book facts', () => {
  it('round-trip through the comment, cut to the limits', () => {
    const text = writeFacts(
      book,
      withNodes(
        { 'chapter:one:0': { threads: ['Maya', 'x'.repeat(50)] } },
        { maya: { color: 'teal' } },
      ),
    );
    const back = readFacts(text);
    expect(back.nodes['chapter:one:0']?.threads).toEqual(['Maya', 'x'.repeat(40)]);
    expect(back.threads).toEqual({ maya: { color: 'teal' } });
  });

  it('reading drops bad labels, dedupes by case, keeps 12', () => {
    const labels = ['A', 'a', 'b,c', '', ' ', 7, ...Array.from({ length: 20 }, (_, i) => `t${i}`)];
    const raw = setMarkdownMeta(book, { novel: { nodes: { n: { threads: labels } } } });
    const back = readFacts(raw);
    const got = back.nodes.n?.threads ?? [];
    expect(got.length).toBe(12);
    expect(got.slice(0, 3)).toEqual(['A', 't0', 't1']);
  });

  it('a node with only threads is kept; with none it is dropped', () => {
    const kept = readFacts(writeFacts(book, withNodes({ a: { threads: ['X'] } })));
    expect(kept.nodes.a).toEqual({ threads: ['X'] });
    const dropped = readFacts(writeFacts(book, withNodes({ a: { threads: [] } })));
    expect(Object.keys(dropped.nodes)).toEqual([]);
    expect(writeFacts(book, withNodes({ a: { threads: [] } }))).toBe(book);
  });

  it('writes novel.threads only when non-empty', () => {
    const text = writeFacts(book, withNodes({ a: { status: 'todo' } }, {}));
    expect(text).not.toContain('"threads"');
  });

  it('__proto__ as a node id or a thread key writes no prototype', () => {
    const f = empty();
    Object.defineProperty(f.nodes, '__proto__', {
      value: { threads: ['A'] },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const threads = Object.create(null);
    Object.defineProperty(threads, '__proto__', {
      value: { color: 'teal' },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    f.threads = threads;
    const back = readFacts(writeFacts(book, f));
    expect(Object.keys(back.nodes)).toEqual(['__proto__']);
    expect(Object.keys(back.threads ?? {})).toEqual(['__proto__']);
    expect(({} as { color?: string }).color).toBeUndefined();
    const set = setPassageThreads(empty(), '__proto__', ['A']);
    expect(Object.keys(set.nodes)).toEqual(['__proto__']);
    expect(({} as { threads?: unknown }).threads).toBeUndefined();
    const meta = setNovelThreadMeta(empty(), '__proto__', { color: 'teal' });
    expect(Object.keys(meta.threads ?? {})).toEqual(['__proto__']);
    expect(({} as { color?: string }).color).toBeUndefined();
  });

  it('a renamed chapter keeps its threads, and the book keeps its thread names', () => {
    const before = novelStructure(book);
    const edited = book.replace('# Two', '# Twoo');
    const after = novelStructure(edited);
    const facts = withNodes(
      { [(before.nodes[1] as { id: string }).id]: { threads: ['Maya'] } },
      { maya: { name: 'Maya' } },
    );
    const out = carryFacts(facts, before, after, (p) => (p > book.indexOf('# Two') ? p + 1 : p));
    expect(out.nodes[(after.nodes[1] as { id: string }).id]?.threads).toEqual(['Maya']);
    expect(out.threads).toEqual(facts.threads);
  });
});

describe('editing a novel’s threads', () => {
  const base = () =>
    withNodes(
      { a: { threads: ['Maya', 'Heist'] }, b: { threads: ['maya'] }, c: { status: 'todo' } },
      { maya: { color: 'teal', name: 'M' }, heist: { color: 'red' } },
    );

  it('setPassageThreads validates, dedupes, limits and is pure', () => {
    const f = base();
    const out = setPassageThreads(f, 'c', ['X', 'x', 'Y']);
    expect(out.nodes.c).toEqual({ status: 'todo', threads: ['X', 'Y'] });
    expect(f.nodes.c).toEqual({ status: 'todo' });
    expect(() => setPassageThreads(f, 'c', ['a,b'])).toThrow(RangeError);
    expect(() =>
      setPassageThreads(
        f,
        'c',
        Array.from({ length: 13 }, (_, i) => `t${i}`),
      ),
    ).toThrow(RangeError);
    expect(setPassageThreads(f, 'b', []).nodes.b).toBeUndefined();
    expect(setPassageThreads(f, 'c', []).nodes.c).toEqual({ status: 'todo' });
  });

  it('rename merges onto an existing label, keeping the target meta', () => {
    const r = renameNovelThread(base(), 'Maya', 'Heist');
    expect(r.merged).toBe(true);
    expect(r.passages).toBe(2);
    expect(r.facts.nodes.a?.threads).toEqual(['Heist']);
    expect(r.facts.nodes.b?.threads).toEqual(['Heist']);
    expect(r.facts.threads).toEqual({ heist: { color: 'red' } });
  });

  it('rename moves meta; A to a is a rename', () => {
    const r = renameNovelThread(base(), 'Maya', 'Mia');
    expect(r.merged).toBe(false);
    expect(r.facts.threads).toEqual({ mia: { color: 'teal', name: 'M' }, heist: { color: 'red' } });
    const c = renameNovelThread(base(), 'Maya', 'MAYA');
    expect(c.merged).toBe(false);
    expect(c.facts.nodes.a?.threads).toEqual(['MAYA', 'Heist']);
    expect(c.facts.threads?.maya).toEqual({ color: 'teal', name: 'M' });
    expect(() => renameNovelThread(base(), 'Maya', 'a,b')).toThrow(RangeError);
  });

  it('remove takes it from passages and meta', () => {
    const r = removeNovelThread(base(), 'MAYA');
    expect(r.passages).toBe(2);
    expect(r.facts.nodes.b).toBeUndefined();
    expect(r.facts.nodes.a?.threads).toEqual(['Heist']);
    expect(r.facts.threads).toEqual({ heist: { color: 'red' } });
  });

  it('remove and rename count and change only the passages still in the book', () => {
    const facts = withNodes({
      'chapter:one:0': { threads: ['Maya'] },
      'chapter:gone:0': { threads: ['Maya'], status: 'todo' },
    });
    const inBook = (id: string) => id !== 'chapter:gone:0';
    const r = removeNovelThread(facts, 'Maya', inBook);
    expect(r.passages).toBe(1);
    expect(r.facts.nodes['chapter:one:0']).toBeUndefined();
    expect(r.facts.nodes['chapter:gone:0']).toEqual({ threads: ['Maya'], status: 'todo' });
    const n = renameNovelThread(facts, 'Maya', 'Mia', inBook);
    expect(n.passages).toBe(1);
    expect(n.facts.nodes['chapter:one:0']?.threads).toEqual(['Mia']);
    expect(n.facts.nodes['chapter:gone:0']?.threads).toEqual(['Maya']);
    // Without the book, every passage the facts have.
    expect(removeNovelThread(facts, 'Maya').passages).toBe(2);
  });

  it('setNovelThreadMeta sets, clears, validates', () => {
    const f = setNovelThreadMeta(empty(), 'Zed', { name: 'Zed!', color: 'blue' });
    expect(f.threads).toEqual({ zed: { name: 'Zed!', color: 'blue' } });
    expect(setNovelThreadMeta(f, 'zed', null).threads).toBeUndefined();
    expect(() => setNovelThreadMeta(f, 'a,b', null)).toThrow(RangeError);
    expect(() => setNovelThreadMeta(f, 'z', { name: 'x'.repeat(81) })).toThrow(RangeError);
    expect(() => setNovelThreadMeta(f, 'z', { color: 'mauve' as never })).toThrow(RangeError);
  });
});
