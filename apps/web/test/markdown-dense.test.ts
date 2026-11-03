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
