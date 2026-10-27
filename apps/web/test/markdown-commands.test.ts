import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import {
  EditorSelection,
  EditorState,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { MARKDOWN_COMMANDS, type MarkdownAction, markdownElement } from '../app/markdown/commands';

// The element bar's Markdown buttons (docs/drafter-element-bar-design.md §5): the marks for a
// heading, emphasis, a list, a quote, a link, and code, each one undo step.

/** A state from text with the cursor at `|`, or a selection in `[ ]`. */
function stateOf(marked: string, extensions = [markdown({ base: commonmarkLanguage })]) {
  const bar = marked.indexOf('|');
  const open = marked.indexOf('[');
  const close = marked.indexOf(']', open);
  let doc = marked;
  let selection = EditorSelection.single(marked.length);
  if (bar !== -1) {
    doc = marked.slice(0, bar) + marked.slice(bar + 1);
    selection = EditorSelection.single(bar);
  } else if (open !== -1 && close !== -1) {
    doc = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    selection = EditorSelection.single(open, close - 1);
  }
  return EditorState.create({ doc, selection, extensions });
}

function render(state: EditorState): string {
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`;
}

function press(state: EditorState, command: StateCommand) {
  const transactions: Transaction[] = [];
  const handled = command({ state, dispatch: (tr) => transactions.push(tr) });
  return { handled, transactions, state: transactions.at(-1)?.state ?? state };
}

function rows(action: MarkdownAction, table: Array<[string, string]>) {
  for (const [before, after] of table) {
    test(`${action} turns ${JSON.stringify(before)} into ${JSON.stringify(after)}`, () => {
      expect(render(press(stateOf(before), MARKDOWN_COMMANDS[action]).state)).toBe(after);
    });
  }
}

describe('the Markdown commands', () => {
  rows('heading', [
    ['Intro|', '# Intro|'],
    ['# Intro|', '## Intro|'],
    ['## Intro|', '### Intro|'],
    ['### Intro|', '#### Intro|'],
    // Past the sixth level it goes back to a paragraph.
    ['###### Intro|', 'Intro|'],
    ['|', '# |'],
    ['- item|', '# item|'],
    // Several lines all go to the level after the first line's, so they end up alike.
    ['[# a\n### b]', '[## a\n## b]'],
  ]);
  rows('bold', [
    ['a [word] b', 'a **[word]** b'],
    ['a |', 'a **|**'],
  ]);
  rows('italic', [['a [word] b', 'a *[word]* b']]);
  rows('code', [
    ['a [x] b', 'a `[x]` b'],
    ['|', '`|`'],
  ]);
  rows('list', [
    ['one|', '- one|'],
    ['- one|', 'one|'],
    ['1. one|', '- one|'],
    ['[one\ntwo]', '[- one\n- two]'],
    ['[- one\n- two]', '[one\ntwo]'],
    ['|', '- |'],
  ]);
  rows('numbered', [
    ['one|', '1. one|'],
    ['[one\ntwo\nthree]', '[1. one\n2. two\n3. three]'],
    ['[1. one\n2. two]', '[one\ntwo]'],
    ['- one|', '1. one|'],
  ]);
  rows('quote', [
    ['Said so.|', '> Said so.|'],
    ['> Said so.|', 'Said so.|'],
    ['[a\nb]', '[> a\n> b]'],
  ]);
  rows('link', [
    ['see [the site] now', 'see [the site](|) now'],
    ['see |', 'see [|]()'],
  ]);

  test('are each one undo step', () => {
    for (const action of Object.keys(MARKDOWN_COMMANDS) as MarkdownAction[]) {
      const state = stateOf('[one\ntwo]');
      const { handled, transactions } = press(state, MARKDOWN_COMMANDS[action]);
      expect(handled, action).toBe(true);
      expect(transactions, action).toHaveLength(1);
      const tr = transactions[0] as Transaction;
      expect(tr.changes.invert(state.doc).apply(tr.newDoc).toString(), action).toBe('one\ntwo');
    }
  });

  test('do nothing in a read-only editor', () => {
    for (const action of Object.keys(MARKDOWN_COMMANDS) as MarkdownAction[]) {
      const state = stateOf('one|', [EditorState.readOnly.of(true)]);
      expect(press(state, MARKDOWN_COMMANDS[action]).handled, action).toBe(false);
    }
  });
});

describe('markdownElement', () => {
  const name = (marked: string) => markdownElement(stateOf(marked));

  test('names the element of the cursor’s line', () => {
    expect(name('# Title|')).toBe('Heading 1');
    expect(name('Intro\n\n## Part|')).toBe('Heading 2');
    expect(name('Some text|')).toBe('Paragraph');
    expect(name('- one|')).toBe('List item');
    expect(name('1. one|')).toBe('Numbered list item');
    expect(name('> said|')).toBe('Quote');
    expect(name('```\ncode|\n```')).toBe('Code block');
  });

  test('names nothing on a blank line', () => {
    expect(name('Intro\n|\nMore')).toBeNull();
  });
});
