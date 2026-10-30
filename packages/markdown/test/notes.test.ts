// The numbering walk, moved here from `@drafter/render-pdf`'s document/notes.ts (its test from
// test/document-notes.test.ts) and `apps/web`'s markdown/notes.ts, which numbered the same way.
import { describe, expect, it } from 'vitest';
import { footnotes, type MdNode, parseMarkdown } from '../src';

describe('footnotes', () => {
  it('numbers notes by first reference, and gives each note the last number of the notes inside it', () => {
    const tree = parseMarkdown(
      'A[^z] B[^y] A[^z].\n\n[^y]: Y, see[^x].\n[^z]: Z.\n[^x]: X.\n[^w]: Unused.\n',
    );
    const { numbers, notes, last } = footnotes(tree);
    expect([...numbers]).toEqual([
      ['z', 1],
      ['y', 2],
      ['x', 3],
    ]);
    expect(notes.map((n) => n.identifier)).toEqual(['z', 'y', 'x']);
    expect(last).toEqual([1, 3, 3]);
  });

  it('numbers a note referenced only inside another note right after it', () => {
    const tree = parseMarkdown(
      'A[^a] and B[^b].\n\n[^a]: Note a, see[^c].\n[^b]: Note b.\n[^c]: Note c.\n',
    );
    expect([...footnotes(tree).numbers]).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 3],
    ]);
  });

  it('uses the first definition of a label, and numbers nothing never referenced', () => {
    const { notes } = footnotes(parseMarkdown('Text[^a].\n\n[^a]: First.\n[^a]: Second.\n'));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.children?.[0]?.children?.[0]?.value).toBe('First.');
    expect(footnotes(parseMarkdown('Text.\n\n[^a]: Never referenced.\n')).notes).toEqual([]);
  });

  it('reads any depth of nesting without the call stack', () => {
    // Built by hand, past the parser's limit: the walk keeps its own stack.
    let node: MdNode = { type: 'paragraph', children: [{ type: 'text', value: 'x' }] };
    for (let i = 0; i < 100_000; i++) node = { type: 'blockquote', children: [node] };
    const root: MdNode = { type: 'root', children: [node] };
    expect(footnotes(root).notes).toEqual([]);
  });
});
