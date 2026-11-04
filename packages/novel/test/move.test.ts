import { describe, expect, it } from 'vitest';
import { downTarget, findNode, moveNode, type NovelTarget, novelStructure, upTarget } from '../src';

const META = '<!-- drafter {"template":"novel"} -->\n';

function apply(text: string, changes: Array<{ from: number; to: number; insert: string }>) {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

/** Moves the node with this id and returns the new text and the moved text. */
function run(text: string, id: string, target: NovelTarget) {
  const tree = novelStructure(text);
  const node = findNode(tree, id);
  const move = moveNode(text, tree, id, target);
  if (!node || !move) return null;
  const out = apply(text, move.changes);
  const unit = text.slice(node.span.from, node.span.to).replace(/\s+$/, '');
  return { out, unit, at: move.at };
}

const book = `# Part One

# Chapter A

## First

Alpha text.

## Second

Beta text.

# Chapter B

## Third

Gamma text.

# Part Two

# Chapter C

Delta text.

${META}`;

describe('moveNode', () => {
  it('moves a section up within its chapter', () => {
    const r = run(book, 'section:second:0', { before: 'section:first:0' });
    expect(r?.out).toBe(`# Part One

# Chapter A

## Second

Beta text.

## First

Alpha text.

# Chapter B

## Third

Gamma text.

# Part Two

# Chapter C

Delta text.

${META}`);
    expect(r?.out.slice(r.at, r.at + r.unit.length)).toBe(r?.unit);
    expect(r?.unit).toBe('## Second\n\nBeta text.');
  });

  it('moves a section into the next chapter, as its first section', () => {
    const r = run(book, 'section:second:0', { into: 'chapter:chapter-b:0' });
    expect(r?.out).toBe(`# Part One

# Chapter A

## First

Alpha text.

# Chapter B

## Second

Beta text.

## Third

Gamma text.

# Part Two

# Chapter C

Delta text.

${META}`);
    expect(r?.out.slice(r.at, r.at + r.unit.length)).toBe(r?.unit);
  });

  it('moves a chapter before the first chapter', () => {
    const r = run(book, 'chapter:chapter-b:0', { before: 'chapter:chapter-a:0' });
    expect(r?.out).toBe(`# Part One

# Chapter B

## Third

Gamma text.

# Chapter A

## First

Alpha text.

## Second

Beta text.

# Part Two

# Chapter C

Delta text.

${META}`);
    expect(r?.out.slice(r.at, r.at + r.unit.length)).toBe(r?.unit);
  });

  it('moves a part after another part', () => {
    const r = run(book, 'part:part-one:0', { after: 'part:part-two:0' });
    expect(r?.out).toBe(`# Part Two

# Chapter C

Delta text.

# Part One

# Chapter A

## First

Alpha text.

## Second

Beta text.

# Chapter B

## Third

Gamma text.

${META}`);
    expect(r?.out.slice(r.at, r.at + r.unit.length)).toBe(r?.unit);
  });

  it('moves the last chapter of a part into the next part, keeping the comment last', () => {
    const r = run(book, 'chapter:chapter-b:0', { into: 'part:part-two:0' });
    expect(r?.out).toBe(`# Part One

# Chapter A

## First

Alpha text.

## Second

Beta text.

# Part Two

# Chapter B

## Third

Gamma text.

# Chapter C

Delta text.

${META}`);
  });

  it('moves an untitled section with its scene break', () => {
    const text = `# One\n\nOpening.\n\n***\n\nAfter the break.\n\n## Named\n\nNamed text.\n\n${META}`;
    const tree = novelStructure(text);
    const brk = tree.nodes[0].children[0];
    expect(brk.title).toBe('');
    const r = run(text, brk.id, { after: tree.nodes[0].children[1].id });
    expect(r?.out).toBe(
      `# One\n\nOpening.\n\n## Named\n\nNamed text.\n\n***\n\nAfter the break.\n\n${META}`,
    );
  });

  it('normalises the seams to one empty line, in the file’s own line break', () => {
    const text = `# A\r\n\r\n\r\n\r\ntext a\r\n\r\n\r\n# B\r\n\r\ntext b\r\n`;
    const r = run(text, 'chapter:a:0', { after: 'chapter:b:0' });
    expect(r?.out).toBe('# B\r\n\r\ntext b\r\n\r\n# A\r\n\r\n\r\n\r\ntext a\r\n');
  });

  it('returns null for no-ops, a target inside the node, bad kinds, and unknown ids', () => {
    expect(run(book, 'section:first:0', { before: 'section:first:0' })).toBeNull();
    expect(run(book, 'section:first:0', { before: 'section:second:0' })).toBeNull();
    expect(run(book, 'section:second:0', { after: 'section:first:0' })).toBeNull();
    expect(run(book, 'chapter:chapter-a:0', { after: 'section:first:0' })).toBeNull();
    expect(run(book, 'chapter:chapter-a:0', { into: 'chapter:chapter-a:0' })).toBeNull();
    expect(run(book, 'part:part-one:0', { into: 'part:part-two:0' })).toBeNull();
    expect(run(book, 'part:part-one:0', { after: 'chapter:chapter-c:0' })).toBeNull();
    expect(run(book, 'section:first:0', { before: 'chapter:chapter-b:0' })).toBeNull();
    expect(run(book, 'chapter:chapter-b:0', { before: 'part:part-two:0' })).toBeNull();
    expect(run(book, 'nope', { before: 'section:first:0' })).toBeNull();
    expect(run(book, 'section:first:0', { before: 'nope' })).toBeNull();
  });
});

describe('a move that would change the kind of a heading', () => {
  it('returns null for an opening ## chapter moved after a # chapter', () => {
    const text = '## Prologue\n\npro\n\n# One\n\none\n';
    expect(run(text, 'chapter:prologue:0', { after: 'chapter:one:0' })).toBeNull();
  });
});

describe('down then up', () => {
  it('takes a chapter back out of the first part', () => {
    const text = '# Loose\n\nlo\n\n# Part One\n\n# Chapter A\n\na\n';
    const tree = novelStructure(text);
    const down = downTarget(tree, 'chapter:loose:0');
    expect(down).toEqual({ into: 'part:part-one:0' });
    const r = run(text, 'chapter:loose:0', down as NovelTarget);
    const out = r?.out as string;
    const tree2 = novelStructure(out);
    const id = tree2.nodes[0].children[0].id;
    const up = upTarget(tree2, id);
    expect(up).toEqual({ before: 'part:part-one:0' });
    const back = run(out, id, up as NovelTarget);
    expect(back?.out).toBe(text);
  });
});

describe('down then up, with a second loose chapter', () => {
  it('goes back after the last loose chapter', () => {
    const text = '# Loose\n\nlo\n\n# Last\n\nla\n\n# Part One\n\n# Chapter A\n\na\n';
    const tree = novelStructure(text);
    const out = run(text, 'chapter:last:0', downTarget(tree, 'chapter:last:0') as NovelTarget)
      ?.out as string;
    const tree2 = novelStructure(out);
    const id = tree2.nodes[1].children[0].id;
    expect(upTarget(tree2, id)).toEqual({ after: 'chapter:loose:0' });
    expect(run(out, id, upTarget(tree2, id) as NovelTarget)?.out).toBe(text);
  });
});

describe('upTarget and downTarget', () => {
  const tree = novelStructure(book);
  it('step among siblings and across parents', () => {
    expect(upTarget(tree, 'section:second:0')).toEqual({ before: 'section:first:0' });
    expect(downTarget(tree, 'section:first:0')).toEqual({ after: 'section:second:0' });
    expect(downTarget(tree, 'section:second:0')).toEqual({ into: 'chapter:chapter-b:0' });
    expect(upTarget(tree, 'section:third:0')).toEqual({ after: 'section:second:0' });
    expect(upTarget(tree, 'section:first:0')).toBeNull();
    expect(downTarget(tree, 'chapter:chapter-b:0')).toEqual({ into: 'part:part-two:0' });
    expect(upTarget(tree, 'chapter:chapter-c:0')).toEqual({ after: 'chapter:chapter-b:0' });
    expect(downTarget(tree, 'part:part-one:0')).toEqual({ after: 'part:part-two:0' });
    expect(upTarget(tree, 'part:part-one:0')).toBeNull();
    expect(downTarget(tree, 'chapter:chapter-c:0')).toBeNull();
    expect(upTarget(tree, 'nope')).toBeNull();
  });

  it('every offered step is a legal move', () => {
    const ids: string[] = [];
    const walk = (list: typeof tree.nodes) => {
      for (const n of list) {
        ids.push(n.id);
        walk(n.children);
      }
    };
    walk(tree.nodes);
    for (const id of ids) {
      for (const t of [upTarget(tree, id), downTarget(tree, id)]) {
        if (t) expect(moveNode(book, tree, id, t)).not.toBeNull();
      }
    }
  });
});
