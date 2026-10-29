// @vitest-environment jsdom
import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  parsedDoc,
  type SpellMark,
  setSpellMarks,
  spellMarks,
  spellMarksOf,
} from '@drafter/cm-fountain';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { shallowRef } from 'vue';

// The spelling menu's actions (Plan D, Task 5) on a real view with the marks in it: what each
// changes, in how many undo steps, and what it says. Every word here is invented.

const mocks = vi.hoisted(() => ({
  said: [] as string[],
  suggest: (_word: string): Promise<string[]> => Promise.resolve([]),
  mine: null as unknown as { value: { personalDictionary: readonly string[] } },
  set: vi.fn(),
}));
vi.mock('../app/outline/notice', () => ({
  sayOutline: (message: string) => {
    mocks.said.push(message);
    return Promise.resolve();
  },
}));
vi.mock('../app/spell/use-spell', () => ({
  useSpell: () => ({ suggest: (word: string) => mocks.suggest(word) }),
}));
vi.mock('../app/settings/settings', () => ({
  useSettings: () => ({
    settings: mocks.mine,
    set: (key: string, value: unknown) => {
      mocks.set(key, value);
      mocks.mine.value = { ...mocks.mine.value, [key]: value as readonly string[] };
      return Promise.resolve();
    },
  }),
}));

const {
  replaceWord,
  addToScript,
  tryAddToScript,
  addToMine,
  ignoreWordHere,
  whyNot,
  stepMisspelling,
} = await import('../app/spell/actions');
const { spellMarkHistory } = await import('../app/editor/extensions');

// jsdom has no layout; CodeMirror's measuring asks a range for its rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const views: EditorView[] = [];
beforeEach(() => {
  mocks.said = [];
  mocks.suggest = () => Promise.resolve([]);
  mocks.mine = shallowRef({ personalDictionary: [] as readonly string[] });
  mocks.set.mockClear();
});
afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.remove();
    view.destroy();
  }
});

/** Each `word`'s marks in `text`, in order, as the worker would send them. */
const marksOf = (text: string, ...words: string[]): SpellMark[] =>
  words
    .flatMap((word) =>
      [...text.matchAll(new RegExp(word.replaceAll('*', '\\*'), 'gi'))].map((m) => ({
        from: m.index,
        to: m.index + m[0].length,
        word: m[0].replaceAll('*', ''),
      })),
    )
    .sort((a, b) => a.from - b.from);

/** A view of `text` with these marks, its undo history, and a count of its transactions. */
function viewOf(text: string, marks: SpellMark[], options: { readOnly?: boolean } = {}) {
  const seen: Transaction[] = [];
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [
        parsedDoc,
        spellMarks(),
        history(),
        spellMarkHistory,
        EditorState.readOnly.of(options.readOnly ?? false),
        EditorView.updateListener.of((u) => seen.push(...u.transactions)),
      ],
    }),
  });
  document.body.append(view.dom);
  views.push(view);
  view.dispatch({ effects: setSpellMarks.of(marks) });
  seen.length = 0;
  return { view, seen };
}

const words = (view: EditorView) => spellMarksOf(view.state).map((m) => m.word);

const TEXT = 'INT. HALL - DAY\n\nThe phnoe rings. Phnoe again. Then the drowr.\n';
const META = '/* drafter\n{"v":1,"template":"screenplay"}\n*/\n';

describe('the spelling actions', () => {
  test('replaces a word in one undo', () => {
    const marks = marksOf(TEXT, 'phnoe', 'drowr');
    const { view, seen } = viewOf(TEXT, marks);
    const first = marks[0] as SpellMark;
    expect(replaceWord(view, first, 'phone')).toBe(true);
    expect(view.state.doc.toString()).toBe(TEXT.replace('phnoe', 'phone'));
    expect(seen).toHaveLength(1);
    // The cursor is after the word, and the word's mark is gone; the others stay.
    expect(view.state.selection.main.head).toBe(first.from + 'phone'.length);
    expect(words(view)).toEqual(['Phnoe', 'drowr']);
    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe(TEXT);
  });

  test('replaces a word with a * inside it whole, and changes nothing for a mark that has gone', () => {
    const text = 'INT. HALL - DAY\n\nIt was un*believ*eable.\n';
    const [mark] = marksOf(text, 'un*believ*eable') as [SpellMark];
    expect(mark.word).toBe('unbelieveable');
    const { view } = viewOf(text, [mark]);
    expect(replaceWord(view, mark, 'unbelievable')).toBe(true);
    expect(view.state.doc.toString()).toBe('INT. HALL - DAY\n\nIt was unbelievable.\n');
    // The mark went with the word.
    expect(replaceWord(view, mark, 'unbelievable')).toBe(false);
    expect(view.state.doc.toString()).toBe('INT. HALL - DAY\n\nIt was unbelievable.\n');
  });

  test('adds a word to the script’s dictionary in one undo, unflagged at once', () => {
    const text = `${TEXT}\n${META}`;
    const marks = marksOf(text, 'phnoe', 'drowr');
    const { view, seen } = viewOf(text, marks);
    expect(addToScript(view, 'phnoe', 'fountain')).toBe(true);
    // One transaction: the metadata block holds the word, and keeps what it had.
    expect(seen).toHaveLength(1);
    expect(view.state.field(parsedDoc).meta).toEqual({
      v: 1,
      template: 'screenplay',
      dictionary: ['phnoe'],
    });
    // Every case of the word is unmarked in that transaction, before any check.
    expect(words(view)).toEqual(['drowr']);
    expect(mocks.said).toEqual(['Added “phnoe” to this script’s dictionary.']);
    // One undo takes the word out of the block and puts both marks back.
    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe(text);
    expect(words(view)).toEqual(['phnoe', 'Phnoe', 'drowr']);
  });

  test('says what stopped Add to this script’s dictionary, as the menu and the command run it', () => {
    const md = '# Notes\n\nThe phnoe rings.\n';
    const { view: markdown } = viewOf(md, marksOf(md, 'phnoe'));
    tryAddToScript(markdown, 'phnoe', 'markdown', null);
    expect(mocks.said.pop()).toMatch(/Markdown/);
    const { view } = viewOf(TEXT, marksOf(TEXT, 'phnoe'));
    tryAddToScript(view, 'phnoe', 'fountain', null);
    expect(mocks.said.pop()).toBe('Added “phnoe” to this script’s dictionary.');
    tryAddToScript(view, 'Phnoe', 'fountain', null);
    expect(mocks.said.pop()).toBe('“Phnoe” is in this script’s dictionary already.');
    expect(view.state.field(parsedDoc).meta?.dictionary).toEqual(['phnoe']);
  });

  test('adds a possessive to a dictionary as its word, and unmarks both', () => {
    const text = 'INT. HALL - DAY\n\nQuorravel’s coat. Quorravel waits.\n';
    const marks = [
      { from: 17, to: 28, word: "Quorravel's" },
      { from: 35, to: 44, word: 'Quorravel' },
    ];
    expect(text.slice(17, 28)).toBe('Quorravel’s');
    const { view } = viewOf(text, marks);
    expect(addToScript(view, "Quorravel's", 'fountain')).toBe(true);
    expect(view.state.field(parsedDoc).meta?.dictionary).toEqual(['Quorravel']);
    expect(words(view)).toEqual([]);
  });

  test('says why the script’s dictionary can’t be written', () => {
    // An unclosed /*: the block's own */ would close it.
    const stray = 'INT. HALL - DAY\n\nThe phnoe rings.\n\n/* unfinished\n';
    const { view: open } = viewOf(stray, marksOf(stray, 'phnoe'));
    expect(whyNot(open, 'add-to-script', 'fountain', null)).toMatch(/\/\* .*isn’t closed/);
    expect(whyNot(open, 'replace', 'fountain', null)).toBeNull();
    expect(addToScript(open, 'phnoe', 'fountain')).toBe(false);
    expect(open.state.doc.toString()).toBe(stray);
    expect(words(open)).toEqual(['phnoe']);

    // A Markdown document has no metadata block.
    const md = '# Notes\n\nThe phnoe rings.\n';
    const { view: markdown } = viewOf(md, marksOf(md, 'phnoe'));
    expect(whyNot(markdown, 'add-to-script', 'markdown', null)).toMatch(/Markdown/);
    expect(whyNot(markdown, 'replace', 'markdown', null)).toBeNull();
    expect(addToScript(markdown, 'phnoe', 'markdown')).toBe(false);
    expect(markdown.state.doc.toString()).toBe(md);

    // A read-only tab: the reason it's given, for both; the editor's own read-only state too.
    const why = 'This script is open for editing in another tab.';
    const { view: locked } = viewOf(TEXT, marksOf(TEXT, 'phnoe'), { readOnly: true });
    expect(whyNot(locked, 'replace', 'fountain', why)).toBe(why);
    expect(whyNot(locked, 'add-to-script', 'fountain', why)).toBe(why);
    expect(whyNot(locked, 'replace', 'fountain', null)).toMatch(/can’t edit/);
    expect(replaceWord(locked, marksOf(TEXT, 'phnoe')[0] as SpellMark, 'phone')).toBe(false);
    expect(addToScript(locked, 'phnoe', 'fountain')).toBe(false);
    expect(locked.state.doc.toString()).toBe(TEXT);
    expect(words(locked)).toEqual(['phnoe', 'Phnoe']);
  });

  test('adds to my dictionary and unflags the word', async () => {
    const marks = marksOf(TEXT, 'phnoe', 'drowr');
    const { view } = viewOf(TEXT, marks, { readOnly: true });
    // My dictionary isn't in the file, so a read-only tab can add to it.
    await addToMine(view, 'Phnoe');
    expect(mocks.set).toHaveBeenCalledWith('personalDictionary', ['Phnoe']);
    expect(words(view)).toEqual(['drowr']);
    expect(view.state.doc.toString()).toBe(TEXT);
    expect(undoDepth(view.state)).toBe(0);
    expect(mocks.said).toEqual(['Added “Phnoe” to My dictionary.']);
    // A word it has already, in any case, isn't added twice.
    await addToMine(view, 'DROWR');
    // Two checks since (the first answers the text as it was), each marking the words again.
    view.dispatch({ effects: setSpellMarks.of([]) });
    view.dispatch({ effects: setSpellMarks.of(marks) });
    expect(words(view)).toEqual(['phnoe', 'Phnoe', 'drowr']);
    await addToMine(view, 'phnoe');
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.mine.value.personalDictionary).toEqual(['Phnoe', 'DROWR']);
    expect(words(view)).toEqual(['drowr']);
  });

  test('ignores one occurrence, and the next is still marked', () => {
    const marks = marksOf(TEXT, 'phnoe');
    const { view } = viewOf(TEXT, marks, { readOnly: true });
    ignoreWordHere(view, marks[0] as SpellMark);
    expect(spellMarksOf(view.state)).toEqual([marks[1]]);
    expect(view.state.doc.toString()).toBe(TEXT);
    expect(undoDepth(view.state)).toBe(0);
  });

  test('steps to the next and previous misspelling, wrapping, and says the word and its first suggestion', async () => {
    const text = 'INT. HALL - DAY\n\nThe phnoe and the un*believ*eable drowr.\n';
    const marks = marksOf(text, 'phnoe', 'un*believ*eable', 'drowr');
    const asked: string[] = [];
    mocks.suggest = (word) => {
      asked.push(word);
      return Promise.resolve(word === 'drowr' ? [] : [word === 'phnoe' ? 'phone' : 'unbelievable']);
    };
    const { view } = viewOf(text, marks);
    const selected = () => {
      const { from, to } = view.state.selection.main;
      return text.slice(from, to);
    };
    expect(await stepMisspelling(view, 1)).toBe(true);
    expect(selected()).toBe('phnoe');
    expect(await stepMisspelling(view, 1)).toBe(true);
    expect(selected()).toBe('un*believ*eable');
    expect(await stepMisspelling(view, 1)).toBe(true);
    expect(selected()).toBe('drowr');
    expect(await stepMisspelling(view, 1)).toBe(true);
    expect(selected()).toBe('phnoe');
    expect(await stepMisspelling(view, -1)).toBe(true);
    expect(selected()).toBe('drowr');
    expect(await stepMisspelling(view, -1)).toBe(true);
    expect(selected()).toBe('un*believ*eable');
    // The word as the checker read it: without the emphasis marks inside it.
    expect(asked.slice(0, 3)).toEqual(['phnoe', 'unbelieveable', 'drowr']);
    expect(mocks.said.slice(0, 3)).toEqual([
      'phnoe. Suggestion: phone.',
      'unbelieveable. Suggestion: unbelievable.',
      'drowr. No suggestions.',
    ]);

    const { view: clean } = viewOf(text, []);
    expect(await stepMisspelling(clean, 1)).toBe(false);
    expect(clean.state.selection.main.head).toBe(0);
  });
});
