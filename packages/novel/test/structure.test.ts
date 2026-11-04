import { countWords, findMarkdownMeta, parseMarkdown } from '@drafter/markdown';
import { describe, expect, it } from 'vitest';
import { findNode, nodeAt, novelStructure } from '../src';

describe('novelStructure', () => {
  it('reads chapters and sections, with their words', () => {
    const tree = novelStructure('# One\n\nA b c.\n\n## Arrival\n\nD e.\n\n# Two\n\nF.\n');
    expect(tree.parts).toBe(false);
    expect(tree.nodes.map((n) => [n.kind, n.title])).toEqual([
      ['chapter', 'One'],
      ['chapter', 'Two'],
    ]);
    const one = tree.nodes[0];
    expect(one.ownWords).toBe(4); // the title and `A b c.`
    expect(one.children).toHaveLength(1);
    expect(one.children[0].kind).toBe('section');
    expect(one.children[0].words).toBe(3);
    expect(one.words).toBe(7);
    expect(one.id).toBe('chapter:one:0');
    expect(tree.words).toBe(9);
  });

  it('reads a part', () => {
    const tree = novelStructure('# Part One\n\n# The Lighthouse\n\nText.\n');
    expect(tree.parts).toBe(true);
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].kind).toBe('part');
    expect(tree.nodes[0].children).toHaveLength(1);
    expect(tree.nodes[0].children[0].kind).toBe('chapter');
    expect(tree.nodes[0].children[0].title).toBe('The Lighthouse');
  });

  it('does not take a title that only starts with the letters of Part', () => {
    expect(novelStructure('# Partridge\n').nodes[0].kind).toBe('chapter');
    expect(novelStructure('# PART\n').nodes[0].kind).toBe('part');
  });

  it('starts an untitled section at a scene break', () => {
    for (const mark of ['***', '---', '* * *', '___']) {
      const tree = novelStructure(`# One\n\nA.\n\n${mark}\n\nB.\n`);
      expect(tree.nodes).toHaveLength(1);
      const [section] = tree.nodes[0].children;
      expect(section.title).toBe('');
      expect(section.kind).toBe('section');
      expect(section.id).toBe('section::0');
      expect(section.ownWords).toBe(1);
    }
  });

  it('numbers siblings that share a title', () => {
    const tree = novelStructure('# One\n\n# One\n\n***\n\n***\n');
    expect(tree.nodes.map((n) => n.id)).toEqual(['chapter:one:0', 'chapter:one:1']);
    expect(tree.nodes[1].children.map((n) => n.id)).toEqual(['section::0', 'section::1']);
  });

  it('is not fooled by a heading inside fenced code', () => {
    expect(novelStructure('```\n# not a chapter\n```\n').nodes).toEqual([]);
    expect(novelStructure('~~~\n# not a chapter\n~~~\n# Real\n').nodes.map((n) => n.title)).toEqual(
      ['Real'],
    );
    expect(novelStructure('```\n# no\n~~~\n# still no\n```\n').nodes).toEqual([]);
  });

  it('is not fooled by a # in the metadata comment', () => {
    const text = '# One\n\nA.\n\n<!-- drafter {"template":"novel","note":"\\n# Nope"} -->\n';
    const tree = novelStructure(text);
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].words).toBe(2);
  });

  it('reads a setext heading as a chapter, and ---- under text as a section heading', () => {
    const tree = novelStructure(
      'Title\n=====\n\nBody one.\n\nA Section\n---------\n\nBody two.\n\n---\n\nBody three.\n',
    );
    expect(tree.nodes.map((n) => n.title)).toEqual(['Title']);
    const sections = tree.nodes[0].children;
    expect(sections.map((n) => n.title)).toEqual(['A Section', '']);
    expect(sections[0].heading).toEqual({ from: 24, to: 43 });
    expect(sections[1].ownWords).toBe(2);
  });

  it('stops before the metadata comment', () => {
    const text = '# One\n\nA.\n\n## Two\n\nB.\n\n<!-- drafter {"template":"novel"} -->\n';
    const tree = novelStructure(text);
    const last = tree.nodes[0].children[0];
    expect(last.span.to).toBe(findMarkdownMeta(text)?.from);
    expect(tree.nodes[0].span.to).toBe(last.span.to);
  });

  it('keeps text before the first heading as the preamble', () => {
    const tree = novelStructure('Dedication.\n\n# One\n\nA.\n');
    expect(tree.preamble).toEqual({ from: 0, to: 13 });
    expect(tree.words).toBe(3);
    expect(novelStructure('# One\n').preamble).toBeNull();
    expect(novelStructure('Just words.\n***\nmore\n').preamble).toEqual({ from: 0, to: 21 });
  });

  it('handles empty text, CRLF, and closing hashes', () => {
    expect(novelStructure('')).toEqual({ preamble: null, parts: false, nodes: [], words: 0 });
    const tree = novelStructure('# One #\r\n\r\nA b.\r\n## Two ##\r\n');
    expect(tree.nodes[0].title).toBe('One');
    expect(tree.nodes[0].children[0].title).toBe('Two');
    expect(tree.nodes[0].ownWords).toBe(3);
  });

  it('does not take ### or an indented # as structure', () => {
    expect(novelStructure('### Deep\n\n    # code\n').nodes).toEqual([]);
  });
});

describe('review fixes', () => {
  it('totals agree with the status bar on prose', () => {
    const body =
      'A dedication, short.\n\n# Part One\n\n# The *Lighthouse* Keeper\n\nShe climbed [the stairs](http://x.test/a b) at dusk.\n\n## Arrival\n\nThe boat came in.\n\n***\n\nLater, it left.\n\nSecond Chapter\n=============\n\nOne more line here.\n\n# Two #\n\nEnd.\n';
    const text = `${body}\n<!-- drafter {"template":"novel","novel":{"nodes":{"chapter:two:0":{"synopsis":"Four words of synopsis."}}}} -->\n`;
    // The status bar counts the parse of the whole text, comment and all (the comment is not prose).
    expect(novelStructure(text).words).toBe(countWords(parseMarkdown(text)));
    expect(countWords(parseMarkdown(text))).toBe(countWords(parseMarkdown(body)));
  });

  it('reads an opening ## as a chapter', () => {
    const tree = novelStructure('## Prologue\n\nOld.\n\n# One\n\n## Arrival\n');
    expect(tree.nodes.map((n) => [n.kind, n.title])).toEqual([
      ['chapter', 'Prologue'],
      ['chapter', 'One'],
    ]);
    expect(tree.nodes[1].children[0].kind).toBe('section');
    const setext = novelStructure('My Novel\n---\n\nText.\n\n# One\n');
    expect(setext.nodes.map((n) => [n.kind, n.title])).toEqual([
      ['chapter', 'My Novel'],
      ['chapter', 'One'],
    ]);
  });

  it('gives a part only chapters', () => {
    const heading = novelStructure('# Part One\n\n## Foo\n\nText.\n');
    expect(heading.nodes[0].children.map((n) => [n.kind, n.title])).toEqual([['chapter', 'Foo']]);
    const rule = novelStructure('# Part One\n\nIntro.\n\n***\n\nText.\n');
    expect(rule.nodes[0].children).toHaveLength(1);
    expect(rule.nodes[0].children[0].kind).toBe('chapter');
    expect(rule.nodes[0].children[0].title).toBe('');
    expect(rule.nodes[0].children[0].id).toBe('chapter::0');
  });

  it('numbers ids across the whole book', () => {
    const tree = novelStructure('# One\n\nA.\n\n***\n\nB.\n\n# Two\n\nC.\n\n***\n\nD.\n');
    const [a, b] = [tree.nodes[0].children[0], tree.nodes[1].children[0]];
    expect([a.id, b.id]).toEqual(['section::0', 'section::1']);
    expect(findNode(tree, 'section::0')).toBe(a);
    expect(findNode(tree, 'section::1')).toBe(b);
  });

  it('ends a paragraph at a quote or list item, so --- is a break', () => {
    for (const text of [
      '# A\n\nPara\n> quote\n---\n',
      '# A\n\n- item\nlazy\n---\n',
      '# A\n\n1. item\n---\n',
    ]) {
      const tree = novelStructure(text);
      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0].children.map((n) => n.title)).toEqual(['']);
    }
  });

  it('reads a long heading line within a short time', () => {
    for (const text of [
      `# ${' '.repeat(200_000)}x\ry\n# After\n`,
      `# x${' #'.repeat(100_000)}${' '.repeat(100_000)}y\r\n`,
      `# ${'#'.repeat(200_000)} ${' '.repeat(200_000)}\rz\n`,
    ]) {
      const start = performance.now();
      const tree = novelStructure(text);
      expect(performance.now() - start).toBeLessThan(100);
      expect(tree.nodes.length).toBeGreaterThan(0);
    }
  });
});

describe('nodeAt and findNode', () => {
  const text = '# One\n\nA.\n\n## Two\n\nB.\n\n# Three\n\nC.\n';
  const tree = novelStructure(text);
  it('finds the deepest node holding an offset', () => {
    expect(nodeAt(tree, 0)?.id).toBe('chapter:one:0');
    expect(nodeAt(tree, text.indexOf('B'))?.id).toBe('section:two:0');
    expect(nodeAt(tree, text.indexOf('C'))?.id).toBe('chapter:three:0');
    expect(nodeAt(tree, text.length)).toBeNull();
    expect(nodeAt(novelStructure('Intro\n\n# One\n'), 2)).toBeNull();
  });
  it('finds a node by id', () => {
    expect(findNode(tree, 'section:two:0')?.title).toBe('Two');
    expect(findNode(tree, 'section:nope:0')).toBeNull();
  });
});
