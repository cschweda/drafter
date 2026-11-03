import { findMarkdownMeta } from '@drafter/markdown';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type NovelNode, novelStructure } from '../src';

const line = fc.oneof(
  fc.constantFrom(
    '# One',
    '# Part Two',
    '## Arrival',
    '### Deep',
    '---',
    '***',
    '* * *',
    '___',
    '',
    '```',
    '~~~',
    '====',
    '    code',
  ),
  fc.stringMatching(/^[A-Za-z ]{0,12}$/),
);
const meta = '<!-- drafter {"template":"novel"} -->';

describe('novelStructure properties', () => {
  it('tiles the text up to the metadata comment, with no gap or overlap', () => {
    fc.assert(
      fc.property(
        fc.array(line, { maxLength: 40 }),
        fc.boolean(),
        fc.boolean(),
        (lines, withMeta, crlf) => {
          const eol = crlf ? '\r\n' : '\n';
          const body = lines.join(eol);
          const text = withMeta ? `${body}${eol}${eol}${meta}${eol}` : body;
          const stop = findMarkdownMeta(text)?.from ?? text.length;
          const tree = novelStructure(text);
          let at = 0;
          if (tree.preamble) {
            expect(tree.preamble.from).toBe(0);
            at = tree.preamble.to;
          }
          for (const node of tree.nodes) {
            expect(node.span.from).toBe(at);
            at = node.span.to;
          }
          expect(at).toBe(stop);
          // Children tile their parent's span after its own text.
          const check = (node: NovelNode) => {
            let from = node.children[0]?.span.from ?? node.span.to;
            expect(from).toBeGreaterThanOrEqual(node.heading.to);
            for (const child of node.children) {
              expect(child.span.from).toBe(from);
              from = child.span.to;
              check(child);
            }
            expect(from).toBe(node.span.to);
          };
          for (const node of tree.nodes) check(node);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('never throws on anything, and its ids are unique among siblings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        const tree = novelStructure(text);
        const unique = (nodes: NovelNode[]) => {
          expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
          for (const n of nodes) unique(n.children);
        };
        unique(tree.nodes);
      }),
      { numRuns: 500 },
    );
  });
});
