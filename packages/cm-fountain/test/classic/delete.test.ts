import {
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteLineBoundaryBackward,
  history,
  undo,
} from '@codemirror/commands';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { classicBackspace, classicDelete, elementAt } from '../../src/classic';
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
    // The space against the mark unpairs it, and the `**` shows: a mark that doesn't pair stays
    // visible (Call 23), and goes away as the writer retypes.
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

  describe('two emphases on a line', () => {
    test('only the pair emptied goes', () => {
      expect(back('**a** b| **c**')).toBe('**a** | **c**');
      expect(back('*a* b| _c_')).toBe('*a* | _c_');
      expect(back('**a** **b**| **c**')).toBe('**a** | **c**');
      expect(del('**a** |b **c**')).toBe('**a** | **c**');
      const word = moved(classicEditor('**a** bc| **d**'), deleteGroupBackward);
      expect(render(word)).toBe('**a** | **d**');
    });

    test('marks that touch are told apart', () => {
      expect(back('*a _b_*| c')).toBe('*a *| c');
      expect(back('x *_b_*| c')).toBe('x | c');
      expect(back('x *a *b*| c*')).toBe('x *a | c*');
    });

    test('a run of three that matches nothing is text', () => {
      expect(back('**a *b|***')).toBe('**a *|***');
    });

    test('a line of many marks costs a pass', () => {
      const line = '*a* '.repeat(25000);
      const state = classicEditor(`${line.slice(0, 50000 - 1)}|`);
      const start = performance.now();
      keys(state, 'Backspace');
      expect(performance.now() - start).toBeLessThan(400);
    });
  });

  describe('a join carries what isn’t its lead', () => {
    test('a leading pair keeps its opener', () => {
      expect(back('One.\n\n**|b** c')).toBe('One.**|b** c');
      expect(back('One.\n\n*|b* c *d*')).toBe('One.*|b* c *d*');
      expect(back('One.\n\n!**|b** c')).toBe('One.**|b** c');
    });

    test('a note or a boneyard stays one', () => {
      expect(del('One.|\n\n[[note]] text')).toBe('One.|[[note]] text');
      expect(del('One.|\n\n/* cut */ text')).toBe('One.|/* cut */ text');
      expect(back('One.\n\n[[|note]] text')).toBe('One.|[[note]] text');
    });

    test('a closing mark of the lower line goes', () => {
      expect(back('One.\n\n>|Two.<')).toBe('One.|Two.');
    });
  });

  describe('an escape goes with its character', () => {
    test('from either side', () => {
      expect(back('a \\*|b')).toBe('a |b');
      expect(back('a \\*|')).toBe('a |');
      expect(del('a \\|*b')).toBe('a |b');
    });

    test('the escape of a letter further on stays', () => {
      expect(back('a \\*b|')).toBe('a \\*|');
    });
  });

  test('Mac’s Ctrl+H and Ctrl+D are the same keys', () => {
    const bindings = classicEditor('x').facet(keymap).flat();
    expect(bindings.find(({ mac }) => mac === 'Ctrl-h')?.run).toBe(classicBackspace);
    expect(bindings.find(({ mac }) => mac === 'Ctrl-d')?.run).toBe(classicDelete);
  });

  test('Backspace under a blank speech line takes it whole', () => {
    expect(back('JUNE\nHi.\n  \n|Two.')).toBe('JUNE\nHi.\n|Two.');
  });

  describe('a delete settles the line', () => {
    test('a line that would turn into something else gets its mark', () => {
      const state = classicEditor('Go| NOW\nnext');
      expect(render(moved(state, deleteGroupBackward))).toContain('!');
      expect(render(keys(classicEditor('Go| NOW\nnext'), 'Backspace', 'Backspace', 'Delete'))).toBe(
        '!|NOW\nnext',
      );
      expect(del('|xINT. HOUSE')).toBe('!|INT. HOUSE');
    });

    test('in one undo', () => {
      const state = keys(classicEditor('|xINT. HOUSE', { with: [history()] }), 'Delete');
      expect(moved(state, undo).sliceDoc()).toBe('xINT. HOUSE');
    });

    test('a selection deleted does the same', () => {
      expect(back('[x]INT. HOUSE')).toBe('!|INT. HOUSE');
    });

    test('a line that stays what it is writes nothing', () => {
      expect(back('She go|es.')).toBe('She g|es.');
    });
  });

  describe('nothing left', () => {
    test('spaces go with the marks', () => {
      expect(back('J| ^\nHi.')).toBe('|\nHi.');
      expect(back('> a| <')).toBe('|');
    });

    test('an emptied note or boneyard goes with its last letter', () => {
      expect(back('x [[a|]] y')).toBe('x | y');
      expect(back('x /*a|*/ y')).toBe('x | y');
      expect(back('[[a|]]')).toBe('|');
    });

    test('half a note across lines stays', () => {
      expect(back('[[a|\nb]]')).toBe('[[|\nb]]');
    });
  });

  describe('a join or a break taken settles what it touches', () => {
    test.each([
      ['BANG|\n\n!NOW\nnext', '!BANG|NOW\nnext'],
      ['GO|\n\n!NOW\nThe door opens.', '!GO|NOW\nThe door opens.'],
      ['NOW|\n\n2\nnext', '!NOW|2\nnext'],
      ['NOW|\n\n[[check]]\nnext', '!NOW|[[check]]\nnext'],
      ['NOW|\n\n/* cut */\nnext', '!NOW|/* cut */\nnext'],
      ['CUT|\n\n!TO:\n\nnext', '!CUT|TO:\n\nnext'],
      ['SMASH CUT |\n\n!TO:', '!SMASH CUT |TO:'],
      ['in|\n\nt. house', '!in|t. house'],
      ['INT|\n\n!. HOUSE', '!INT|. HOUSE'],
    ])('a join: %s', (marked, after) => {
      expect(del(marked)).toBe(after);
    });

    test('a join from below is the same', () => {
      expect(back('BANG\n\n!|NOW\nnext')).toBe('!BANG|NOW\nnext');
    });

    test('a page break taken', () => {
      expect(back('NOW\n\n===|\nnext')).toBe('!NOW|\nnext');
    });

    test('a blank line taken', () => {
      expect(back('NOW\n|\nnext')).toBe('!NOW|\nnext');
      expect(del('NOW\n|\nnext')).toBe('!NOW\n|next');
    });

    test('a line emptied leaves the line under it what it was', () => {
      const state = moved(classicEditor('Go|\nNOW\nnext'), deleteGroupBackward);
      expect(render(state)).toBe('|\n!NOW\nnext');
    });

    test('in one undo', () => {
      const state = keys(classicEditor('BANG|\n\n!NOW\nnext', { with: [history()] }), 'Delete');
      expect(moved(state, undo).sliceDoc()).toBe('BANG\n\n!NOW\nnext');
    });

    test('a selection across lines is Fountain Mode’s', () => {
      expect(back('BA[NG\n\n!N]OW\nnext')).toBe('BA|OW\nnext');
    });
  });

  describe('retyping keeps the element', () => {
    test('a name selected and retyped', () => {
      expect(keys(classicEditor('[JUNE]\nHi.'), 'Backspace', 'BOB').sliceDoc()).toBe('BOB\nHi.');
    });

    test('a name deleted letter by letter and retyped', () => {
      let state = classicEditor('JUNE|\nHi.');
      for (let i = 0; i < 4; i++) state = keys(state, 'Backspace');
      expect(keys(state, 'BOB').sliceDoc()).toBe('BOB\nHi.');
    });

    test('a heading’s prefix deleted and retyped', () => {
      const state = moved(classicEditor('INT|. HOUSE'), deleteGroupBackward);
      expect(elementAt(state)?.kind).toBe('scene_heading');
      expect(keys(state, 'EXT').sliceDoc()).toBe('EXT. HOUSE');
    });

    test('action deleted to nothing is an empty line', () => {
      const state = keys(classicEditor('One.\n\nG|\n\nTwo.'), 'Backspace', 'int. x');
      expect(state.sliceDoc()).toBe('One.\n\nINT. X\n\nTwo.');
    });
  });

  describe('a speech line emptied', () => {
    const empties = (marked: string) => keys(classicEditor(marked), 'Backspace');

    test.each([['JUNE\nH|\nb'], ['JUNE\n**a|**\nb'], ['JUNE\n[[a|]]\nb']])(
      'the first letter goes on with the speech: %s',
      (marked) => {
        const state = empties(marked);
        expect(state.sliceDoc()).toBe('JUNE\n\nb');
        expect(keys(state, 'x').sliceDoc()).toBe('JUNE\nx\nb');
      },
    );

    test('leaving takes the line', () => {
      const state = empties('JUNE\nH|\nb');
      const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
      expect(left.sliceDoc()).toBe('JUNE\nb');
    });

    test('at the end of the speech nothing is held', () => {
      const state = empties('JUNE\nH|\n\nnext');
      const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
      expect(left.sliceDoc()).toBe('JUNE\n\n\nnext');
    });
  });

  test('a note alone on its line joins', () => {
    expect(back('One.\n\n[[|check]]\n\nnext')).toBe('One.|[[check]]\n\nnext');
  });

  test('an unclosed boneyard is left alone', () => {
    expect(back('/* cut\n|more')).toBe('/* cut|more');
  });
});
