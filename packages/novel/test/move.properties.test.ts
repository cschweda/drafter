import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { moveNode, type NovelNode, novelStructure } from '../src';

const META = '<!-- drafter {"template":"novel","n":1} -->';

const body = fc.constantFrom('Some words here.', 'More words.', '***', '---', '', '', 'A line.');
const heading = fc.constantFrom(
  '# Part Two',
  '# Chapter',
  '## Scene',
  '## Another',
  '# One',
  '***',
);
const blocks = fc.array(fc.oneof(heading, body), { minLength: 1, maxLength: 24 });
const doc = fc
  .tuple(blocks, fc.constantFrom('\n', '\r\n'), fc.boolean())
  .map(([lines, nl, m]) => `${lines.join(nl)}${nl}${m ? `${nl}${META}${nl}` : ''}`);

function flat(list: NovelNode[], out: NovelNode[] = []): NovelNode[] {
  for (const n of list) {
    out.push(n);
    flat(n.children, out);
  }
  return out;
}

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .sort();

describe('moveNode properties', () => {
  it('after any legal move the non-blank lines are the same and the comment stays last', () => {
    let legal = 0;
    fc.assert(
      fc.property(
        doc,
        fc.nat(),
        fc.nat(),
        fc.constantFrom('before', 'after', 'into'),
        (text, a, b, how) => {
          const tree = novelStructure(text);
          const nodes = flat(tree.nodes);
          if (nodes.length < 2) return;
          const node = nodes[a % nodes.length];
          const other = nodes[b % nodes.length];
          const move = moveNode(text, tree, node.id, { [how]: other.id } as never);
          if (!move) return;
          legal++;
          let out = text;
          for (const c of [...move.changes].sort((x, y) => y.from - x.from)) {
            out = out.slice(0, c.from) + c.insert + out.slice(c.to);
          }
          expect(lines(out)).toEqual(lines(text));
          if (text.includes(META)) {
            expect(out.slice(out.indexOf(META))).toBe(text.slice(text.indexOf(META)));
            expect(out.indexOf(META)).toBe(out.lastIndexOf(META));
          }
          // The moved heading is where `at` says.
          const trimmed = text.slice(node.span.from, node.span.to).replace(/\s+$/, '');
          expect(out.slice(move.at, move.at + trimmed.length)).toBe(trimmed);
          // It keeps its kind and sits under the requested parent.
          const find = (
            list: NovelNode[],
            parent: NovelNode | null,
          ): [NovelNode, NovelNode | null] | null => {
            for (const n of list) {
              if (n.heading.from === move.at) return [n, parent];
              const r = find(n.children, n);
              if (r) return r;
            }
            return null;
          };
          const hit = find(novelStructure(out).nodes, null);
          expect(hit?.[0].kind).toBe(node.kind);
          const parentOld = how === 'into' ? other : nodes.find((n) => n.children.includes(other));
          expect(hit?.[1]?.title ?? null).toBe(parentOld?.title ?? null);
          expect(hit?.[1]?.kind ?? null).toBe(parentOld?.kind ?? null);
          // The result still parses, with the same number of nodes.
          expect(flat(novelStructure(out).nodes).length).toBe(nodes.length);
        },
      ),
      { numRuns: 500 },
    );
    expect(legal).toBeGreaterThan(0);
  });
});
