import {
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteLineBoundaryBackward,
  history,
  undo,
} from '@codemirror/commands';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { elementAt } from '../../src/classic';
import { classicEditor, keys, render } from './harness';

function moved(state: EditorState, motion: (view: EditorView) => boolean): EditorState {
  const view = new EditorView({ state });
  try {
    motion(view);
    return view.state;
  } finally {
    view.destroy();
  }
}

const back = (marked: string) => render(keys(classicEditor(marked), 'Backspace'));
const del = (marked: string) => render(keys(classicEditor(marked), 'Delete'));

describe('§6.4, Backspace and Delete', () => {
  test('Backspace at the visible start joins to the element above, in one step', () => {
    expect(back('One.\n\n|Two.')).toBe('One.|Two.');
    expect(back('One.\n\n@|TWO\nHi.')).toBe('One.|TWO\nHi.');
    expect(back('>One.<\n\n|Two.')).toBe('>One.|Two.<');
    expect(back('JUNE\nOne.\n|Two.')).toBe('JUNE\nOne.|Two.');
  });

  test('at the top of the script Backspace leaves a mark alone', () => {
    expect(back('!|One.')).toBe('!|One.');
  });

  test('an extra blank line goes first', () => {
    expect(back('One.\n\n\n|Two.')).toBe('One.\n\n|Two.');
  });

  test('on an empty line removes it and goes above', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(render(keys(state, 'Backspace'))).toBe('She waits.|\n\nHe leaves.');
    expect(back('She waits.\n\n|')).toBe('She waits.|');
    expect(back('JUNE\n|')).toBe('JUNE|');
    expect(back('One.\n\n|\nTwo.')).toBe('One.|\n\nTwo.');
  });

  test('in an empty () takes both', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe.'), 'Tab', 'Backspace');
    expect(render(state)).toBe('JUNE\nHello.\n|\n\nHe.');
    expect(elementAt(state)).toMatchObject({ kind: 'dialogue', pending: true });
  });

  test('Delete in an empty () takes both', () => {
    const state = keys(classicEditor('JUNE\nHello.|\n\nHe.'), 'Tab', 'Delete');
    expect(render(state)).toBe('JUNE\nHello.\n|\n\nHe.');
  });

  test('Delete at the end of a line is the same join', () => {
    expect(del('One.|\n\nTwo.')).toBe('One.|Two.');
    expect(del('One.|\n\n@TWO\nHi.')).toBe('One.|TWO\nHi.');
    expect(del('>One.|<\n\nTwo.')).toBe('>One.|Two.<');
    expect(del('>One.|<')).toBe('>One.|<');
    expect(del('One.|\n\n\nTwo.')).toBe('One.|\n\nTwo.');
    expect(del('One.|\n')).toBe('One.|');
    expect(del('One.|\n\n')).toBe('One.|\n');
  });

  test('Delete on an empty line goes down the same way', () => {
    expect(del('One.\n\n|\n\n@TWO\nHi.')).toBe('One.\n\n@|TWO\nHi.');
    expect(del('One.\n|\n\nTwo.')).toBe('One.\n|\nTwo.');
  });

  test('Backspace after a hidden ** takes the last letter', () => {
    expect(back('a **bcd**| e')).toBe('a **bc**| e');
  });

  test('Delete in front of a hidden mark takes the next letter', () => {
    expect(del('a **|bcd** e')).toBe('a **|cd** e');
    expect(del('|!foo')).toBe('!|oo');
  });

  test('an emptied pair goes with its last letter', () => {
    expect(back('a **b**| c')).toBe('a | c');
    expect(back('a **b|** c')).toBe('a | c');
    expect(del('a **|b** c')).toBe('a | c');
  });

  test('a lone mark goes with the last letter', () => {
    expect(back('!a|')).toBe('|');
    expect(back('>a|<')).toBe('|');
    expect(del('@|a')).toBe('|');
  });

  test('a mark Classic Mode added comes off with the last letter', () => {
    const state = keys(classicEditor('One.\n\n|'), 'Tab', 'j', 'Backspace');
    expect(state.sliceDoc()).toBe('One.\n\n');
  });

  test('deleting a typed heading goes back to what the line was', () => {
    let state = keys(classicEditor('One.\n\n|'), 'int.');
    expect(elementAt(state)?.kind).toBe('scene_heading');
    for (let i = 0; i < 4; i++) state = keys(state, 'Backspace');
    expect(state.sliceDoc()).toBe('One.\n\n');
    expect(elementAt(state)).toMatchObject({ kind: 'action', pending: true });
  });

  test('Alt+Backspace takes the words the writer sees', () => {
    const word = (marked: string) => render(moved(classicEditor(marked), deleteGroupBackward));
    expect(word('a **big cat**| d')).toBe('a **big **| d');
    expect(word('a **cat**| d')).toBe('a | d');
    expect(render(moved(classicEditor('**cat|**'), deleteGroupForward))).toBe('**cat|**');
    expect(render(moved(classicEditor('!foo|'), deleteGroupBackward))).toBe('|');
  });

  test('Alt+Backspace at the visible start joins', () => {
    expect(render(moved(classicEditor('One.\n\n!|Two.'), deleteGroupBackward))).toBe('One.|Two.');
  });

  test('Cmd+Backspace takes the words the writer sees', () => {
    const view = new EditorView({ state: classicEditor('a **b c|** d') });
    // jsdom has no layout, so the line's start stands in for the boundary.
    view.moveToLineBoundary = (range) =>
      EditorSelection.cursor(view.state.doc.lineAt(range.head).from);
    deleteLineBoundaryBackward(view);
    expect(render(view.state)).toBe('| d');
    view.destroy();
  });

  test('a selection across one half of a pair does what Fountain Mode does', () => {
    const state = classicEditor('a [**b]c** d');
    const next = moved(state, deleteCharForward);
    expect(next.sliceDoc()).toBe('a c** d');
  });

  test('Backspace after a page break takes it', () => {
    expect(back('One.\n\n===|\n\nTwo.')).toBe('One.|\n\nTwo.');
    expect(back('One.\n\n===\n\n|Two.')).toBe('One.\n\n|Two.');
    expect(back('===|\n\nTwo.')).toBe('|Two.');
    expect(del('One.|\n\n===\n\nTwo.')).toBe('One.|\n\nTwo.');
  });

  test(') before ) moves past it', () => {
    const state = keys(classicEditor('JUNE\n(so|)\nHi.'), ')');
    expect(render(state)).toBe('JUNE\n(so)|\nHi.');
  });

  test('Backspace takes a blank speech line whole', () => {
    expect(back('JUNE\nOne.\n  |\nTwo.')).toBe('JUNE\nOne.|\nTwo.');
    expect(back('JUNE\nOne.\n | \nTwo.')).toBe('JUNE\nOne.|\nTwo.');
  });

  test('Delete never leaves one space of a blank speech line', () => {
    expect(del('JUNE\nOne.\n|  \nTwo.')).toBe('JUNE\nOne.\n|Two.');
    expect(del('JUNE\nOne.\n | \nTwo.')).toBe('JUNE\nOne.\n|Two.');
    expect(del('JUNE\nOne.\n  |\nTwo.')).toBe('JUNE\nOne.\n|Two.');
    expect(del('JUNE\nOne.\n  |')).toBe('JUNE\nOne.|');
  });

  test('a delete on an element joins in one undo', () => {
    const state = keys(classicEditor('One.\n\n@|TWO\nHi.', { with: [history()] }), 'Backspace');
    expect(moved(state, undo).sliceDoc()).toBe('One.\n\n@TWO\nHi.');
  });

  test('the title page isn’t joined to', () => {
    expect(back('Title: Signal Hill\n\n|One.')).toBe('Title: Signal Hill\n\n|One.');
  });

  test('a selection is Fountain Mode’s', () => {
    expect(back('On[e.]')).toBe('On|');
  });
});
