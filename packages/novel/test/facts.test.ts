import { ChangeSet, Text } from '@codemirror/state';
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
    const carried = carryFacts(facts, before, after, m.mapPos);
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

describe('with real CodeMirror changes', () => {
  const text = '# A\n\n## x\n\nt\n\n***\n\nu\n\n# B\n\n## x\n\nt\n\n***\n\nu\n\n# C\n\nv\n';

  function allFacts(tree: ReturnType<typeof novelStructure>) {
    const facts = emptyFacts();
    const walk = (list: typeof tree.nodes) => {
      for (const n of list) {
        facts.nodes[n.id] = { synopsis: `from ${n.id}` };
        walk(n.children);
      }
    };
    walk(tree.nodes);
    return facts;
  }

  it("a move then carryFacts(move.mapPos) keeps every node's facts", () => {
    const before = novelStructure(text);
    const facts = allFacts(before);
    const move = moveNode(text, before, 'chapter:b:0', { before: 'chapter:a:0' });
    expect(move).not.toBeNull();
    const m = move as NonNullable<typeof move>;
    const set = ChangeSet.of(m.changes, text.length);
    const out = set.apply(Text.of(text.split('\n'))).toString();
    const after = novelStructure(out);
    const carried = carryFacts(facts, before, after, m.mapPos);
    expect(Object.keys(carried.nodes).length).toBe(Object.keys(facts.nodes).length);
    const bMoved = findNode(after, 'chapter:b:0') as NonNullable<ReturnType<typeof findNode>>;
    expect(bMoved.heading.from).toBe(m.at);
    expect(carried.nodes['chapter:b:0']?.synopsis).toBe('from chapter:b:0');
    for (const id of Object.keys(facts.nodes)) {
      const old = findNode(before, id) as NonNullable<ReturnType<typeof findNode>>;
      const hit = Object.entries(carried.nodes).find(([, f]) => f.synopsis === `from ${id}`);
      const now = findNode(after, (hit as [string, unknown])[0]) as NonNullable<
        ReturnType<typeof findNode>
      >;
      expect(now.title).toBe(old.title);
      expect(now.kind).toBe(old.kind);
    }
  });

  it('move.mapPos and ChangeSet.mapPos agree outside the unit', () => {
    const before = novelStructure(text);
    const unit = findNode(before, 'chapter:b:0') as NonNullable<ReturnType<typeof findNode>>;
    const m = moveNode(text, before, 'chapter:b:0', { before: 'chapter:a:0' }) as NonNullable<
      ReturnType<typeof moveNode>
    >;
    const set = ChangeSet.of(m.changes, text.length);
    const unitEnd = Math.max(
      unit.heading.to,
      text.slice(0, unit.span.to).replace(/\s+$/, '').length,
    );
    for (let pos = 0; pos <= text.length; pos++) {
      if (pos >= unit.span.from && pos <= unitEnd) continue;
      for (const assoc of [-1, 1]) {
        expect(m.mapPos(pos, assoc)).toBe(set.mapPos(pos, assoc));
      }
    }
  });

  const doc = '# Alpha\n\nOne.\n\n# Beta\n\nTwo.\n';

  function carry(change: { from: number; to?: number; insert?: string }) {
    const before = novelStructure(doc);
    const facts = emptyFacts();
    facts.nodes['chapter:beta:0'] = { status: 'done' };
    const set = ChangeSet.of(change, doc.length);
    const after = novelStructure(set.apply(Text.of(doc.split('\n'))).toString());
    return { out: carryFacts(facts, before, after, (p, a) => set.mapPos(p, a)), after };
  }

  it('Enter at a heading start keeps its facts with the heading', () => {
    const at = (novelStructure(doc).nodes[1] as { heading: { from: number } }).heading.from;
    const { out } = carry({ from: at, insert: '\n' });
    expect(out.nodes['chapter:beta:0']).toEqual({ status: 'done' });
  });

  it('a new chapter inserted at a heading start does not take its facts', () => {
    const at = (novelStructure(doc).nodes[1] as { heading: { from: number } }).heading.from;
    const { out, after } = carry({ from: at, insert: '# New\n\n' });
    expect(out.nodes['chapter:new:0']).toBeUndefined();
    expect(out.nodes['chapter:beta:0']).toEqual({ status: 'done' });
    expect(after.nodes.map((n) => n.id)).toContain('chapter:new:0');
  });

  it('a deletion still drops the facts', () => {
    const at = (novelStructure(doc).nodes[1] as { heading: { from: number } }).heading.from;
    const { out } = carry({ from: at, to: doc.length });
    expect(Object.keys(out.nodes)).toEqual([]);
  });

  it('a carried fact wins over an orphan with the same id, and results do not share objects', () => {
    const before = novelStructure('# A\n\n# B\n');
    const after = novelStructure('# B\n\n# A\n');
    const facts = emptyFacts();
    facts.nodes['chapter:a:0'] = { status: 'done' };
    facts.nodes['chapter:b:0'] = { status: 'todo' };
    // A is renamed to B in place: old B is deleted; the fact of A lands on the new first chapter (b:0).
    const out = carryFacts(facts, before, after, (p) => p);
    expect(out.nodes['chapter:b:0']).toEqual({ status: 'done' });
    expect(out.nodes['chapter:b:0']).not.toBe(facts.nodes['chapter:a:0']);
  });
});
