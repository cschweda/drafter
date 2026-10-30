// Moved from apps/web/test/markdown-footnotes.test.ts with the code.
import { describe, expect, test } from 'vitest';
import { footnotes, MAX_NESTING, type MdNode, parseMarkdown } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

describe('the footnote parser on hostile input', () => {
  const linear = (name: string, make: (n: number) => string, n: number) => {
    const { small, large, growth } = scaling(make, (source) => parseMarkdown(source), n);
    console.log(
      `Footnotes, ${name}: ${small.toFixed(1)} ms at n, ${large.toFixed(1)} ms at 4n (growth ${growth.toFixed(1)}).`,
    );
    expect(growth).toBeLessThan(MAX_GROWTH);
  };

  test(
    'reads unclosed `[^` openings in linear time',
    () => linear('`[^` openings', (n) => '[^'.repeat(n), 25_000),
    SCALING_TIMEOUT,
  );

  test(
    'reads very long labels in linear time',
    () =>
      linear(
        'long labels',
        (n) => `x[^${'a'.repeat(n)}]\n\n[^${'a'.repeat(n)}]: y\n${'x[^b'.repeat(n / 4)}`,
        100_000,
      ),
    SCALING_TIMEOUT,
  );

  test(
    'reads many references in linear time',
    () => linear('references', (n) => `${'x[^a]'.repeat(n)}\n\n[^a]: y\n`, 20_000),
    SCALING_TIMEOUT,
  );

  test(
    'reads many definitions, and references to them, in linear time',
    () =>
      linear(
        'definitions',
        (n) =>
          Array.from({ length: n }, (_, i) => `[^n${i}]: note\n`).join('') +
          Array.from({ length: n }, (_, i) => `x[^n${i}] `).join(''),
        5_000,
      ),
    SCALING_TIMEOUT,
  );

  test(
    'reads definitions nested as deep as a document may in linear time, and refuses deeper at once',
    () => {
      // Each line indented four columns carries on every open definition (the extension's
      // container rules), so the parser's time is depth times length: bounded by MAX_NESTING.
      const head = Array.from({ length: MAX_NESTING }, (_, i) => `${i ? '    ' : ''}[^a]: x`).join(
        '\n',
      );
      linear(
        'nested to the limit',
        (n) => `${head}\n${'    more words of the note\n'.repeat(n)}`,
        500,
      );
      const deeper = `${head}\n    [^a]: x\n`;
      const start = performance.now();
      expect(() => parseMarkdown(deeper)).toThrow(RangeError);
      expect(performance.now() - start).toBeLessThan(100);
    },
    SCALING_TIMEOUT,
  );

  test('keeps a definition’s label to 999 characters, as GFM does', () => {
    const long = 'a'.repeat(1_000);
    const tree = parseMarkdown(`x[^${long}]\n\n[^${long}]: y\n`);
    expect(footnotes(tree).notes).toEqual([]);
  });
});

describe('the parse', () => {
  test('makes footnote nodes, and keeps raw HTML an html node', () => {
    const tree = parseMarkdown('A[^b] <i>c</i>\n\n[^b]: Note.\n') as MdNode & {
      children: MdNode[];
    };
    const types = (node: MdNode): string[] => [node.type, ...(node.children ?? []).flatMap(types)];
    expect(types(tree)).toEqual([
      'root',
      'paragraph',
      'text',
      'footnoteReference',
      'text',
      'html',
      'text',
      'html',
      'footnoteDefinition',
      'paragraph',
      'text',
    ]);
  });
});

describe('the tree, for the HTML export', () => {
  test('carries a link’s address, and a footnote’s identifier and label', () => {
    const tree = parseMarkdown('[here](https://example.com/a) and x[^Note].\n\n[^note]: N.\n');
    const nodes: MdNode[] = [];
    const visit = (node: MdNode) => {
      nodes.push(node);
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    expect(nodes.find((n) => n.type === 'link')?.url).toBe('https://example.com/a');
    const ref = nodes.find((n) => n.type === 'footnoteReference');
    expect([ref?.identifier, ref?.label]).toEqual(['note', 'Note']);
  });

  test('takes one byte-order mark off first, offsets and all, as the parser would', () => {
    const plain = parseMarkdown('# Title\n\nText.\n');
    const marked = parseMarkdown('﻿# Title\n\nText.\n');
    expect(JSON.stringify(marked)).toBe(JSON.stringify(plain));
  });
});
