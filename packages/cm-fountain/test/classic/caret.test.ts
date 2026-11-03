import { cursorCharLeft, cursorCharRight, cursorDocEnd } from '@codemirror/commands';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import {
  classicArrows,
  hiddenSpans,
  passedOver,
  visibleEnd,
  visibleStart,
} from '../../src/classic';
import { classicEditor, keys, render } from './harness';

type Motion = (view: EditorView) => boolean;

/** The state after a motion, in a real view. */
function moved(state: EditorState, motion: Motion): EditorState {
  const view = new EditorView({ state });
  try {
    motion(view);
    return view.state;
  } finally {
    view.destroy();
  }
}

const left = (state: EditorState) => moved(state, cursorCharLeft);
const right = (state: EditorState) => moved(state, cursorCharRight);

/** The cursor sent to `pos`, as a key's or the app's move does. */
const to = (state: EditorState, pos: number, userEvent?: string) =>
  state.update({ selection: { anchor: pos }, ...(userEvent ? { userEvent } : null) }).state;

/** A click: the cursor put at `pos`. */
const click = (state: EditorState, pos: number) => to(state, pos, 'select.pointer');

/**
 * Up or Down with a view that has no layout (jsdom has none): the same column on the next line, or
 * the goal column kept from the move before, as `view.moveVertically` does.
 */
function vertical(state: EditorState, forward: boolean): EditorState {
  const view = new EditorView({ state });
  view.moveVertically = (range, down = false) => {
    const line = view.state.doc.lineAt(range.head);
    const goal = range.goalColumn ?? range.head - line.from;
    const number = line.number + (down ? 1 : -1);
    if (number < 1 || number > view.state.doc.lines) return range;
    const target = view.state.doc.line(number);
    return EditorSelection.cursor(
      target.from + Math.min(goal, target.length),
      undefined,
      undefined,
      goal,
    );
  };
  try {
    classicArrows[forward ? 1 : 0]?.(view);
    return view.state;
  } finally {
    view.destroy();
  }
}

const kinds = (marked: string) => {
  const state = classicEditor(marked);
  const line = state.doc.line(state.doc.lines);
  return hiddenSpans(state, line).map(({ from, to: end, kind }) => [
    state.sliceDoc(from, end),
    kind,
  ]);
};

describe('hiddenSpans', () => {
  test('each kind of mark', () => {
    expect(kinds('!foo')).toEqual([['!', 'lead']]);
    expect(kinds('>x<')).toEqual([
      ['>', 'lead'],
      ['<', 'close'],
    ]);
    expect(kinds('# Act')).toEqual([['# ', 'lead']]);
    expect(kinds('= it goes')).toEqual([['= ', 'lead']]);
    expect(kinds('a **b** c')).toEqual([
      ['**', 'pair'],
      ['**', 'pair'],
    ]);
    expect(kinds('a \\*b')).toEqual([['\\', 'escape']]);
    expect(kinds('a [[n]] b|')).toEqual([
      ['[[', 'note'],
      [']]', 'note'],
    ]);
    expect(kinds('a /* b */ c')).toEqual([
      ['/*', 'boneyard'],
      ['*/', 'boneyard'],
    ]);
  });

  test('a mark and emphasis side by side are two', () => {
    expect(kinds('!**b**')).toEqual([
      ['!', 'lead'],
      ['**', 'pair'],
      ['**', 'pair'],
    ]);
  });

  test('marks that touch are one each', () => {
    expect(kinds('*a _b_*|')).toEqual([
      ['*', 'pair'],
      ['_', 'pair'],
      ['_', 'pair'],
      ['*', 'pair'],
    ]);
  });

  test('a dual mark', () => {
    const state = classicEditor('JUNE ^\nHi.');
    expect(hiddenSpans(state, state.doc.line(1)).map((span) => span.kind)).toEqual(['dual']);
  });

  test('a scene number and a title page show', () => {
    expect(kinds('INT. DINER - DAY #12#')).toEqual([]);
    const state = classicEditor('Title: Signal Hill\n\nx');
    expect(hiddenSpans(state, state.doc.line(1))).toEqual([]);
  });

  test('a note across lines hides each delimiter on its own line', () => {
    const state = classicEditor('a [[one\ntwo]] b|');
    expect(hiddenSpans(state, state.doc.line(1)).map((span) => span.kind)).toEqual(['note']);
    expect(hiddenSpans(state, state.doc.line(2)).map((span) => span.kind)).toEqual(['note']);
  });
});

describe('visibleStart and visibleEnd', () => {
  const ends = (marked: string, n = 1) => {
    const state = classicEditor(marked);
    const line = state.doc.line(n);
    return [visibleStart(state, line) - line.from, visibleEnd(state, line) - line.from];
  };

  test('past a mark and the space after it', () => {
    expect(ends('> CUT TO:')).toEqual([2, 9]);
  });

  test('before a closing mark and the space before it', () => {
    expect(ends('> a <')).toEqual([2, 3]);
    expect(ends('JUNE ^\nHi.')).toEqual([0, 4]);
  });

  test('a leading pair is hidden too, and a trailing one is passed', () => {
    expect(ends('**b**')).toEqual([2, 5]);
  });
});

describe('§6.4, the caret', () => {
  test('Left and Right step over a hidden mark as one', () => {
    const start = classicEditor('ab**c|d**');
    const after = right(start);
    expect(render(after)).toBe('ab**cd**|');
    expect(render(left(after))).toBe('ab**c|d**');
    const before = classicEditor('a|b**cd**');
    expect(render(right(before))).toBe('ab**|cd**');
    expect(render(left(right(before)))).toBe('a|b**cd**');
  });

  test('the cursor is never before a leading mark', () => {
    expect(render(right(classicEditor('Hi.|\n\n!foo')))).toBe('Hi.\n\n!|foo');
    expect(render(left(classicEditor('Hi.\n\n!|foo')))).toBe('Hi.|\n\n!foo');
    expect(render(left(classicEditor('!|foo')))).toBe('!|foo');
    expect(render(click(classicEditor('!fo|o'), 0))).toBe('!|foo');
  });

  test('reaching a line’s end goes on to the next element’s start', () => {
    expect(render(right(classicEditor('One.|\n\n@JUNE\nHi.')))).toBe('One.\n\n@|JUNE\nHi.');
    expect(render(left(classicEditor('One.\n\n@|JUNE\nHi.')))).toBe('One.|\n\n@JUNE\nHi.');
    expect(render(right(classicEditor('>One.|<\n\nTwo.')))).toBe('>One.<\n\n|Two.');
    expect(render(left(classicEditor('>One.<\n\n|Two.')))).toBe('>One.|<\n\nTwo.');
  });

  test('Home is the visible start and End the visible end', () => {
    const state = classicEditor('>On|e.<\n\nTwo.');
    expect(render(to(state, 0, 'select'))).toBe('>|One.<\n\nTwo.');
    expect(render(to(state, 6, 'select'))).toBe('>One.|<\n\nTwo.');
    expect(render(keys(classicEditor('>|One.<\n\nTwo.'), 'Home'))).toBe('>|One.<\n\nTwo.');
    expect(render(keys(classicEditor('>One.|<\n\nTwo.'), 'End'))).toBe('>One.|<\n\nTwo.');
  });

  test('Mod+End is the end of the last element', () => {
    expect(render(moved(classicEditor('|One.\n\n>Two.<'), cursorDocEnd))).toBe('One.\n\n>Two.|<');
    expect(render(moved(classicEditor('|One.\n\nTwo.\n\n'), cursorDocEnd))).toBe(
      'One.\n\nTwo.|\n\n',
    );
  });

  test('a click on a passed-over line is the end of the element above', () => {
    const state = classicEditor('|>One.<\n\nTwo.');
    expect(render(click(state, 7))).toBe('>One.|<\n\nTwo.');
    expect(render(click(classicEditor('>One.<\n\nTw|o.'), 7))).toBe('>One.|<\n\nTwo.');
  });

  test('Up and Down pass a blank line between elements and keep their column', () => {
    const state = classicEditor('Long one|.\n\nA line that is long.');
    const down = vertical(state, true);
    expect(render(down)).toBe('Long one.\n\nA line t|hat is long.');
    expect(render(vertical(down, false))).toBe('Long one|.\n\nA line that is long.');
    const short = vertical(
      classicEditor('A line that| is long.\n\nOne.\n\nA line that is long.'),
      true,
    );
    expect(render(short)).toBe('A line that is long.\n\nOne.|\n\nA line that is long.');
    expect(render(vertical(short, true))).toBe(
      'A line that is long.\n\nOne.\n\nA line that| is long.',
    );
  });

  test('an extra blank line is a place to stand', () => {
    const state = classicEditor('One.|\n\n\nTwo.');
    expect(passedOver(state, 5)).toBe(false);
    expect(render(right(state))).toBe('One.\n|\n\nTwo.');
    expect(render(vertical(state, true))).toBe('One.\n|\n\nTwo.');
  });

  test('the line just made is a place to stand', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(passedOver(state, state.selection.main.head)).toBe(false);
  });

  test('leaving a made line by Right lands past the blank line that’s left', () => {
    const state = keys(classicEditor('She waits.|\n\nHe leaves.'), 'Enter');
    expect(render(right(state))).toBe('She waits.\n\n|He leaves.');
  });

  test('goto and reveal never land in a mark', () => {
    const state = classicEditor('|One.\n\n@JUNE\nHi.\n\nA **b** c');
    expect(render(to(state, 6))).toBe('One.\n\n@|JUNE\nHi.\n\nA **b** c');
    expect(render(to(state, 5))).toBe('One.\n\n@|JUNE\nHi.\n\nA **b** c');
    expect(render(to(state, 19))).toBe('One.\n\n@JUNE\nHi.\n\nA **|b** c');
  });

  test('an extending selection isn’t moved', () => {
    const state = classicEditor('!fo|o');
    const next = state.update({ selection: { anchor: 3, head: 0 }, userEvent: 'select' }).state;
    expect(next.selection.main.from).toBe(0);
  });

  test('the caret steps over a mark beside an emoji', () => {
    const start = classicEditor('a😀**b**|');
    expect(render(left(left(start)))).toBe('a|😀**b**');
    expect(render(right(classicEditor('a|😀**b**')))).toBe('a😀**|b**');
  });

  test('a right-to-left line keeps its order', () => {
    const state = classicEditor('!שלו|ם');
    expect(state.selection.main.head).toBe(4);
    expect(render(to(state, 3, 'select'))).toBe('!של|ום');
    expect(render(to(state, 0, 'select'))).toBe('!|שלום');
  });

  test('the end of a note’s words is a place to stand', () => {
    expect(render(click(classicEditor('|a [[note]] b'), 8))).toBe('a [[note|]] b');
  });

  test('an unclosed /* isn’t hidden', () => {
    expect(kinds('a /* b')).toEqual([]);
  });

  test('a scene number is a place to stand', () => {
    const state = classicEditor('|INT. DINER #12#');
    expect(render(to(state, 13, 'select'))).toBe('INT. DINER #1|2#');
  });

  test('Right at the end of a closing mark just above the metadata block stays put', () => {
    // Found by the byte promise's property: the step off the line went to the block's limit, on
    // the same line, and asked again, for ever.
    const block = '/* drafter\n{"v":1,"template":"us-screenplay"}\n*/\n';
    const state = classicEditor(`|> cake. <\n\n${block}`);
    const end = moved(state, cursorDocEnd);
    expect(render(end)).toBe(`> cake.| <\n\n${block}`);
    expect(render(right(end))).toBe(`> cake.| <\n\n${block}`);
  });

  test('moving writes nothing', () => {
    const text = '>One.<\n\n@JUNE\nHi.\n\n**b** c\n\n\nEnd.';
    let state = classicEditor(`|${text}`);
    for (let i = 0; i < 40; i++) state = right(state);
    for (let i = 0; i < 40; i++) state = left(state);
    expect(state.sliceDoc()).toBe(text);
  });
});
