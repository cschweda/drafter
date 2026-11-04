// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { savedText } from '@drafter/cm-fountain';
import { setMarkdownMeta } from '@drafter/markdown';
import * as novel from '@drafter/novel';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseMarkdown } from '../app/markdown/parse';
import type { MdNode } from '../app/markdown/render';
import { carryNovelFacts, novelFacts } from '../app/novel/carry';
import {
  focusedPassage,
  focusPassage,
  focusRanges,
  passageAt,
  passageFocus,
  passageFocusExtension,
  passageNumber,
  passageTree,
} from '../app/novel/focus';

// Focus on one chapter or one section (Novel plan, Task 7): the rest of the book is hidden, never
// removed, so what a save, a draft, a snapshot, and an export read is the whole book; the focus
// follows its passage through edits, and ends when its heading is deleted.

vi.mock('@drafter/novel', async (original) => {
  const real = await original<typeof import('@drafter/novel')>();
  return { ...real, novelStructure: vi.fn(real.novelStructure) };
});
const reads = vi.mocked(novel.novelStructure);

const BOOK = setMarkdownMeta(
  [
    '# The Salt Road',
    '',
    '## Low Tide',
    '',
    'The tide went out.',
    '',
    '## What the Sand Kept',
    '',
    'A bottle.',
    '',
    '# A Letter',
    '',
    'The page was wet.',
    '',
    '* * *',
    '',
    'A knock.',
    '',
    '# The Night Watch',
    '',
    'Ninety-one steps.',
    '',
  ].join('\n'),
  { template: 'novel', novel: { nodes: { 'chapter:a-letter:0': { status: 'draft' } } } },
);

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  view = undefined;
  reads.mockClear();
});

function make(text = BOOK) {
  view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [history(), carryNovelFacts({ active: () => true }), passageFocusExtension()],
    }),
  });
  return view;
}

const at = (text: string, find: string) => {
  const i = text.indexOf(find);
  if (i < 0) throw new Error(`no ${find}`);
  return i;
};
const tree = (v: EditorView) => novel.novelStructure(v.state.doc.toString());
const nodeOf = (v: EditorView, id: string) => novel.findNode(tree(v), id) as novel.NovelNode;
const metaOf = (text: string) => at(text, '<!-- drafter');
/** What focus hides when node `id` is focused in `v`'s text now. */
function expected(v: EditorView, id: string) {
  const text = v.state.doc.toString();
  const node = nodeOf(v, id);
  const out = [];
  if (node.span.from > 0) out.push({ from: 0, to: node.span.from });
  if (metaOf(text) > node.span.to) out.push({ from: node.span.to, to: metaOf(text) });
  return out;
}
const type = (v: EditorView, pos: number, insert: string) =>
  v.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
    userEvent: 'input.type',
  });

describe('focusPassage', () => {
  test('hides the rest of the book and leaves the document, a save, and a draft whole', () => {
    const v = make();
    v.dispatch({ selection: { anchor: at(BOOK, 'The page') } });
    const before = v.state.doc;
    focusPassage(v, 'chapter:a-letter:0');
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:0');
    expect(v.state.doc).toBe(before);
    expect(v.state.doc.toString()).toBe(BOOK);
    // A save writes `savedText`, and a draft (`draftSource`) and a snapshot read the same.
    expect(savedText(v.state).toString()).toBe(BOOK);
    const letter = nodeOf(v, 'chapter:a-letter:0');
    expect(focusRanges(v.state)).toEqual([
      { from: 0, to: letter.span.from },
      { from: letter.span.to, to: metaOf(BOOK) },
    ]);
    // What the Source draws: only the chapter, then the comment.
    const drawn = v.contentDOM.textContent ?? '';
    expect(drawn).toContain('# A Letter');
    expect(drawn).toContain('A knock.');
    expect(drawn).not.toContain('The Salt Road');
    expect(drawn).not.toContain('Ninety-one');
    // The cursor stayed where it was, in the passage.
    expect(v.state.selection.main.head).toBe(at(BOOK, 'The page'));

    focusPassage(v, null);
    expect(v.state.field(passageFocus)).toBeNull();
    expect(focusRanges(v.state)).toEqual([]);
    expect(v.contentDOM.textContent).toContain('The Salt Road');
    expect(v.state.doc.toString()).toBe(BOOK);
  });

  test('the draft path reads the whole book while a section is focused', async () => {
    const { draftSource } = await import('../app/drafts/use-drafts');
    const v = make();
    focusPassage(v, 'section:low-tide:0');
    expect(v.state.field(passageFocus)).toBe('section:low-tide:0');
    expect(draftSource(v.state)).toBe(BOOK);
    // A cursor outside the passage is put at the end of its heading.
    expect(v.state.selection.main.head).toBe(nodeOf(v, 'section:low-tide:0').heading.to);
  });

  test('an id that is not in the book focuses nothing', () => {
    const v = make();
    focusPassage(v, 'chapter:nowhere:0');
    expect(focusedPassage(v.state)).toBeNull();
  });
});

describe('the focus follows its passage', () => {
  test('typing in it moves the hidden ranges with it', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    type(v, at(BOOK, 'A knock.') + 'A knock.'.length, ' Then another, and another.');
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:0');
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter:0'));
    // Enter at the passage's last line, and a new paragraph in it.
    const end = nodeOf(v, 'chapter:a-letter:0').span.to - 1;
    type(v, end, '\n\nMore.');
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter:0'));
    expect(v.state.doc.toString()).toContain('another, and another.\n\n\nMore.\n# The Night Watch');
  });

  test('typing in an unfocused novel reads no structure', () => {
    const v = make();
    reads.mockClear();
    type(v, at(BOOK, 'A knock.'), 'Then ');
    expect(reads).not.toHaveBeenCalled();
  });

  test('typing a paragraph in a focused passage reads no structure either', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    reads.mockClear();
    type(v, at(BOOK, 'A knock.'), 'Then ');
    expect(reads).not.toHaveBeenCalled();
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter:0'));
  });

  test('renaming its heading follows the new id', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    type(v, at(BOOK, 'A Letter') + 'A Letter'.length, ' in Another Hand');
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter-in-another-hand:0');
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter-in-another-hand:0'));
  });

  test('a heading of the same name put before it renumbers it, and the focus follows', () => {
    const text = BOOK.replace('# The Night Watch', '# A Letter\n\nAnother.\n\n# The Night Watch');
    const v = make(text);
    focusPassage(v, 'chapter:a-letter:1');
    // The Outline's kind of edit, before the passage: a chapter of the same name at the start.
    v.dispatch({
      changes: { from: 0, insert: '# A Letter\n\nFirst.\n\n' },
      annotations: [Transaction.addToHistory.of(true), novelFacts.of(true)],
    });
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:2');
    expect(nodeOf(v, 'chapter:a-letter:2').children).toEqual([]);
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter:2'));
  });

  test('a move of the focused chapter in the Outline keeps the focus on it', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    const text = v.state.doc.toString();
    const done = novel.moveNode(text, novel.novelStructure(text), 'chapter:a-letter:0', {
      after: 'chapter:the-night-watch:0',
    });
    if (!done) throw new Error('no move');
    // As the Outline dispatches it (use-novel.ts): the cursor travels with the moved text.
    const head = done.mapPos(v.state.selection.main.head);
    v.dispatch({
      changes: done.changes,
      selection: { anchor: head },
      userEvent: 'input',
      annotations: [novelFacts.of(true)],
    });
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:0');
    expect(focusRanges(v.state)).toEqual(expected(v, 'chapter:a-letter:0'));
  });

  test('deleting its heading ends the focus, and the whole book shows (Review Focus 5)', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    const heading = nodeOf(v, 'chapter:a-letter:0').heading;
    v.dispatch({
      changes: { from: heading.from, to: heading.to + 1 },
      selection: { anchor: heading.from },
      userEvent: 'delete.selection',
    });
    expect(v.state.field(passageFocus)).toBeNull();
    expect(focusRanges(v.state)).toEqual([]);
    expect(v.contentDOM.textContent).toContain('The Salt Road');
    // Undo puts the heading back; the focus stays ended.
    undo(v);
    expect(v.state.doc.toString()).toBe(BOOK);
    expect(v.state.field(passageFocus)).toBeNull();
  });

  test('loading another text ends it', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    v.setState(EditorState.create({ doc: BOOK, extensions: passageFocusExtension() }));
    expect(v.state.field(passageFocus)).toBeNull();
  });
});

describe('the cursor stays in the passage', () => {
  test('a key or a click outside it is held to the passage', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    const letter = nodeOf(v, 'chapter:a-letter:0');
    v.dispatch({ selection: { anchor: 0 }, userEvent: 'select' });
    expect(v.state.selection.main.head).toBe(letter.span.from);
    v.dispatch({ selection: { anchor: BOOK.length }, userEvent: 'select.pointer' });
    expect(v.state.selection.main.head).toBe(letter.span.to - 1);
    // Select All selects the passage.
    v.dispatch({ selection: EditorSelection.single(0, BOOK.length), userEvent: 'select' });
    expect(v.state.selection.main).toMatchObject({
      from: letter.span.from,
      to: letter.span.to - 1,
    });
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:0');
  });

  test('a selection put outside it (a search match, Go to) ends the focus', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    v.dispatch({ selection: { anchor: at(BOOK, 'Ninety') }, userEvent: 'select.search' });
    expect(v.state.field(passageFocus)).toBeNull();
    focusPassage(v, 'chapter:a-letter:0');
    v.dispatch({ selection: { anchor: 3 } });
    expect(v.state.field(passageFocus)).toBeNull();
  });

  test('Backspace at its first character and Delete at its last change nothing', () => {
    const v = make();
    focusPassage(v, 'chapter:a-letter:0');
    const letter = nodeOf(v, 'chapter:a-letter:0');
    v.dispatch({
      changes: { from: letter.span.from - 1, to: letter.span.from },
      userEvent: 'delete.backward',
    });
    v.dispatch({
      changes: { from: letter.span.to - 1, to: letter.span.to },
      userEvent: 'delete.forward',
    });
    expect(v.state.doc.toString()).toBe(BOOK);
    expect(v.state.field(passageFocus)).toBe('chapter:a-letter:0');
  });
});

describe('the pieces the bar and the commands read', () => {
  test('passageAt finds the chapter and the section at the cursor', () => {
    const t = novel.novelStructure(BOOK);
    const pos = at(BOOK, 'A bottle');
    expect(passageAt(t, pos, 'chapter')?.id).toBe('chapter:the-salt-road:0');
    expect(passageAt(t, pos, 'section')?.id).toBe('section:what-the-sand-kept:0');
    expect(passageAt(t, at(BOOK, 'Ninety'), 'section')).toBeNull();
    // In the comment, nothing.
    expect(passageAt(t, metaOf(BOOK) + 3, 'chapter')).toBeNull();
  });

  test('passageNumber counts chapters in the book, sections in their chapter', () => {
    const t = novel.novelStructure(BOOK);
    expect(passageNumber(t, 'chapter:the-salt-road:0')).toBe(1);
    expect(passageNumber(t, 'chapter:the-night-watch:0')).toBe(3);
    expect(passageNumber(t, 'section:what-the-sand-kept:0')).toBe(2);
    expect(passageNumber(t, 'section::0')).toBe(1);
    expect(passageNumber(t, 'chapter:nowhere:0')).toBeNull();
  });

  test('passageTree keeps only the passage, and every note’s definition', () => {
    const text = BOOK.replace('A bottle.', 'A bottle.[^1]').replace(
      'Ninety-one steps.',
      'Ninety-one steps.\n\n[^1]: Green glass.',
    );
    const md = parseMarkdown(text) as MdNode;
    const t = novel.novelStructure(text);
    const passage = (id: string) => {
      const node = novel.findNode(t, id) as novel.NovelNode;
      return { id, from: node.span.from, to: node.span.to, meta: metaOf(text) };
    };
    const types = (root: MdNode) =>
      (root.children ?? []).map((n) => `${n.type}${n.depth ? n.depth : ''}`);
    expect(types(passageTree(md, passage('chapter:the-salt-road:0'), 'chapter'))).toEqual([
      'heading1',
      'heading2',
      'paragraph',
      'heading2',
      'paragraph',
      'footnoteDefinition',
    ]);
    expect(types(passageTree(md, passage('section:what-the-sand-kept:0'), 'section'))).toEqual([
      'heading2',
      'paragraph',
      'footnoteDefinition',
    ]);
    // A scene break's section runs to the chapter's end.
    expect(types(passageTree(md, passage('section::0'), 'section'))).toEqual([
      'thematicBreak',
      'paragraph',
      'footnoteDefinition',
    ]);
  });
});
