import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { expect, test } from 'vitest';
import { MAX_MARKS } from '../app/markdown/depth';
import { markdownMode } from '../app/markdown/editor';

// 160 KB of `*_` held CodeMirror's Markdown grammar for 14 seconds on the page's own thread, and
// Drafter reopens the last document, so the tab froze again on every reload (red/blue audit,
// 2026-11-03). Past MAX_MARKS in a paragraph, its marks are plain text, and the parse is quick.

/** The names of the nodes in `state`'s whole tree, parsed to the end within `ms`. */
function parsed(doc: string, ms: number) {
  const state = EditorState.create({ doc, extensions: [markdownMode()] });
  const start = performance.now();
  const tree = ensureSyntaxTree(state, state.doc.length, ms) ?? syntaxTree(state);
  const took = performance.now() - start;
  const names = new Set<string>();
  tree.iterate({ enter: (node) => void names.add(node.name) });
  return { took, names, whole: tree.length === state.doc.length };
}

test('a paragraph of 160 KB of emphasis marks parses at once, as plain text', () => {
  const { took, names, whole } = parsed('*_'.repeat(80_000), 20_000);
  expect(whole).toBe(true);
  expect(took).toBeLessThan(2000);
  expect(names.has('Emphasis')).toBe(false);
});

test('an ordinary paragraph keeps its emphasis, and so does one just under the limit', () => {
  expect(parsed('Some *words* and **more**.\n', 1000).names.has('Emphasis')).toBe(true);
  expect(parsed('Some **strong** words.\n', 1000).names.has('StrongEmphasis')).toBe(true);
  const near = `${'a*b* '.repeat(MAX_MARKS / 2)}\n`;
  expect(parsed(near, 10_000).names.has('Emphasis')).toBe(true);
});

test('another paragraph after a dense one is still highlighted', () => {
  const { names } = parsed(`${'*_'.repeat(80_000)}\n\nA *quiet* line.\n`, 20_000);
  expect(names.has('Emphasis')).toBe(true);
});

// Red/blue audit of 23 November 2026 (W2): the same grammar still took the square of a paragraph's
// length on a long run of spaces (each one looked ahead for a line break) and on brackets.
test.each([
  ['a long run of spaces', (n: number) => `a${' '.repeat(n)}b\n`],
  ['unclosed links', (n: number) => '[a]('.repeat(n / 4)],
  ['open brackets, then closing ones', (n: number) => `${'['.repeat(n / 2)}${']'.repeat(n / 2)}`],
  ['bracketed words', (n: number) => '[a] '.repeat(n / 4)],
])('a paragraph of 160 KB of %s parses at once', (_name, make) => {
  const { took, whole } = parsed(make(160_000), 30_000);
  expect(whole).toBe(true);
  expect(took).toBeLessThan(3000);
});

// The audit of that audit: an HTML opener that never closes looked to the paragraph's end each
// time, and 1.3 MB of them held the page for half a minute.
test.each([
  ['processing instructions that never close', 'x <? '],
  ['declarations that never close', 'x <!A '],
])('a paragraph of 640 KB of %s parses at once', (_name, unit) => {
  const { took, whole } = parsed(unit.repeat(640_000 / unit.length), 60_000);
  expect(whole).toBe(true);
  expect(took).toBeLessThan(3000);
});

test('a few hundred such openers in a very long paragraph parse at once too', () => {
  const { took, whole } = parsed(`${'word '.repeat(120_000)}${'x <!A '.repeat(900)}`, 60_000);
  expect(whole).toBe(true);
  expect(took).toBeLessThan(3000);
});

test('an ordinary paragraph keeps its links and its line breaks', () => {
  const { names } = parsed('A [link](https://example.com) and a break,  \nthen more.\n', 1000);
  expect(names.has('Link')).toBe(true);
  expect(names.has('HardBreak')).toBe(true);
});
