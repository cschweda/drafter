import { history, redo, undo, undoDepth } from '@codemirror/commands';
import type { EditorState } from '@codemirror/state';
import { appChange } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import { classicLine, savedText } from '../../src/classic';
import { apply } from '../helpers';
import { classicEditor, keys, render, type } from './harness';

/** A click: the cursor put at `pos`. */
const click = (state: EditorState, pos: number) =>
  state.update({ selection: { anchor: pos }, userEvent: 'select.pointer' }).state;

describe('§4.4, an empty line left behind', () => {
  test('an empty line made and left is gone', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(state.sliceDoc()).toBe('She waits.\n\n\n\nHe leaves.');
    expect(click(state, 3).sliceDoc()).toBe('She waits.\n\nHe leaves.');
  });

  test('the cursor lands where it was sent', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(render(click(state, state.doc.length))).toBe('She waits.\n\nHe leaves.|');
  });

  test('a line under a name, made and left, is gone', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe leaves.'), 'Shift-Enter');
    expect(click(state, 0).sliceDoc()).toBe('JUNE\nHello.\n\nHe leaves.');
  });

  test('a () made and left is gone with its line', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe leaves.'), 'Tab');
    expect(state.sliceDoc()).toBe('JUNE\nHello.\n()\n\nHe leaves.');
    expect(click(state, 0).sliceDoc()).toBe('JUNE\nHello.\n\nHe leaves.');
  });

  test('a () made on a made line takes that line with it', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe leaves.'), 'Shift-Enter', 'Tab');
    expect(state.sliceDoc()).toBe('JUNE\nHello.\n()\n\nHe leaves.');
    expect(click(state, 0).sliceDoc()).toBe('JUNE\nHello.\n\nHe leaves.');
  });

  test('a () made at the end of the file goes too', () => {
    expect(click(keys(classicEditor('JUNE\nHello.|'), 'Tab'), 0).sliceDoc()).toBe('JUNE\nHello.');
  });

  test('a () with words in it stays', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe.'), 'Tab', 'softly');
    expect(click(state, 0).sliceDoc()).toBe('JUNE\nHello.\n(softly)\n\nHe.');
  });

  test('a line typed on stays', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter', 'x');
    expect(click(state, 0).sliceDoc()).toBe('She waits.\n\nx\n\nHe leaves.');
  });

  test.each(['Enter', 'Tab'])(
    'with two blank lines below, %s’s one break goes, and the file’s blank lines stay',
    (key) => {
      // Found by the byte promise's property: the line went whole, and took a blank line of the file.
      const state = keys(classicEditor('She waits.|\n\n\nHe leaves.'), key);
      expect(render(state)).toBe('She waits.\n\n|\n\nHe leaves.');
      expect(click(state, 0).sliceDoc()).toBe('She waits.\n\n\nHe leaves.');
    },
  );

  test('a blank line that was in the file stays', () => {
    const state = classicEditor('She waits.\n\n|\n\nHe leaves.');
    expect(click(state, 0).sliceDoc()).toBe('She waits.\n\n\n\nHe leaves.');
  });

  test('a key that lands on a blank line of the file made nothing', () => {
    const state = keys(classicEditor('She waits.|\n\n\n\nHe leaves.'), 'Enter');
    expect(click(state, 0).sliceDoc()).toBe('She waits.\n\n\n\nHe leaves.');
  });

  test('at the end of the file it does nothing', () => {
    const state = keys(classicEditor('She waits.|'), 'Enter');
    expect(click(state, 0).sliceDoc()).toBe('She waits.\n\n');
  });

  test('an app change near a made line tidies nothing', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    const after = state.update({
      changes: { from: 0, insert: 'X' },
      selection: { anchor: 0 },
      annotations: appChange.of(true),
      userEvent: 'input',
    }).state;
    expect(after.sliceDoc()).toBe('XShe waits.\n\n\n\nHe leaves.');
    expect(click(after, 0).sliceDoc()).toBe('XShe waits.\n\n\n\nHe leaves.');
  });

  // A template chip, Fix from Problems, Put back a cut, a module's edit: an app change somewhere
  // else leaves the cursor where it was, on a line this stay made.
  const elsewhere = (state: EditorState, at: number, insert: string) =>
    state.update({
      changes: { from: at, insert },
      annotations: appChange.of(true),
      userEvent: 'input',
    }).state;

  test.each([
    [
      'Enter',
      'JUNE\nOne.|\nTwo.\n\nShe waits.',
      'JUNE\nOne.\n\nTwo.\n\nShe waits.X',
      'JUNE\nOne.\nTwo.\n\nShe waits.X',
    ],
    [
      'Tab',
      'JUNE\nOne.|\n\nShe waits.',
      'JUNE\nOne.\n()\n\nShe waits.X',
      'JUNE\nOne.\n\nShe waits.X',
    ],
  ])('an app change elsewhere keeps a made line tidyable (%s)', (key, start, raw, tidy) => {
    const made = keys(classicEditor(start), key);
    const after = elsewhere(made, made.doc.length, 'X');
    expect(after.sliceDoc()).toBe(raw);
    expect(after.field(classicLine)?.made).not.toBeNull();
    expect(savedText(after).toString()).toBe(tidy);
    expect(click(after, 0).sliceDoc()).toBe(tidy);
  });

  test('an app change at the start keeps it too, mapped', () => {
    const made = keys(classicEditor('JUNE\nOne.|\nTwo.'), 'Enter');
    const after = elsewhere(made, 0, 'Hi.\n\n');
    expect(savedText(after).toString()).toBe('Hi.\n\nJUNE\nOne.\nTwo.');
    expect(click(after, 0).sliceDoc()).toBe('Hi.\n\nJUNE\nOne.\nTwo.');
  });

  test('an app change that touches the made line drops it, and tidies nothing', () => {
    const made = keys(classicEditor('JUNE\nOne.|\n\nShe waits.'), 'Tab');
    const at = made.sliceDoc().indexOf('()');
    const after = made.update({
      changes: { from: at + 1, insert: 'x' },
      annotations: appChange.of(true),
      userEvent: 'input',
    }).state;
    expect(after.field(classicLine)?.made ?? null).toBeNull();
    expect(click(after, 0).sliceDoc()).toBe('JUNE\nOne.\n(x)\n\nShe waits.');
  });

  test('a bare selection, as goto and reveal send, tidies', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(state.update({ selection: { anchor: 0 } }).state.sliceDoc()).toBe(
      'She waits.\n\nHe leaves.',
    );
  });

  test('a change with no user event tidies nothing', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    const after = state.update({ changes: { from: 0, insert: 'X' }, selection: { anchor: 0 } });
    expect(after.state.sliceDoc()).toBe('XShe waits.\n\n\n\nHe leaves.');
  });

  test('whitespace typed on a made line goes with it, and the line above stays', () => {
    const state = keys(classicEditor('JUNE\nHi.|\nAgain.'), 'Enter', ' ');
    expect(click(state, 0).sliceDoc()).toBe('JUNE\nHi.\nAgain.');
    const blank = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter', '  ');
    expect(click(blank, 0).sliceDoc()).toBe('She waits.\n\nHe leaves.');
  });

  test('a replace-all tidies nothing', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    const after = state.update({
      changes: { from: 0, to: 3, insert: 'Bea' },
      selection: { anchor: 0 },
      userEvent: 'input.replace.all',
    }).state;
    expect(after.sliceDoc()).toBe('Bea waits.\n\n\n\nHe leaves.');
  });

  test.each(['undo', 'redo'])('%s tidies nothing', (userEvent) => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    const after = state.update({ selection: { anchor: 0 }, userEvent }).state;
    expect(after.sliceDoc()).toBe('She waits.\n\n\n\nHe leaves.');
  });

  test('the tidy and the move are one transaction', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    const tr = state.update({ selection: { anchor: 3 }, userEvent: 'select.pointer' });
    expect(tr.docChanged).toBe(true);
    expect(tr.newSelection.main.head).toBe(3);
    expect(tr.isUserEvent('select')).toBe(true);
    expect(tr.newDoc.toString()).toBe('She waits.\n\nHe leaves.');
  });

  test('moving back and forth leaves the script as it was', () => {
    const before = classicEditor('She waits.|\n\nHe leaves.');
    const after = click(click(keys(before, 'Enter'), 0), 3);
    expect(after.sliceDoc()).toBe(before.sliceDoc());
  });
});

describe('undo and redo onto a made line', () => {
  const SPEECH = 'JUNE\nHi.|\nAgain.';
  const ORIGINAL = 'JUNE\nHi.\nAgain.';
  const editing = (marked: string) => classicEditor(marked, { with: [history()] });

  test('Enter, Tab, undo, leave', () => {
    const back = apply(keys(editing(SPEECH), 'Enter', 'Tab'), undo);
    expect(render(back)).toBe('JUNE\nHi.\n|\nAgain.');
    expect(click(back, 0).sliceDoc()).toBe(ORIGINAL);
  });

  test('Enter, leave, undo, leave', () => {
    const back = apply(click(keys(editing(SPEECH), 'Enter'), 0), undo);
    expect(render(back)).toBe('JUNE\nHi.\n|\nAgain.');
    expect(click(back, 0).sliceDoc()).toBe(ORIGINAL);
  });

  test('Enter, undo, redo, leave', () => {
    const back = apply(apply(keys(editing(SPEECH), 'Enter'), undo), redo);
    expect(render(back)).toBe('JUNE\nHi.\n|\nAgain.');
    expect(click(back, 0).sliceDoc()).toBe(ORIGINAL);
  });

  test('Enter at a speech line’s start, undo, redo, leave', () => {
    const back = apply(apply(keys(editing('JUNE\n|Hello.'), 'Enter'), undo), redo);
    // History maps the cursor past the line it opened before it, and takes no filter.
    expect(render(back)).toBe('JUNE\n\n|Hello.');
    expect(click(back, 0).sliceDoc()).toBe('JUNE\nHello.');
  });

  test('Enter at a speech line’s start, undo, redo, then a letter heals too', () => {
    const back = apply(apply(keys(editing('JUNE\n|Hello.'), 'Enter'), undo), redo);
    expect(render(type(back, 'x'))).toBe('JUNE\nx|Hello.');
  });

  test('Enter, Tab, leave, undo, leave takes the () away', () => {
    const back = apply(click(keys(editing(SPEECH), 'Enter', 'Tab'), 0), undo);
    expect(render(back)).toBe('JUNE\nHi.\n(|)\nAgain.');
    expect(click(back, 0).sliceDoc()).toBe(ORIGINAL);
  });

  test('undo then a bare selection tidies', () => {
    const back = apply(keys(editing(SPEECH), 'Enter', 'Tab'), undo);
    expect(back.update({ selection: { anchor: 0 } }).state.sliceDoc()).toBe(ORIGINAL);
  });

  test('a move and a row walk add nothing to the history', () => {
    const state = keys(editing('A.\n\n|'), 'Tab', 'Tab');
    expect(undoDepth(state)).toBe(0);
    expect(undoDepth(click(state, 0))).toBe(0);
  });

  test('a stale line isn’t restored away from the cursor', () => {
    const typed = keys(editing('She waits.|\n\nHe leaves.'), 'Enter');
    const elsewhere = click(typed, typed.doc.length);
    const back = apply(elsewhere, undo);
    expect(click(back, 0).sliceDoc()).toBe('She waits.\n\nHe leaves.');
  });

  test('a mark’s stay comes back with undo, and no letter is left unmarked', () => {
    const state = keys(editing('A.\n\n|'), 'Tab', 'Tab', 'Tab', 'flash');
    expect(state.doc.line(3).text).toBe('.FLASH');
    const back = apply(state, undo);
    expect(back.doc.line(3).text).toBe('');
  });
});
