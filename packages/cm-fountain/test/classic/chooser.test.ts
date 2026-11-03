import { history, undo } from '@codemirror/commands';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  appChange,
  chooserItems,
  elementCommand,
  fountain,
  insertPageBreak,
  makeElement,
  openChooser,
  SCREENPLAY_STRUCTURE,
  structureOf,
} from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, test } from 'vitest';
import { classic, classicEdit, classicLine, classicTab, elementAt } from '../../src/classic';
import { seenSpace } from '../../src/classic/chooser';
import { setStored } from '../../src/classic/line';
import { apply, BOM, editor, run } from '../helpers';
import { classicEditor, render, type } from './harness';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

const PLAY = builtins['stage-play-standard'] as Template;
const PLAY_STRUCTURE = structureOf(PLAY);
const BLOCK = '/* drafter\n{"v":1,"template":"stage-play"}\n*/';

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

/** A view with Classic Mode on, as the keys reach it. */
function open(
  marked: string,
  { template, said }: { template?: Template; said?: string[] } = {},
): EditorView {
  const state = classicEditor(marked, {
    with: [history()],
    ...(template ? { template } : null),
    ...(said ? { say: (text: string) => said.push(text) } : null),
  });
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  return view;
}

/** A key, as the browser sends it. Returns the event, to read whether anything took it. */
function press(view: EditorView, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const list = (view: EditorView) => view.dom.querySelector<HTMLElement>('[role="listbox"]');
const rows = (view: EditorView) => [...view.dom.querySelectorAll<HTMLElement>('[role="option"]')];
const active = (view: EditorView) =>
  rows(view).find((row) => row.getAttribute('aria-selected') === 'true');

/** A view with the list open. */
function chooser(marked: string, options: Parameters<typeof open>[1] = {}): EditorView {
  const view = open(marked, options);
  press(view, 'Enter');
  return view;
}

describe('chooserItems', () => {
  const labels = (structure: Parameters<typeof chooserItems>[0], inSpeech: boolean) =>
    chooserItems(structure, inSpeech).map(({ label, letter }) => [label, letter]);

  test('the items for a screenplay, a play, and in a speech', () => {
    const screenplay = [
      ['Action', 'a'],
      ['Scene heading', 's'],
      ['Character', 'c'],
      ['Transition', 't'],
      ['Centered', 'e'],
      ['Lyric', 'l'],
      ['Section', 'i'],
      ['Synopsis', 'y'],
      ['Page break', 'b'],
    ];
    const play = [
      ['Stage direction', 's'],
      ['Act', 'a'],
      ['Scene', 'n'],
      ['Character', 'c'],
      ['Centered', 'e'],
      ['Lyric', 'l'],
      ['Synopsis', 'y'],
      ['Page break', 'b'],
    ];
    const speech = [
      ['Dialogue', 'd'],
      ['Parenthetical', 'p'],
    ];
    expect(labels(SCREENPLAY_STRUCTURE, false)).toEqual(screenplay);
    expect(labels(PLAY_STRUCTURE, false)).toEqual(play);
    expect(labels(SCREENPLAY_STRUCTURE, true)).toEqual([...screenplay, ...speech]);
    expect(labels(PLAY_STRUCTURE, true)).toEqual([...play, ...speech]);
  });

  test('a play has no Section, as `# ` is an Act there', () => {
    expect(chooserItems(PLAY_STRUCTURE, false).map(({ kind }) => kind)).not.toContain('section');
  });

  test.each([
    ['acts in a screenplay', { ...SCREENPLAY_STRUCTURE, actDepth: 2 }],
    ['headings with stage directions', { ...SCREENPLAY_STRUCTURE, stageDirections: true }],
  ])('every letter is its own, and in the label: %s', (_name, structure) => {
    const items = chooserItems(structure, true);
    expect(new Set(items.map(({ letter }) => letter)).size).toBe(items.length);
    for (const { label, letter } of items) expect(label.toLowerCase()).toContain(letter);
  });

  test('a row that loses its letter doesn’t take another row’s', () => {
    const items = chooserItems({ ...SCREENPLAY_STRUCTURE, actDepth: 2 }, false);
    const letterOf = (wanted: string) => items.find(({ kind }) => kind === wanted)?.letter;
    expect(letterOf('action')).toBe('a');
    expect(letterOf('character')).toBe('c');
    expect(letterOf('transition')).toBe('t');
  });
});

describe('opening', () => {
  test('Enter on an empty line opens it, and the file doesn’t change', () => {
    const view = chooser('She waits.\n\n|');
    expect(list(view)?.getAttribute('aria-label')).toBe('Choose an element');
    expect(render(view.state)).toBe('She waits.\n\n|');
  });

  test('Enter on a blank script opens it, on the line the block stands in for', () => {
    const view = chooser(`|${BLOCK}`, { template: PLAY });
    expect(rows(view)[0]?.textContent).toBe('Stage direction');
  });

  test('on a line with text it stays shut', () => {
    expect(openChooser({ state: classicEditor('She waits.|'), dispatch() {} })).toBe(false);
    expect(list(chooser('She waits.|'))).toBeNull();
  });

  test('a read-only editor stays shut', () => {
    const state = classicEditor('She waits.\n\n|', { with: [EditorState.readOnly.of(true)] });
    expect(openChooser({ state, dispatch() {} })).toBe(false);
  });

  test('the row of the pending element is highlighted', () => {
    expect(active(chooser('A.\n\n|'))?.textContent).toBe('Action');
    expect(active(chooser('JUNE\nHi.\n\n|'))?.textContent).toBe('Character');
    expect(active(chooser('JUNE\n|'))?.textContent).toBe('Dialogue');
  });

  test('in a speech Dialogue and Parenthetical are there', () => {
    const texts = rows(chooser('JUNE\n|')).map((row) => row.textContent);
    expect(texts.slice(-2)).toEqual(['Dialogue', 'Parenthetical']);
  });
});

describe('the list', () => {
  test('a row’s words are one piece, so its name isn’t split at the underline', () => {
    // A row lays out as a flex box, and WebKit names each of its items apart: "C haracter".
    const view = chooser('A.\n\n|');
    for (const row of rows(view)) expect(row.children).toHaveLength(1);
    expect(rows(view)[2]?.firstElementChild?.textContent).toBe('Character');
  });

  test('each row’s letter is underlined, in text', () => {
    const view = chooser('A.\n\n|');
    expect(rows(view).map((row) => row.querySelector('u')?.textContent)).toEqual([
      'A',
      'S',
      'C',
      'T',
      'e',
      'L',
      'i',
      'y',
      'b',
    ]);
  });

  test('the text box says the list is open, and which item', () => {
    const view = chooser('A.\n\n|');
    const box = view.contentDOM;
    expect(box.getAttribute('aria-controls')).toBe(list(view)?.id);
    expect(box.getAttribute('aria-activedescendant')).toBe(active(view)?.id);
    expect(box.getAttribute('aria-haspopup')).toBe('listbox');
    press(view, 'ArrowDown');
    expect(active(view)?.textContent).toBe('Scene heading');
    expect(box.getAttribute('aria-activedescendant')).toBe(active(view)?.id);
    press(view, 'Escape');
    expect(box.hasAttribute('aria-controls')).toBe(false);
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
  });

  test('row ids stay put as the highlight moves', () => {
    const view = chooser('A.\n\n|');
    const ids = rows(view).map((row) => row.id);
    press(view, 'ArrowDown');
    expect(rows(view).map((row) => row.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a reader hears it open, and each move', () => {
    const said: string[] = [];
    const view = chooser('A.\n\n|', { said });
    press(view, 'ArrowDown');
    expect(said).toEqual(['Choose an element, 9 choices: Action', 'Scene heading']);
  });
});

describe('keys while it’s open', () => {
  test.each([
    ['a', 'action'],
    ['s', 'scene_heading'],
    ['c', 'character'],
    ['t', 'transition'],
    ['e', 'centered'],
    ['l', 'lyric'],
    ['i', 'section'],
    ['y', 'synopsis'],
  ])('each letter picks: %s in a screenplay', (key, kind) => {
    const view = chooser('A.\n\n|');
    press(view, key);
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)).toMatchObject({ kind, pending: true });
    expect(view.state.field(classicLine)).toMatchObject({ chosen: true, soft: false });
    expect(render(view.state)).toBe('A.\n\n|');
  });

  test.each([
    ['s', 'action'],
    ['a', 'act'],
    ['n', 'scene_heading'],
    ['c', 'character'],
    ['e', 'centered'],
    ['l', 'lyric'],
    ['y', 'synopsis'],
  ])('each letter picks: %s in a play', (key, kind) => {
    const view = chooser('A.\n\n|', { template: PLAY });
    press(view, key);
    expect(elementAt(view.state)).toMatchObject({ kind, pending: true });
  });

  test('a capital picks as its letter does', () => {
    const view = chooser('A.\n\n|');
    press(view, 'C', { shiftKey: true });
    expect(elementAt(view.state)?.kind).toBe('character');
  });

  test('d picks Dialogue in a speech', () => {
    const view = chooser('JUNE\n|');
    press(view, 'd');
    expect(elementAt(view.state)).toMatchObject({ kind: 'dialogue', pending: true });
    expect(render(view.state)).toBe('JUNE\n|');
  });

  test('p writes the parenthetical’s `()`, as nothing else makes the line one', () => {
    const view = chooser('JUNE\n|');
    press(view, 'p');
    expect(render(view.state)).toBe('JUNE\n(|)');
    expect(elementAt(view.state)?.kind).toBe('parenthetical');
  });

  test('Up, Down, and Enter pick', () => {
    const view = chooser('A.\n\n|');
    press(view, 'ArrowDown');
    press(view, 'ArrowDown');
    press(view, 'ArrowUp');
    press(view, 'Enter');
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)?.kind).toBe('scene_heading');
  });

  test('Up from the top and Down from the bottom go round', () => {
    const view = chooser('A.\n\n|');
    press(view, 'ArrowUp');
    expect(active(view)?.textContent).toBe('Page break');
    press(view, 'ArrowDown');
    expect(active(view)?.textContent).toBe('Action');
  });

  test('Escape closes it and the line stays', () => {
    const view = chooser('A.\n\n|');
    const before = view.state.field(classicLine);
    const event = press(view, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(list(view)).toBeNull();
    expect(render(view.state)).toBe('A.\n\n|');
    expect(view.state.field(classicLine)).toEqual(before);
    expect(elementAt(view.state)?.soft).toBe(true);
  });

  test('a picked element survives the first letter', () => {
    const view = chooser('A.\n\n|');
    press(view, 'c');
    expect(elementAt(type(view.state, 'j'))).toMatchObject({ kind: 'character', pending: false });
  });

  test('Action chosen is firm', () => {
    const view = chooser('A.\n\n|');
    press(view, 'a');
    expect(elementAt(view.state)).toMatchObject({ kind: 'action', soft: false });
    const typed = type(view.state, 'INT. BAR');
    expect(typed.sliceDoc()).toBe('A.\n\n!INT. BAR');
  });

  test('no letter reaches the text', () => {
    for (const key of ['a', 'z', 'Z', '1', ' ', '.']) {
      const view = chooser('A.\n\n|');
      const event = press(view, key);
      expect(event.defaultPrevented).toBe(true);
      expect(render(view.state)).toBe('A.\n\n|');
    }
  });

  test('a letter with no row closes it', () => {
    const view = chooser('A.\n\n|');
    press(view, 'z');
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)?.soft).toBe(true);
  });

  test('Enter held down picks nothing', () => {
    const view = chooser('A.\n\n|');
    press(view, 'Enter', { repeat: true });
    expect(list(view)).not.toBeNull();
    expect(elementAt(view.state)?.soft).toBe(true);
  });

  test('Shift alone leaves it open', () => {
    const view = chooser('A.\n\n|');
    press(view, 'Shift', { shiftKey: true });
    expect(list(view)).not.toBeNull();
  });

  test('a key with a modifier closes it and goes on', () => {
    const view = chooser('A.\n\n|');
    expect(press(view, 'k', { metaKey: true }).defaultPrevented).toBe(false);
    expect(list(view)).toBeNull();
  });

  test('Tab takes the list out of the tab order first, for Tab mode', () => {
    const view = chooser('A.\n\n|');
    const held = list(view) as HTMLElement;
    expect(held.tabIndex).toBe(0);
    press(view, 'Tab');
    expect(held.tabIndex).toBe(-1);
  });

  test('Tab closes it and does what Tab does', () => {
    const view = chooser('A.\n\n|');
    press(view, 'Tab');
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)?.kind).toBe('character');
  });
});

describe('what closes it', () => {
  test('a selection change', () => {
    const view = chooser('A.\n\n|');
    view.dispatch({ selection: { anchor: 0 } });
    expect(list(view)).toBeNull();
  });

  test('a click elsewhere in the text', () => {
    const view = chooser('A.\n\n|');
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(list(view)).toBeNull();
  });

  test('a load closes the chooser', () => {
    const view = chooser('A.\n\n|');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'B.\n\n' },
      annotations: appChange.of(true),
    });
    expect(list(view)).toBeNull();
    expect(view.contentDOM.hasAttribute('aria-controls')).toBe(false);
  });

  test('a new state closes the chooser', () => {
    const view = chooser('A.\n\n|');
    view.setState(classicEditor('B.\n\n|'));
    expect(list(view)).toBeNull();
  });

  test('a template change closes it, as its rows are the old template’s', () => {
    let template = builtins['us-screenplay'] as Template;
    const state = EditorState.create({
      doc: 'A.\n\n',
      selection: { anchor: 4 },
      extensions: [fountain({ template: () => template }), Prec.high(classic())],
    });
    const view = new EditorView({ state, parent: document.body });
    views.push(view);
    press(view, 'Enter');
    expect(list(view)).not.toBeNull();
    template = PLAY;
    view.dispatch({});
    expect(list(view)).toBeNull();
  });
});

describe('a pick', () => {
  test('a pick writes nothing', () => {
    const view = chooser('A.\n\n|');
    const before = view.state.doc;
    press(view, 'c');
    expect(view.state.doc).toBe(before);
  });

  test('a click picks', () => {
    const view = chooser('A.\n\n|');
    const row = rows(view)[3] as HTMLElement;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    row.click();
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)?.kind).toBe('transition');
  });

  test('a click picks a page break too', () => {
    const view = chooser('A.\n\n|');
    (rows(view)[8] as HTMLElement).click();
    expect(render(view.state)).toBe('A.\n\n===\n\n|');
  });

  test('a chosen Page break writes ===, and the caret goes on to Action', () => {
    const view = chooser('A.\n\n|');
    press(view, 'b');
    expect(render(view.state)).toBe('A.\n\n===\n\n|');
    expect(list(view)).toBeNull();
    expect(elementAt(view.state)).toMatchObject({ kind: 'action', pending: true, soft: true });
    expect(type(view.state, 'Go').sliceDoc()).toBe('A.\n\n===\n\nGo');
  });

  test('a Page break under a speech keeps the speech whole', () => {
    const speech = chooser('JUNE\nHi.\n|');
    press(speech, 'b');
    expect(render(speech.state)).toBe('JUNE\nHi.\n\n===\n\n|');
  });

  test('a Page break on the line Enter made under a name stays, and the name’s break too', () => {
    const view = open('JUNE|');
    view.dispatch({
      effects: setStored.of({ kind: 'character' }),
      annotations: classicEdit.of(true),
    });
    press(view, 'Enter');
    expect(render(view.state)).toBe('JUNE\n|');
    press(view, 'Enter');
    press(view, 'b');
    expect(render(view.state)).toBe('JUNE\n\n===\n\n|');
  });

  test('a Page break with text straight under is set apart from it', () => {
    const view = chooser('A.\n\n|\nB.');
    press(view, 'b');
    expect(render(view.state)).toBe('A.\n\n===\n\n|\n\nB.');
  });

  test('a Page break on a blank script writes it above the block', () => {
    const state = classicEditor(`|${BLOCK}`, { template: PLAY });
    const next = apply(state, elementCommand('page_break'));
    expect(next.sliceDoc()).toBe(`===\n\n\n\n${BLOCK}`);
    expect(next.selection.main.head).toBe(5);
  });

  test('a Page break after a byte-order mark has its caret below', () => {
    const view = chooser(`${BOM}|`);
    press(view, 'b');
    expect(render(view.state)).toBe(`${BOM}===\n\n|`);
  });

  test('left unused, the Action line under a page break goes', () => {
    const view = chooser('A.\n\n|\n\nB.');
    press(view, 'b');
    view.dispatch({ selection: { anchor: 0 }, userEvent: 'select' });
    expect(view.state.sliceDoc()).toBe('A.\n\n===\n\nB.');
  });

  test('one undo takes the page break back', () => {
    const view = chooser('A.\n\n|');
    press(view, 'b');
    undo(view);
    expect(view.state.sliceDoc()).toBe('A.\n\n');
  });

  test('an element outside the speech is set apart from it', () => {
    const view = open('JUNE|');
    view.dispatch({
      effects: setStored.of({ kind: 'character' }),
      annotations: classicEdit.of(true),
    });
    press(view, 'Enter');
    press(view, 'Enter');
    press(view, 's');
    expect(render(view.state)).toBe('JUNE\n\n|');
    expect(elementAt(view.state)).toMatchObject({ kind: 'scene_heading', pending: true });
  });

  test('left unused, what set it apart goes, with the line', () => {
    const view = open('JUNE|\n\nEnd.');
    view.dispatch({
      effects: setStored.of({ kind: 'character' }),
      annotations: classicEdit.of(true),
    });
    press(view, 'Enter');
    press(view, 'Enter');
    press(view, 'c');
    expect(render(view.state)).toBe('JUNE\n\n|\n\nEnd.');
    view.dispatch({ selection: { anchor: 0 }, userEvent: 'select' });
    expect(view.state.sliceDoc()).toBe('JUNE\n\nEnd.');
  });

  test('a line under a speech with text under it is set apart on both sides, and goes whole', () => {
    const view = chooser('JUNE\n|\nHi.');
    press(view, 'c');
    expect(render(view.state)).toBe('JUNE\n\n|\n\nHi.');
    view.dispatch({ selection: { anchor: 0 }, userEvent: 'select' });
    expect(view.state.sliceDoc()).toBe('JUNE\n\nHi.');
  });

  test('text straight under is set apart from an element', () => {
    const view = chooser('A.\n\n|\nJUNE\nHi.');
    press(view, 'c');
    expect(render(view.state)).toBe('A.\n\n|\n\nJUNE\nHi.');
  });

  test('Action under a line of action stays in the paragraph', () => {
    const view = chooser('She waits.\n|');
    press(view, 'a');
    expect(render(view.state)).toBe('She waits.\n|');
  });

  test('a lyric in a speech stays in it', () => {
    const view = chooser('JUNE\n|');
    press(view, 'l');
    expect(render(view.state)).toBe('JUNE\n|');
  });

  test('one undo takes back what set it apart', () => {
    const view = chooser('JUNE\nHi.\n|');
    press(view, 's');
    undo(view);
    expect(render(view.state)).toBe('JUNE\nHi.\n|');
  });
});

describe('typing on a page break', () => {
  test.each([
    ['at its end', '===|', '===\n\nGo|'],
    ['at its start', '|===', '===\n\nGo|'],
    ['with text below', 'A.\n\n===|\n\nB.', 'A.\n\n===\n\nGo|\n\nB.'],
    ['with text straight below', '===|\nB.', '===\n\nGo|\n\nB.'],
  ])('a letter goes on to Action: %s', (_name, before, after) => {
    expect(render(type(classicEditor(before), 'Go'))).toBe(after);
  });

  test('the letter is soft Action, as a heading typed there shows', () => {
    expect(type(classicEditor('===|'), 'INT. BAR').sliceDoc()).toBe('===\n\nINT. BAR');
  });

  test('one undo takes the letter and the line', () => {
    const state = classicEditor('A.\n\n===|', { with: [history()] });
    expect(render(apply(type(state, 'G'), undo))).toBe('A.\n\n===|');
  });

  test('a space does nothing', () => {
    expect(render(type(classicEditor('===|'), ' '))).toBe('===|');
  });

  test('`===` typed on a line of Action stays the writer’s words', () => {
    const typed = type(classicEditor('A b.\n\n|'), '===x');
    expect(typed.sliceDoc().split('\n').length).toBe(3);
  });

  test('with Classic Mode off the letter goes on the line', () => {
    expect(render(type(editor('===|'), 'G'))).toBe('===G|');
  });
});

describe('elementCommand', () => {
  test('an element key on an empty line sets the pending element', () => {
    const state = apply(classicEditor('A.\n\n|'), elementCommand('character'));
    expect(render(state)).toBe('A.\n\n|');
    expect(elementAt(state)).toMatchObject({ kind: 'character', pending: true });
    expect(state.field(classicLine)?.chosen).toBe(true);
  });

  test('it carries Classic Mode’s own mark', () => {
    const { transactions } = run(classicEditor('A.\n\n|'), elementCommand('transition'));
    expect(transactions[0]?.annotation(classicEdit)).toBe(true);
  });

  test('on a blank script it sets the pending element', () => {
    const state = apply(
      classicEditor(`|${BLOCK}`, { template: PLAY }),
      elementCommand('character'),
    );
    expect(state.sliceDoc()).toBe(BLOCK);
    expect(elementAt(state)).toMatchObject({ kind: 'character', pending: true });
  });

  test('on a line with text it runs makeElement', () => {
    const made = apply(classicEditor('she waits|'), makeElement('character'));
    const state = apply(classicEditor('she waits|'), elementCommand('character'));
    expect(state.sliceDoc()).toBe(made.sliceDoc());
    expect(state.sliceDoc()).toBe('SHE WAITS');
  });

  test('with Classic Mode off elementCommand is makeElement', () => {
    for (const [marked, kind] of [
      ['A.\n\n|', 'character'],
      ['A.\n\n|', 'scene_heading'],
      ['she waits|', 'character'],
    ] as const) {
      const off = () => editor(marked);
      expect(render(apply(off(), elementCommand(kind)))).toBe(
        render(apply(off(), makeElement(kind))),
      );
    }
    const off = () => editor('A.\n\n|');
    expect(render(apply(off(), elementCommand('page_break')))).toBe(
      render(apply(off(), insertPageBreak)),
    );
  });

  test('Parenthetical in a speech writes `()`, as a pick does', () => {
    expect(render(apply(classicEditor('JUNE\n|'), elementCommand('parenthetical')))).toBe(
      'JUNE\n(|)',
    );
  });

  test('Parenthetical off a speech does nothing', () => {
    const state = classicEditor('A.\n\n|');
    expect(run(state, elementCommand('parenthetical')).handled).toBe(false);
  });

  test('Dialogue off a speech starts with the name, and writes no `@`', () => {
    const state = apply(classicEditor('A.\n\n|'), elementCommand('dialogue'));
    expect(render(state)).toBe('A.\n\n|');
    expect(elementAt(state)?.kind).toBe('character');
  });

  test('what the template lacks isn’t chosen', () => {
    const state = classicEditor('A.\n\n|', { template: PLAY });
    expect(run(state, elementCommand('transition')).handled).toBe(false);
    expect(run(classicEditor('A.\n\n|'), elementCommand('act')).handled).toBe(false);
  });

  test('Section in a play is its Act, which is what `# ` is there', () => {
    const state = apply(classicEditor('A.\n\n|', { template: PLAY }), elementCommand('section'));
    expect(state.sliceDoc()).toBe('A.\n\n');
    expect(elementAt(state)?.kind).toBe('act');
  });
});

describe('the element keys', () => {
  const app = (marked: string, hints: string[] = []) => {
    const at = marked.indexOf('|');
    const state = EditorState.create({
      doc: marked.replace('|', ''),
      selection: { anchor: at },
      extensions: [
        fountain({ onHint: (hint) => hints.push(hint), template: () => PLAY }),
        Prec.high(classic()),
      ],
    });
    const view = new EditorView({ state, parent: document.body });
    views.push(view);
    return view;
  };
  const mod = { ctrlKey: true, altKey: true };

  test('Mod+Alt+3 on an empty line sets the pending element', () => {
    const view = app('A.\n\n|');
    press(view, '3', { ...mod, code: 'Digit3', keyCode: 51 });
    expect(view.state.sliceDoc()).toBe('A.\n\n');
    expect(elementAt(view.state)).toMatchObject({ kind: 'character', pending: true });
  });

  test('Mod+Alt+5 where the template has no transitions says why, in the same words', () => {
    const hints: string[] = [];
    const view = app('A.\n\n|', hints);
    press(view, '5', { ...mod, code: 'Digit5', keyCode: 53 });
    expect(hints).toEqual([expect.stringContaining('no transitions')]);
    expect(view.state.sliceDoc()).toBe('A.\n\n');
  });

  test('Mod+Alt+3 on a line with text runs makeElement', () => {
    const view = app('she waits|');
    press(view, '3', { ...mod, code: 'Digit3', keyCode: 51 });
    expect(view.state.sliceDoc()).toBe('SHE WAITS');
  });
});

test('Tab’s walk and a pick agree on what’s stored', () => {
  const tabbed = apply(classicEditor('A.\n\n|'), classicTab);
  const picked = apply(classicEditor('A.\n\n|'), elementCommand('character'));
  expect(picked.field(classicLine)).toEqual(tabbed.field(classicLine));
});

describe('above a phone’s keyboard (§10)', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
  });

  test('the list goes where the writer can see: the visual viewport, not the window', () => {
    const view = new EditorView({ state: classicEditor('She waits.\n\n|'), parent: document.body });
    views.push(view);
    // CodeMirror places tooltips by the window, whose bottom a phone's keyboard covers.
    const viewport = { offsetTop: 40, offsetLeft: 0, width: 400, height: 500 };
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    expect(seenSpace(view)).toEqual({ top: 40, left: 0, right: 400, bottom: 540 });
    // And only the editor's height of it, as the top bar is drawn over the page above the editor.
    view.dom.getBoundingClientRect = () => ({ top: 60, bottom: 900, height: 840 }) as DOMRect;
    expect(seenSpace(view)).toEqual({ top: 60, left: 0, right: 400, bottom: 540 });
  });

  test('with no visual viewport it’s the window', () => {
    const view = new EditorView({ state: classicEditor('She waits.\n\n|'), parent: document.body });
    views.push(view);
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    expect(seenSpace(view)).toEqual({
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    });
  });
});
