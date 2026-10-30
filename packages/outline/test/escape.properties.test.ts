import fc from 'fast-check';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, test } from 'vitest';
import { markdownText } from '../src';

// Text over an alphabet heavy in what Markdown reads, escaped and read back by the app's own
// CommonMark parser.
const ALPHABET = [
  ...'#*_-+=>.)1 9`~[]()<>!&|\\:;/"\'?a Bz',
  '\t',
  '\n',
  '\r\n',
  '\r',
  '\u00a0',
  '\v',
  '\f',
  '<?',
  '<![CDATA[',
  '<div>',
  '</p>',
  '<a href=x>',
  '| --- |',
  ':--',
  '--:',
  ':-:',
  '|',
  '@',
  '<x@y>',
  '<1@a.co>',
  '<+b@x.org>',
  '<.a@b>',
  'my_page',
  'https://example.com/a_b',
  '\u3000',
  '&copy;',
  '&#x2a;',
  '&c',
  'www.a.co',
  '10) ',
  '1234567890. ',
  '####### ',
  '###### ',
  '- - -',
  '===',
  '[a]: b',
  '&amp;',
  '&#42;',
  '<u>',
  'http://x.y',
  '* * *',
  '***',
  '---',
  '```',
  '    ',
  '1. ',
  '- [ ] ',
  '[a](b)',
  '![i](j)',
  '<!--',
  'é',
  '😀',
  ' ',
];
const text = fc
  .array(fc.constantFrom(...ALPHABET), { maxLength: 40 })
  .map((parts) => parts.join(''));

/** A block's text, with each hard break as a line break. */
function plain(node: Nodes): string {
  if (node.type === 'break') return '\n';
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).map(plain).join('');
}

/** What Markdown can hold of `text`: each line's ends trimmed, and the empty lines at the ends left off. */
function holdable(value: string): string {
  const lines = value.split(/\r\n|\r|\n/).map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ''));
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}

/** The little of an mdast node these checks read. */
interface Nodes {
  type: string;
  value?: string;
  children?: Nodes[];
}

describe('markdownText, read back', () => {
  test('any text, escaped and parsed, gives the same text in one paragraph', () => {
    fc.assert(
      fc.property(text, (value) => {
        const expected = holdable(value);
        const tree = fromMarkdown(markdownText(value));
        if (expected === '') {
          expect(tree.children).toEqual([]);
          return;
        }
        expect(tree.children.map((child) => child.type)).toEqual(['paragraph']);
        const paragraph = tree.children[0] as Nodes;
        for (const child of paragraph.children ?? [])
          expect(['text', 'break']).toContain(child.type);
        expect(plain(paragraph)).toBe(expected);
      }),
      { numRuns: 20_000 },
    );
  });
});
