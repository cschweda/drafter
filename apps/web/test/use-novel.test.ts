import { history, redo, undo } from '@codemirror/commands';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { setMarkdownMeta } from '@drafter/markdown';
import { MAX_SYNOPSIS, novelStructure, readFacts } from '@drafter/novel';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShallowRef } from 'vue';
import * as carryModule from '../app/novel/carry';

// The Outline's model for a novel (Novel plan, Task 5): its edits are one transaction and one undo
// step each, and a novel's facts follow their headings through any edit, in the same transaction.
// The editor is a stand-in over a real EditorState, with history and the carrying filter.

const env = vi.hoisted(() => ({
  view: null as unknown as {
    state: EditorState;
    dispatch(spec: TransactionSpec): void;
  },
  refs: {} as Record<'kind' | 'novel' | 'locked', ShallowRef<unknown>>,
  changeListeners: new Set<(changes: unknown) => void>(),
  goto: vi.fn(),
  /** The carrying module the session under test imports (each test imports it afresh). */
  carry: null as unknown as typeof import('../app/novel/carry'),
}));

vi.mock('../app/editor/session', () => ({
  useEditor: () => ({
    view: env.view,
    kind: env.refs.kind,
    novel: env.refs.novel,
    locked: env.refs.locked,
    goto: env.goto,
    onChange: (listener: (changes: unknown) => void) => {
      env.changeListeners.add(listener);
      return () => env.changeListeners.delete(listener);
    },
  }),
}));
vi.mock('../app/storage/script', async () => {
  const { ref } = await import('vue');
  return { useScript: () => ({ fileLocked: ref(false) }) };
});

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
    '# The Night Watch',
    '',
    'Ninety-one steps.',
    '',
  ].join('\n'),
  {
    template: 'novel',
    novel: {
      nodes: {
        'chapter:the-salt-road:0': { status: 'draft', synopsis: 'The bottle.' },
        'section:what-the-sand-kept:0': { status: 'todo' },
      },
    },
  },
);

function makeState(text: string, structure = novelStructure) {
  return EditorState.create({
    doc: text,
    extensions: [history(), env.carry.carryNovelFacts({ active: () => true, structure })],
  });
}

function stand(text: string) {
  env.view = {
    state: makeState(text),
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },
  };
}

const text = () => env.view.state.doc.toString();
const cmd = (run: typeof undo) =>
  run({ state: env.view.state, dispatch: (tr) => env.view.dispatch(tr) });

beforeEach(async () => {
  vi.resetModules();
  const { shallowRef } = await import('vue');
  env.refs = { kind: shallowRef('markdown'), novel: shallowRef(true), locked: shallowRef(false) };
  env.changeListeners.clear();
  env.goto.mockReset();
  // The same module as the session's, so its edits carry the same annotation the filter skips.
  env.carry = await import('../app/novel/carry');
  stand(BOOK);
});

async function session() {
  const { useNovel } = await import('../app/novel/use-novel');
  return useNovel();
}

describe('useNovel', () => {
  test('reads the tree and the facts', async () => {
    const novel = await session();
    expect(novel.tree.value?.nodes.map((n) => n.title)).toEqual([
      'The Salt Road',
      'The Night Watch',
    ]);
    expect(novel.facts.value.nodes['chapter:the-salt-road:0']).toEqual({
      status: 'draft',
      synopsis: 'The bottle.',
    });
  });

  test('setting a status writes the meta in one undo step, and Undo takes it back', async () => {
    const novel = await session();
    novel.setFacts('chapter:the-night-watch:0', { status: 'revised' });
    expect(readFacts(text()).nodes['chapter:the-night-watch:0']).toEqual({ status: 'revised' });
    expect(text().startsWith(BOOK.slice(0, BOOK.indexOf('<!--')))).toBe(true);
    expect(novel.facts.value.nodes['chapter:the-night-watch:0']).toEqual({ status: 'revised' });
    cmd(undo);
    expect(text()).toBe(BOOK);
    cmd(redo);
    expect(readFacts(text()).nodes['chapter:the-night-watch:0']).toEqual({ status: 'revised' });
  });

  test('setting the book target writes the meta in one undo step, and 0 or none clears it', async () => {
    const novel = await session();
    novel.setBookTarget(90_000);
    expect(readFacts(text()).bookTarget).toBe(90_000);
    expect(novel.facts.value.bookTarget).toBe(90_000);
    // The other facts and the text are left alone.
    expect(readFacts(text()).nodes['chapter:the-salt-road:0']?.status).toBe('draft');
    expect(text().startsWith(BOOK.slice(0, BOOK.indexOf('<!--')))).toBe(true);
    cmd(undo);
    expect(text()).toBe(BOOK);
    cmd(redo);
    expect(readFacts(text()).bookTarget).toBe(90_000);
    novel.setBookTarget(null);
    expect(readFacts(text()).bookTarget).toBeUndefined();
    expect(novel.facts.value.bookTarget).toBeUndefined();
    cmd(undo);
    expect(readFacts(text()).bookTarget).toBe(90_000);
  });

  test('a book target is not set while the editor is locked', async () => {
    const novel = await session();
    env.refs.locked.value = true;
    novel.setBookTarget(5);
    expect(text()).toBe(BOOK);
  });

  test('a synopsis is written no longer than the package keeps, never half a surrogate pair', async () => {
    const novel = await session();
    novel.setFacts('chapter:the-night-watch:0', { synopsis: 'x'.repeat(5000) });
    expect(readFacts(text()).nodes['chapter:the-night-watch:0']?.synopsis).toBe(
      'x'.repeat(MAX_SYNOPSIS),
    );
    const { capSynopsis } = await import('../app/novel/use-novel');
    expect(capSynopsis('short')).toBe('short');
    // An emoji that would be cut in half at the limit is left out whole.
    const long = `${'x'.repeat(MAX_SYNOPSIS - 1)}😀`;
    expect(capSynopsis(long)).toBe('x'.repeat(MAX_SYNOPSIS - 1));
  });

  test('a locked novel says so, in a novel’s words', async () => {
    const novel = await session();
    env.refs.locked.value = true;
    expect(novel.readOnly()).toBe('This novel is open for editing in another tab.');
  });

  test('empty facts take a node’s facts away', async () => {
    const novel = await session();
    novel.setFacts('section:what-the-sand-kept:0', {});
    expect(readFacts(text()).nodes['section:what-the-sand-kept:0']).toBeUndefined();
  });

  test('a move carries the text and the facts in one undo step, the comment last', async () => {
    const novel = await session();
    expect(novel.move('section:what-the-sand-kept:0', { into: 'chapter:the-night-watch:0' })).toBe(
      true,
    );
    const after = text();
    expect(after.indexOf('## What the Sand Kept')).toBeGreaterThan(
      after.indexOf('# The Night Watch'),
    );
    expect(readFacts(after).nodes['section:what-the-sand-kept:0']).toEqual({ status: 'todo' });
    expect(after.trimEnd().endsWith('-->')).toBe(true);
    expect(novel.moved.value).toBe('section:what-the-sand-kept:0');
    // The lines are the same lines, in another order.
    expect(after.split('\n').filter(Boolean).sort()).toEqual(
      BOOK.split('\n').filter(Boolean).sort(),
    );
    cmd(undo);
    expect(text()).toBe(BOOK);
  });

  test('a move whose ids renumber takes the facts with their headings', async () => {
    const book = setMarkdownMeta('# Again\n\nOne.\n\n# Again\n\nTwo.\n', {
      template: 'novel',
      novel: { nodes: { 'chapter:again:1': { synopsis: 'Second.' } } },
    });
    stand(book);
    const novel = await session();
    expect(novel.move('chapter:again:1', { before: 'chapter:again:0' })).toBe(true);
    expect(text().startsWith('# Again\n\nTwo.')).toBe(true);
    expect(readFacts(text()).nodes).toEqual({ 'chapter:again:0': { synopsis: 'Second.' } });
    expect(novel.moved.value).toBe('chapter:again:0');
    cmd(undo);
    expect(text()).toBe(book);
  });

  test('a move of the focused passage whose id renumbers keeps the focus on it (Task 7)', async () => {
    const book = setMarkdownMeta('# Again\n\nOne.\n\n# Again\n\nTwo.\n', { template: 'novel' });
    // The same focus module the session imports (each test imports them afresh).
    const focus = await import('../app/novel/focus');
    env.view = {
      state: EditorState.create({
        doc: book,
        extensions: [
          history(),
          env.carry.carryNovelFacts({ active: () => true }),
          focus.passageFocusExtension(),
        ],
      }),
      dispatch(spec) {
        this.state = this.state.update(spec).state;
      },
    };
    const novel = await session();
    focus.focusPassage(env.view as unknown as EditorView, 'chapter:again:1');
    expect(env.view.state.field(focus.passageFocus)).toBe('chapter:again:1');
    expect(novel.move('chapter:again:1', { before: 'chapter:again:0' })).toBe(true);
    expect(text().startsWith('# Again\n\nTwo.')).toBe(true);
    // Renumbered to :0, and still the passage that says "Two.".
    expect(env.view.state.field(focus.passageFocus)).toBe('chapter:again:0');
    const passage = focus.focusedPassage(env.view.state);
    expect(text().slice(passage?.from, passage?.to)).toBe('# Again\n\nTwo.\n\n');
    expect(focus.focusRanges(env.view.state)).toEqual([
      { from: passage?.to, to: text().indexOf('<!-- drafter') },
    ]);
    // The cursor came with it.
    const head = env.view.state.selection.main.head;
    expect(head >= (passage?.from ?? 0) && head < (passage?.to ?? 0)).toBe(true);
  });

  test('an illegal move changes nothing', async () => {
    const novel = await session();
    expect(novel.move('chapter:the-salt-road:0', { into: 'section:low-tide:0' })).toBe(false);
    expect(text()).toBe(BOOK);
  });

  test('a locked editor changes nothing', async () => {
    const novel = await session();
    env.refs.locked.value = true;
    novel.setFacts('chapter:the-night-watch:0', { status: 'done' });
    expect(novel.move('chapter:the-night-watch:0', { before: 'chapter:the-salt-road:0' })).toBe(
      false,
    );
    expect(text()).toBe(BOOK);
  });

  test('goto goes to the heading', async () => {
    const novel = await session();
    novel.goto('chapter:the-night-watch:0');
    expect(env.goto).toHaveBeenCalledWith(BOOK.indexOf('# The Night Watch'));
  });

  test('a plain Markdown document has no tree', async () => {
    env.refs.novel.value = false;
    const novel = await session();
    expect(novel.tree.value).toBeNull();
  });
});

describe('facts follow their headings', () => {
  const at = (doc: string, find: string) => doc.indexOf(find);

  test('renaming a heading carries its facts, and one undo takes both back', () => {
    let state = makeState(BOOK);
    const from = at(BOOK, 'Salt Road');
    state = state.update({
      changes: { from, to: from + 'Salt Road'.length, insert: 'Tide Road' },
    }).state;
    const facts = readFacts(state.doc.toString()).nodes;
    expect(facts['chapter:the-tide-road:0']).toEqual({ status: 'draft', synopsis: 'The bottle.' });
    expect(facts['chapter:the-salt-road:0']).toBeUndefined();
    const undone = undo({ state, dispatch: (tr) => (state = tr.state) });
    expect(undone).toBe(true);
    expect(state.doc.toString()).toBe(BOOK);
  });

  test('a new heading with the same name before it keeps the facts on theirs', () => {
    let state = makeState(BOOK);
    state = state.update({ changes: { from: 0, insert: '# The Salt Road\n\nEarlier.\n\n' } }).state;
    const facts = readFacts(state.doc.toString()).nodes;
    expect(facts['chapter:the-salt-road:1']).toEqual({ status: 'draft', synopsis: 'The bottle.' });
    expect(facts['chapter:the-salt-road:0']).toBeUndefined();
  });

  test('typing in a paragraph keeps facts without reading the structure', () => {
    const structure = vi.fn(novelStructure);
    let state = makeState(BOOK, structure);
    const from = at(BOOK, 'The tide went out.') + 3;
    const tr = state.update({ changes: { from, insert: ' grey' } });
    expect(carryModule.touchesStructure(tr)).toBe(false);
    state = tr.state;
    let end = at(state.doc.toString(), 'A bottle.') + 'A bottle'.length;
    for (const letter of ' and more') {
      state = state.update({ changes: { from: end, insert: letter } }).state;
      end++;
    }
    expect(state.doc.toString()).toContain('A bottle and more.');
    expect(structure).not.toHaveBeenCalled();
    expect(readFacts(state.doc.toString())).toEqual(readFacts(BOOK));
  });

  test('a line that could be structure is read, the paragraph before an underline too', () => {
    const state = makeState('# A\n\nOne line\nanother\n---\n\nText.\n');
    const typed = (pos: number, insert: string) => state.update({ changes: { from: pos, insert } });
    expect(carryModule.touchesStructure(typed(0, 'x'))).toBe(true);
    // In the first line of a paragraph that a `---` underlines: its title.
    expect(carryModule.touchesStructure(typed(6, 'x'))).toBe(true);
    // In a paragraph that ends at a blank line.
    expect(
      carryModule.touchesStructure(typed('# A\n\nOne line\nanother\n---\n\nT'.length, 'x')),
    ).toBe(false);
    // A scene break typed.
    expect(carryModule.touchesStructure(typed(state.doc.length, '\n***'))).toBe(true);
    // A code fence typed, which hides the headings after it.
    expect(carryModule.touchesStructure(typed(4, '```'))).toBe(true);
  });

  test('the structure read for an edit serves the document after its facts are written', () => {
    const structure = vi.fn(novelStructure);
    let state = makeState(BOOK, structure);
    const from = at(BOOK, '# The Salt Road');
    state = state.update({ changes: { from: from + 2, to: from + 5, insert: 'A' } }).state;
    // The heading's id changed, so its facts were rewritten under the new id in the same step.
    expect(Object.keys(readFacts(state.doc.toString()).nodes)).toContain('chapter:a-salt-road:0');
    const reads = structure.mock.calls.length;
    const cached = env.carry.structureOf(state.doc, state.doc.toString(), structure);
    expect(structure.mock.calls.length).toBe(reads);
    expect(cached).toEqual(novelStructure(state.doc.toString()));
  });

  test('an edit to the comment itself is left as it is', () => {
    let state = makeState(BOOK);
    const from = at(BOOK, '# The Salt Road');
    const comment = BOOK.indexOf('<!--');
    // Renames a heading and writes the comment in one edit: the comment says what the facts are.
    state = state.update({
      changes: [
        { from: from + 2, to: from + 5, insert: 'A' },
        { from: comment, to: BOOK.length, insert: '<!-- drafter {"template":"novel"} -->\n' },
      ],
    }).state;
    expect(state.doc.toString().endsWith('<!-- drafter {"template":"novel"} -->\n')).toBe(true);
  });

  test('a plain Markdown document is never read', () => {
    const structure = vi.fn(novelStructure);
    const plain = '# One\n\nText.\n';
    let state = makeState(plain, structure);
    state = state.update({ changes: { from: 2, insert: 'x' } }).state;
    expect(structure).not.toHaveBeenCalled();
    expect(state.doc.toString()).toBe('# xOne\n\nText.\n');
  });
});

describe("the novel Outline's words", () => {
  test('a row is named in words, and the bar counts chapters, sections, and words', async () => {
    const { nodeName, novelSummary } = await import('../app/novel/labels');
    const tree = novelStructure(BOOK);
    const [salt] = tree.nodes;
    if (!salt) throw new Error('no chapter');
    expect(nodeName(salt, { status: 'revised', target: 1200 })).toBe(
      `The Salt Road, chapter, ${salt.words} words, 1% of a 1,200-word target, Revised`,
    );
    const brk = novelStructure('# A\n\nOne.\n\n***\n\nTwo.\n').nodes[0]?.children[0];
    if (!brk) throw new Error('no break');
    expect(nodeName(brk, {})).toBe('Scene break, section, 1 word');
    expect(novelSummary(tree, null)).toBe(`2 chapters · 2 sections · ${tree.words} words`);
    expect(novelSummary(tree, 60000)).toMatch(/ · 0% of 60,000$/);
    expect(novelSummary(null, null)).toBe('');
  });
});
