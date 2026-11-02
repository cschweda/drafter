import type { EditorState } from '@codemirror/state';
import { appChange } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import { classicEditor, keys, render } from './harness';

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

  test('a move with no user event tidies nothing', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(state.update({ selection: { anchor: 0 } }).state.sliceDoc()).toBe(
      'She waits.\n\n\n\nHe leaves.',
    );
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
