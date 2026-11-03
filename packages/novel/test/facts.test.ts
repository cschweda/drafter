import { describe, expect, it } from 'vitest';
import {
  carryFacts,
  findNode,
  moveNode,
  type NovelFacts,
  novelStructure,
  orphanedFacts,
  readFacts,
  STATUS_LABELS,
  STATUSES,
  writeFacts,
} from '../src';

function emptyFacts(): NovelFacts {
  return { nodes: Object.create(null) };
}

function apply(text: string, changes: Array<{ from: number; to: number; insert: string }>) {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

function mapperFor(changes: Array<{ from: number; to: number; insert: string }>) {
  return (pos: number) => {
    let delta = 0;
    for (const c of [...changes].sort((a, b) => a.from - b.from)) {
      if (pos < c.to) {
        if (pos <= c.from) break;
        return c.from + delta + c.insert.length;
      }
      delta += c.insert.length - (c.to - c.from);
    }
    return pos + delta;
  };
}

const withMeta = (obj: unknown, body = '# One\n\nText.\n') =>
  `${body}\n<!-- drafter ${JSON.stringify(obj)} -->\n`;

describe('statuses', () => {
  it('has four, labelled', () => {
    expect(STATUSES).toEqual(['todo', 'draft', 'revised', 'done']);
    expect(Object.values(STATUS_LABELS)).toEqual(['To do', 'Draft', 'Revised', 'Done']);
  });
});

describe('readFacts / writeFacts', () => {
  it('round trips', () => {
    const facts = emptyFacts();
    facts.bookTarget = 80000;
    facts.nodes['chapter:one:0'] = { status: 'draft', synopsis: 'She leaves.', target: 3000 };
    const text = writeFacts('# One\n\nText.\n', facts);
    const back = readFacts(text);
    expect(back.bookTarget).toBe(80000);
    expect(back.nodes['chapter:one:0']).toEqual({
      status: 'draft',
      synopsis: 'She leaves.',
      target: 3000,
    });
    expect(Object.getPrototypeOf(back.nodes)).toBeNull();
  });

  it('keeps every other meta key', () => {
    const text = withMeta({ template: 'novel', number: 3, note: 'x' });
    const facts = emptyFacts();
    facts.nodes['chapter:one:0'] = { status: 'done' };
    const out = writeFacts(text, facts);
    expect(out).toContain('"template":"novel"');
    expect(out).toContain('"number":3');
    expect(out).toContain('"note":"x"');
    expect(readFacts(out).nodes['chapter:one:0']).toEqual({ status: 'done' });
  });

  it('cuts a synopsis to 2,000 characters and drops bad targets and statuses', () => {
    const text = withMeta({
      novel: {
        bookTarget: 0,
        nodes: {
          a: { synopsis: 'x'.repeat(5000), target: 1.5, status: 'nope' },
          b: { target: 10000001 },
          c: { target: 10000000, status: 'revised' },
        },
      },
    });
    const f = readFacts(text);
    expect(f.bookTarget).toBeUndefined();
    expect(f.nodes.a.synopsis?.length).toBe(2000);
    expect(f.nodes.a.target).toBeUndefined();
    expect(f.nodes.a.status).toBeUndefined();
    expect(f.nodes.b?.target).toBeUndefined();
    expect(f.nodes.c).toEqual({ target: 10000000, status: 'revised' });
  });

  it('never throws on hostile input: __proto__ keys', () => {
    const text = `# T\n\n<!-- drafter {"novel":{"nodes":{"__proto__":{"status":"done"},"constructor":{"synopsis":"s"}}}} -->\n`;
    const f = readFacts(text);
    expect(({} as Record<string, unknown>).status).toBeUndefined();
    expect(Object.getPrototypeOf(f.nodes)).toBeNull();
    expect(() => writeFacts(text, f)).not.toThrow();
  });

  it('never throws on hostile input: non-objects', () => {
    for (const novel of [
      null,
      5,
      'x',
      [],
      true,
      { nodes: 5 },
      { nodes: [1, 2] },
      { nodes: { a: 5, b: null, c: [], d: 'x' } },
    ]) {
      const f = readFacts(withMeta({ novel }));
      expect(Object.keys(f.nodes)).toEqual([]);
    }
    expect(Object.keys(readFacts(withMeta([1])).nodes)).toEqual([]);
    expect(Object.keys(readFacts('no meta').nodes)).toEqual([]);
  });

  it('never throws on hostile input: a 10 MB synopsis', () => {
    const big = 'a'.repeat(10 * 1024 * 1024);
    const f = readFacts(withMeta({ novel: { nodes: { a: { synopsis: big } } } }));
    expect(f.nodes.a.synopsis?.length).toBe(2000);
  });

  it('never throws on hostile input: wrong types', () => {
    const f = readFacts(
      withMeta({
        novel: {
          bookTarget: '5',
          nodes: { a: { status: 5, synopsis: 7, target: '3' }, b: { status: {}, target: NaN } },
        },
      }),
    );
    expect(f.bookTarget).toBeUndefined();
    expect(f.nodes.a ?? {}).toEqual({});
    expect(f.nodes.b ?? {}).toEqual({});
  });
});

describe('carryFacts', () => {
  const doc = '# Alpha\n\nOne.\n\n# Beta\n\nTwo.\n\n# Gamma\n\nThree.\n';

  it('carries facts through a rename', () => {
    const before = novelStructure(doc);
    const after = novelStructure(doc.replace('# Beta', '# Delta'));
    const facts = emptyFacts();
    facts.nodes['chapter:beta:0'] = { status: 'draft' };
    const out = carryFacts(facts, before, after, (p) => p);
    expect(out.nodes['chapter:delta:0']).toEqual({ status: 'draft' });
    expect(out.nodes['chapter:beta:0']).toBeUndefined();
  });

  it('carries every fact through a move, renumbered untitled sections included', () => {
    const text = '# A\n\n## x\n\nt\n\n***\n\nu\n\n# B\n\n## x\n\nt\n\n***\n\nu\n\n# C\n\nv\n';
    const before = novelStructure(text);
    const facts = emptyFacts();
    const marks: Record<string, string> = {};
    const walk = (list: typeof before.nodes) => {
      for (const n of list) {
        facts.nodes[n.id] = { synopsis: `from ${n.id}` };
        marks[n.id] = `from ${n.id}`;
        walk(n.children);
      }
    };
    walk(before.nodes);
    const move = moveNode(text, before, 'chapter:b:0', { before: 'chapter:a:0' });
    expect(move).not.toBeNull();
    const m = move as NonNullable<typeof move>;
    const out = apply(text, m.changes);
    const after = novelStructure(out);
    // A move is a cut and a paste, so a plain mapping loses the moved text; the caller maps the
    // moved unit to where it landed (`at`) and everything else through the changes.
    const moved = findNode(before, 'chapter:b:0') as NonNullable<ReturnType<typeof findNode>>;
    const plain = mapperFor(m.changes);
    const unitEnd = moved.span.to;
    const mapPos = (p: number) =>
      p >= moved.span.from && p < unitEnd ? m.at + (p - moved.span.from) : plain(p);
    const carried = carryFacts(facts, before, after, mapPos);
    expect(Object.keys(carried.nodes).length).toBe(Object.keys(facts.nodes).length);
    // Each fact sits on the node whose heading text is the one it started on.
    for (const [oldId, synopsis] of Object.entries(marks)) {
      const oldNode = findNode(before, oldId) as NonNullable<ReturnType<typeof findNode>>;
      const hit = Object.entries(carried.nodes).find(([, f]) => f.synopsis === synopsis);
      expect(hit).toBeDefined();
      const newNode = findNode(after, (hit as [string, unknown])[0]) as NonNullable<
        ReturnType<typeof findNode>
      >;
      expect(newNode.kind).toBe(oldNode.kind);
      expect(newNode.title).toBe(oldNode.title);
    }
    expect(carried.nodes['chapter:b:0']?.synopsis).toBe('from chapter:b:0');
    expect(orphanedFacts(carried, after)).toEqual([]);
  });

  it('drops facts of a deleted heading and keeps existing orphans', () => {
    const before = novelStructure(doc);
    const after = novelStructure(doc.replace('# Beta\n\nTwo.\n\n', ''));
    const facts = emptyFacts();
    facts.nodes['chapter:beta:0'] = { status: 'done' };
    facts.nodes['chapter:gamma:0'] = { status: 'todo' };
    facts.nodes['chapter:ghost:0'] = { status: 'draft' };
    // Beta's heading and text, "# Beta\n\nTwo.\n\n", is deleted: its offsets collapse to the cut.
    const cut = before.nodes[1].heading.from;
    const len = before.nodes[2].heading.from - cut;
    const mapPos = (p: number) => (p <= cut ? p : p < cut + len ? cut : p - len);
    const out = carryFacts(facts, before, after, mapPos);
    expect(out.nodes['chapter:beta:0']).toBeUndefined();
    expect(out.nodes['chapter:gamma:0']).toEqual({ status: 'todo' });
    expect(out.nodes['chapter:ghost:0']).toEqual({ status: 'draft' });
  });
});

describe('orphanedFacts', () => {
  it('lists a heading renamed outside the app', () => {
    const facts = emptyFacts();
    facts.nodes['chapter:one:0'] = { status: 'draft' };
    facts.nodes['chapter:two:0'] = { status: 'done' };
    const tree = novelStructure('# One\n\nx\n\n# Deux\n\ny\n');
    expect(orphanedFacts(facts, tree)).toEqual(['chapter:two:0']);
  });
});
