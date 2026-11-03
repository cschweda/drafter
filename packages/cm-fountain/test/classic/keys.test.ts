import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { appChange, makeElement, parsedDoc } from '@drafter/cm-fountain';
import { parse } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { visibleStart } from '../../src/classic/hidden';
import {
  choosePending,
  classicEnter,
  classicMove,
  classicShiftEnter,
  classicShiftTab,
  classicTab,
} from '../../src/classic/keys';
import { type ClassicKind, classicEdit, elementAt, setStored } from '../../src/classic/line';
import { apply, BOM, run } from '../helpers';
import { classicEditor, keys, render, type } from './harness';

const PLAY = builtins['stage-play-standard'] as Template;

/** A row: its name, the text with the cursor, the key, the text after, and the element being typed there. */
type Row = [name: string, before: string, key: string, after: string, on?: ClassicKind];

/** The state a row starts in: a stored element is the one thing the text can't say. */
function start(before: string, on: ClassicKind | undefined, template?: Template) {
  const state = classicEditor(before, template ? { template } : {});
  return on ? state.update({ effects: setStored.of({ kind: on }) }).state : state;
}

const rows = (table: Row[], template?: Template) =>
  test.each(table)('%s', (_name, before, key, after, on) => {
    expect(render(keys(start(before, on, template), key))).toBe(after);
  });

describe('§6.1, a line with text, cursor at its end', () => {
  rows([
    [
      'Scene heading: Enter goes to Action, a blank line',
      'INT. A - DAY|',
      'Enter',
      'INT. A - DAY\n\n|',
    ],
    [
      'Scene heading: Tab goes to Action, a blank line',
      'INT. A - DAY|',
      'Tab',
      'INT. A - DAY\n\n|',
    ],
    ['Action: Enter goes to Action, a blank line', 'She waits.|', 'Enter', 'She waits.\n\n|'],
    ['Action: Tab goes to Character, a blank line', 'She waits.|', 'Tab', 'She waits.\n\n|'],
    ['Character: Enter goes to Dialogue, one break', 'JUNE|', 'Enter', 'JUNE\n|', 'character'],
    ['Character: Tab goes to Dialogue, one break', 'JUNE|', 'Tab', 'JUNE\n|', 'character'],
    [
      'Parenthetical: Enter moves past ) and one break',
      'JUNE\n(softly|)',
      'Enter',
      'JUNE\n(softly)\n|',
    ],
    [
      'Parenthetical: Tab moves past ) and one break',
      'JUNE\n(softly|)',
      'Tab',
      'JUNE\n(softly)\n|',
    ],
    [
      'Dialogue, last line: Enter goes to Character, a blank line',
      'JUNE\nHello.|',
      'Enter',
      'JUNE\nHello.\n\n|',
    ],
    [
      'Dialogue, last line: Tab gives one break and (), the cursor inside',
      'JUNE\nHello.|',
      'Tab',
      'JUNE\nHello.\n(|)',
    ],
    [
      'Dialogue, an earlier line: Enter gives a new line of the speech',
      'JUNE\nHello.|\nAgain.',
      'Enter',
      'JUNE\nHello.\n|\nAgain.',
    ],
    [
      'Dialogue, an earlier line: Tab gives a Parenthetical',
      'JUNE\nHello.|\nAgain.',
      'Tab',
      'JUNE\nHello.\n(|)\nAgain.',
    ],
    ['Transition: Enter goes to Action, a blank line', 'CUT TO:|', 'Enter', 'CUT TO:\n\n|'],
    ['Transition: Tab goes to Action, a blank line', 'CUT TO:|', 'Tab', 'CUT TO:\n\n|'],
    ['Centered: Enter goes to Action, a blank line', '>THE END<|', 'Enter', '>THE END<\n\n|'],
    ['Centered: Tab goes to Action, a blank line', '>THE END<|', 'Tab', '>THE END<\n\n|'],
    ['Centered: the end is before its hidden <', '>THE END|<', 'Enter', '>THE END<\n\n|'],
    ['Lyric: Enter goes to Lyric, one break', '~La la|', 'Enter', '~La la\n|'],
    [
      'Lyric in a speech: Tab goes to Dialogue, one break',
      'JUNE\n~La la|',
      'Tab',
      'JUNE\n~La la\n|',
    ],
    ['Lyric outside a speech: Tab goes to Action, a blank line', '~La la|', 'Tab', '~La la\n\n|'],
    ['Section: Enter goes to Action, a blank line', '# Act|', 'Enter', '# Act\n\n|'],
    ['Section: Tab goes to Action, a blank line', '# Act|', 'Tab', '# Act\n\n|'],
    ['Synopsis: Enter goes to Action, a blank line', '= She runs.|', 'Enter', '= She runs.\n\n|'],
    ['Synopsis: Tab goes to Action, a blank line', '= She runs.|', 'Tab', '= She runs.\n\n|'],
  ]);

  test.each<[string, string, ClassicKind, ClassicKind?]>([
    ['Scene heading', 'INT. A - DAY|', 'action'],
    ['Transition', 'CUT TO:|', 'action'],
    ['Action, Tab', 'She waits.|', 'character', 'action'],
  ])('%s arrives where the table says', (_name, before, kind, on) => {
    expect(elementAt(keys(start(before, on), 'Tab'))?.kind).toBe(kind);
  });

  test('the elements arrive as the table says', () => {
    expect(elementAt(keys(start('JUNE|', 'character'), 'Enter'))?.kind).toBe('dialogue');
    expect(elementAt(keys(classicEditor('JUNE\nHello.|'), 'Enter'))?.kind).toBe('character');
    expect(elementAt(keys(classicEditor('JUNE\nHello.|'), 'Tab'))?.kind).toBe('parenthetical');
    expect(elementAt(keys(classicEditor('JUNE\n(softly|)'), 'Enter'))?.kind).toBe('dialogue');
    expect(elementAt(keys(classicEditor('~La la|'), 'Enter'))?.kind).toBe('lyric');
    expect(elementAt(keys(classicEditor('JUNE\n~La la|'), 'Tab'))?.kind).toBe('dialogue');
    expect(elementAt(keys(classicEditor('~La la|'), 'Tab'))?.kind).toBe('action');
  });

  test('the line after a Transition is soft Action, by Enter or Tab', () => {
    for (const key of ['Enter', 'Tab']) {
      expect(keys(classicEditor('CUT TO:|'), key, 'int. a').doc.line(3).text).toBe('INT. A');
    }
  });

  test('Tab on Action makes a firm Character, which INT. does not turn into a heading', () => {
    expect(keys(classicEditor('She waits.|'), 'Tab', 'int. a').doc.line(3).text).toBe('@INT. A');
  });

  test('the Character after a speech is worked out, so INT. starts a heading', () => {
    expect(keys(classicEditor('JUNE\nHello.|'), 'Enter', 'int. a').doc.line(4).text).toBe('INT. A');
  });

  test('a Lyric reached by Enter stays one past its first letter', () => {
    expect(render(keys(classicEditor('~La la|'), 'Enter', 'oh'))).toBe('~La la\n~oh|');
  });

  test('an Action reached by Enter stays one when a Character is typed in it', () => {
    expect(render(keys(classicEditor('She waits.|'), 'Enter', 'BANG'))).toBe('She waits.\n\nBANG|');
  });
});

describe('§6.1, a stage play', () => {
  rows(
    [
      ['Act: Enter goes to Scene, a blank line', '# ACT ONE|', 'Enter', '# ACT ONE\n\n|'],
      ['Act: Tab goes to Scene, a blank line', '# ACT ONE|', 'Tab', '# ACT ONE\n\n|'],
      [
        'Scene: Enter goes to Stage direction, a blank line',
        '## Scene One|',
        'Enter',
        '## Scene One\n\n|',
      ],
      [
        'Scene: Tab goes to Stage direction, a blank line',
        '## Scene One|',
        'Tab',
        '## Scene One\n\n|',
      ],
      [
        'Stage direction: Enter goes to Stage direction, a blank line',
        'She waits.|',
        'Enter',
        'She waits.\n\n|',
      ],
      [
        'Stage direction: Tab goes to Character, a blank line',
        'She waits.|',
        'Tab',
        'She waits.\n\n|',
      ],
      ['Character: Enter goes to Dialogue, one break', 'JUNE|', 'Enter', 'JUNE\n|', 'character'],
      [
        'Dialogue, last line: Enter goes to Character',
        'JUNE\nHello.|',
        'Enter',
        'JUNE\nHello.\n\n|',
      ],
    ],
    PLAY,
  );

  const editing = (marked: string) => classicEditor(marked, { template: PLAY });

  test('Scene after an Act is firm, and survives its first letter', () => {
    const state = keys(editing('# ACT ONE|'), 'Enter');
    expect(elementAt(state)?.kind).toBe('scene_heading');
    expect(render(type(state, 'A'))).toBe('# ACT ONE\n\n## A|');
    expect(render(keys(editing('# ACT ONE|'), 'Tab', 'A'))).toBe('# ACT ONE\n\n## A|');
  });

  test('a stage direction is never soft', () => {
    expect(keys(editing('## Scene One|'), 'Enter', 'int. a').doc.line(3).text).toBe('!int. a');
  });

  test('Stage direction, Tab, is a Character', () => {
    expect(elementAt(keys(editing('She waits.|'), 'Tab'))?.kind).toBe('character');
  });
});

describe('an element already below', () => {
  rows([
    [
      'a blank line below: one is added under the new line',
      'She waits.|\n\nHe leaves.',
      'Enter',
      'She waits.\n\n|\n\nHe leaves.',
    ],
    [
      'two blank lines below: one more',
      'She waits.|\n\n\nHe leaves.',
      'Enter',
      'She waits.\n\n|\n\nHe leaves.',
    ],
    [
      'three blank lines below: nothing is written',
      'She waits.|\n\n\n\nHe leaves.',
      'Enter',
      'She waits.\n\n|\n\nHe leaves.',
    ],
    [
      'a line straight under gets a blank line each side',
      'INT. A|\nHe leaves.',
      'Enter',
      'INT. A\n\n|\n\nHe leaves.',
    ],
    [
      'one blank line at the end of the file: one more',
      'She waits.|\n',
      'Enter',
      'She waits.\n\n|',
    ],
    [
      'two at the end of the file: nothing is written',
      'She waits.|\n\n',
      'Enter',
      'She waits.\n\n|',
    ],
    ['Enter on a name with a speech goes into it', 'JUNE|\nHello.', 'Enter', 'JUNE\nHello.|'],
    ['Tab on a name with a speech goes into it', 'JUNE|\nHello.', 'Tab', 'JUNE\nHello.|'],
    [
      'Tab on a name with a parenthetical goes into it',
      'JU|NE\n(softly)\nHello.',
      'Tab',
      'JUNE\n(softly)|\nHello.',
    ],
  ]);

  test('moving into a speech writes nothing, and says it moved', () => {
    const [tr] = run(classicEditor('JUNE|\nHello.'), classicEnter).transactions;
    expect(tr?.docChanged).toBe(false);
    expect(tr?.annotation(classicMove)).toBe(true);
  });
});

describe('§6.2, an empty line', () => {
  rows([
    ['Action: Enter writes nothing until the chooser', 'A.\n\n|', 'Enter', 'A.\n\n|'],
    ['Dialogue: Tab writes (), the cursor inside', 'JUNE\n|', 'Tab', 'JUNE\n(|)', 'dialogue'],
    ['Dialogue: Enter writes nothing until the chooser', 'JUNE\n|', 'Enter', 'JUNE\n|', 'dialogue'],
    [
      'Dialogue: Shift+Tab goes back to the end of the name',
      'JUNE\n|',
      'Shift-Tab',
      'JUNE|',
      'dialogue',
    ],
    [
      'Dialogue under a speech: Shift+Tab goes to the line above',
      'JUNE\nHello.\n|',
      'Shift-Tab',
      'JUNE\nHello.|',
    ],
    [
      'Dialogue with a line below: Shift+Tab leaves the line, so the speech keeps to itself',
      'JUNE\n|\nHe leaves.',
      'Shift-Tab',
      'JUNE|\n\nHe leaves.',
      'dialogue',
    ],
    ['An empty Parenthetical: Enter removes ()', 'JUNE\n(|)', 'Enter', 'JUNE\n|'],
    ['An empty Parenthetical: Tab removes ()', 'JUNE\n(|)', 'Tab', 'JUNE\n|'],
    ['An empty Parenthetical: Shift+Tab removes ()', 'JUNE\n(|)', 'Shift-Tab', 'JUNE\n|'],
  ]);

  test('back on the name it is a name, and Enter goes to Dialogue again', () => {
    const state = keys(start('JUNE|', 'character'), 'Enter', 'Shift-Tab');
    expect(elementAt(state)?.kind).toBe('character');
    expect(render(keys(state, 'Enter'))).toBe('JUNE\n|');
  });

  test('() removed is pending Dialogue', () => {
    const state = keys(classicEditor('JUNE\n(|)'), 'Enter');
    expect(elementAt(state)).toMatchObject({ kind: 'dialogue', pending: true });
  });

  const walked = (template: Template | undefined, ...steps: string[]) => {
    const seen: (string | undefined)[] = [];
    let state = classicEditor('A.\n\n|', template ? { template } : {});
    for (const step of steps) {
      state = keys(state, step);
      expect(render(state)).toBe('A.\n\n|');
      seen.push(elementAt(state)?.kind);
    }
    return seen;
  };

  test('Tab walks the row and writes nothing', () => {
    expect(walked(undefined, 'Tab', 'Tab', 'Tab', 'Tab')).toEqual([
      'character',
      'transition',
      'scene_heading',
      'action',
    ]);
    expect(walked(PLAY, 'Tab', 'Tab', 'Tab', 'Tab')).toEqual([
      'character',
      'act',
      'scene_heading',
      'action',
    ]);
  });

  test('Shift+Tab walks back', () => {
    expect(walked(undefined, 'Shift-Tab', 'Shift-Tab', 'Shift-Tab', 'Shift-Tab')).toEqual([
      'scene_heading',
      'transition',
      'character',
      'action',
    ]);
    expect(walked(PLAY, 'Shift-Tab', 'Shift-Tab', 'Shift-Tab', 'Shift-Tab')).toEqual([
      'scene_heading',
      'act',
      'character',
      'action',
    ]);
  });

  test('what the walk reaches is what the next letter types', () => {
    const state = keys(classicEditor('A.\n\n|'), 'Tab', 'Tab', 'fade out.');
    expect(state.doc.line(3).text).toBe('>FADE OUT.');
  });

  test('an Action walked to is firm', () => {
    const state = keys(classicEditor('A.\n\n|'), 'Tab', 'Tab', 'Tab', 'Tab', 'INT. A');
    expect(state.doc.line(3).text).toBe('!INT. A');
  });

  test('choosePending sets the pending element and writes nothing', () => {
    const state = apply(classicEditor('A.\n\n|'), choosePending('lyric'));
    expect(render(state)).toBe('A.\n\n|');
    expect(elementAt(state)).toMatchObject({ kind: 'lyric', pending: true, soft: false });
    expect(render(type(state, 'a'))).toBe('A.\n\n~a|');
  });

  test('choosePending takes no line with text', () => {
    expect(run(classicEditor('A.|'), choosePending('lyric')).handled).toBe(false);
  });
});

describe('§6.3, the cursor mid-line', () => {
  rows([
    ['Action: Enter splits into two action paragraphs', 'She |waits.', 'Enter', 'She \n\n|waits.'],
    [
      'Action: Tab goes to a new Character below, with no split',
      'She |waits.',
      'Tab',
      'She waits.\n\n|',
    ],
    ['Dialogue: Enter splits, one break', 'JUNE\nHel|lo.', 'Enter', 'JUNE\nHel\n|lo.'],
    [
      'Dialogue: Tab gives a Parenthetical below, with no split',
      'JUNE\nHel|lo.',
      'Tab',
      'JUNE\nHello.\n(|)',
    ],
    ['Scene heading: Enter splits', 'INT. A|B', 'Enter', 'INT. A\n\n|B'],
    ['Scene heading: Tab as at the end', 'INT. A|B', 'Tab', 'INT. AB\n\n|'],
    ['Transition: Enter splits', 'CUT |TO:', 'Enter', 'CUT \n\n!|TO:'],
    ['Transition: Tab as at the end', 'CUT |TO:', 'Tab', 'CUT TO:\n\n|'],
    ['Character: Enter makes the rest Dialogue', 'JU|NE', 'Enter', 'JU\n|NE', 'character'],
    ['Character: Tab goes to Dialogue', 'JU|NE', 'Tab', 'JUNE\n|', 'character'],
    ['Parenthetical: Enter goes past the )', 'JUNE\n(so|ftly)', 'Enter', 'JUNE\n(softly)\n|'],
    ['Parenthetical: Tab, the same', 'JUNE\n(so|ftly)', 'Tab', 'JUNE\n(softly)\n|'],
    [
      'At a line’s start: one break, and the line stays what it is',
      '|She waits.',
      'Enter',
      '\n|She waits.',
    ],
  ]);

  test('Tab never splits a line', () => {
    for (const marked of [
      'She |waits.',
      'INT. A|B',
      'CUT |TO:',
      'JUNE\nHel|lo.',
      'JUNE\n(so|ftly)',
    ]) {
      const state = classicEditor(marked);
      const words = state.doc.line(state.doc.lineAt(state.selection.main.head).number).text;
      const after = keys(state, 'Tab');
      expect(after.doc.toString().split('\n')).toContain(words);
    }
  });

  test('the second part of a heading is Action, with the mark it needs', () => {
    expect(elementAt(keys(classicEditor('INT. A|B'), 'Enter'))?.kind).toBe('action');
    expect(render(keys(classicEditor('INT. A|.B\n'), 'Enter'))).toBe('INT. A\n\n!|.B\n');
  });

  test('the second part of an Action that reads as a heading gets its !', () => {
    expect(render(keys(classicEditor('She said |INT. BY THE DOOR'), 'Enter'))).toBe(
      'She said \n\n!|INT. BY THE DOOR',
    );
  });

  test('the rest of a name is Dialogue', () => {
    expect(elementAt(keys(start('JU|NE', 'character'), 'Enter'))?.kind).toBe('dialogue');
  });
});

describe('§6.3, selections and several cursors', () => {
  test('Tab collapses a selection and writes nothing', () => {
    const state = keys(classicEditor('She [waits].\n\nHe leaves.'), 'Tab');
    expect(render(state)).toBe('She waits|.\n\nHe leaves.');
    const [tr] = run(classicEditor('She [waits].'), classicTab).transactions;
    expect(tr?.annotation(classicMove)).toBe(true);
  });

  test('the next Tab moves on', () => {
    expect(render(keys(classicEditor('She [waits].'), 'Tab', 'Tab'))).toBe('She waits.\n\n|');
  });

  test('Enter replaces a selection with one break', () => {
    expect(render(keys(classicEditor('She [waits].'), 'Enter'))).toBe('She \n|.');
  });

  test('several cursors fall through to Fountain’s Enter', () => {
    const state = classicEditor('One\n\nTwo', {
      with: [EditorState.allowMultipleSelections.of(true)],
    });
    const many = state.update({
      selection: state.selection.addRange(EditorSelection.cursor(0)),
    }).state;
    expect(render(keys(many, 'Enter'))).toBe('\n|One\n\nTwo\n');
  });
});

describe('§6.4, Shift+Tab and Shift+Enter', () => {
  rows([
    [
      'Shift+Tab on a line with text goes to the end of the element above',
      'She waits.\n\nHe |leaves.',
      'Shift-Tab',
      'She waits.|\n\nHe leaves.',
    ],
    [
      'Shift+Tab inside a speech goes up one',
      'JUNE\nHello.\n(softly|)',
      'Shift-Tab',
      'JUNE\nHello.|\n(softly)',
    ],
    ['Shift+Tab at the top stays', 'She |waits.', 'Shift-Tab', 'She |waits.'],
    [
      'Shift+Tab stays under a title page',
      'Title: Signal Hill\n\nShe |waits.',
      'Shift-Tab',
      'Title: Signal Hill\n\nShe |waits.',
    ],
  ]);

  test('Shift+Tab at the top is Classic’s, so a name doesn’t become action', () => {
    const state = classicEditor('JU|NE\nHello.');
    expect(render(keys(state, 'Shift-Tab'))).toBe('JU|NE\nHello.');
  });

  rows([
    ['Shift+Enter at the end of BANG writes !BANG', 'BANG|', 'Shift-Enter', '!BANG\n|'],
    [
      // A lone name opened in a file is a line the cursor came back to: Action, with Action
      // pending under it (the rulings on Task 13), so Shift+Enter does what Enter does.
      'Shift+Enter under a lone name the cursor came back to writes nothing',
      'JUNE\n|',
      'Shift-Enter',
      'JUNE\n|',
    ],
    ['Shift+Enter in a line of action is one break', 'She waits.|', 'Shift-Enter', 'She waits.\n|'],
    [
      'Shift+Enter in the middle of a line of action',
      'She |waits.',
      'Shift-Enter',
      'She \n|waits.',
    ],
    ['Shift+Enter in the middle of BANG marks the part left', 'BA|NG', 'Shift-Enter', '!BA\n|NG'],
    [
      'Shift+Enter at the end of dialogue is one break',
      'JUNE\nHello.|',
      'Shift-Enter',
      'JUNE\nHello.\n|',
    ],
    [
      'Shift+Enter under a line of action marks nothing',
      'She waits.\nBANG|',
      'Shift-Enter',
      'She waits.\nBANG\n|',
    ],
    [
      'Shift+Enter elsewhere does what Enter does',
      'INT. A - DAY|',
      'Shift-Enter',
      'INT. A - DAY\n\n|',
    ],
    ['Shift+Enter elsewhere, on an empty Parenthetical', 'JUNE\n(|)', 'Shift-Enter', 'JUNE\n|'],
    ['Shift+Enter elsewhere, on an empty line', 'A.\n\n|', 'Shift-Enter', 'A.\n\n|'],
    ['Shift+Enter elsewhere, mid-dialogue', 'JUNE\nHel|lo.', 'Shift-Enter', 'JUNE\nHel\n|lo.'],
  ]);

  test('Shift+Enter on the empty line under a name just typed writes two spaces', () => {
    expect(render(keys(classicEditor('|'), 'Tab', 'june', 'Enter', 'Shift-Enter'))).toBe(
      'JUNE\n  |',
    );
  });

  test('under capitals the cursor came back to, Action is pending, and Tab walks the row from it', () => {
    const state = classicEditor('BANG\n|');
    expect(elementAt(state)).toMatchObject({ kind: 'action', pending: true });
    const tabbed = keys(state, 'Tab');
    expect(render(tabbed)).toBe('BANG\n|');
    expect(elementAt(tabbed)?.kind).toBe('character');
  });

  test.each([
    ['a letter', 'x', '!BANG\nx|'],
    ['Shift+Enter', 'Shift-Enter', 'BANG\n|'],
  ])(
    'capitals the cursor came back to stay Action under %s on the line below',
    (_n, key, after) => {
      const state = keys(classicEditor('BANG\n|'), key);
      expect(render(state)).toBe(after);
      expect(parse(state.doc.toString()).blocks[0]?.kind).toBe('action');
    },
  );

  test('Shift+Tab under capitals the cursor came back to walks the row, writing nothing', () => {
    const back = keys(classicEditor('BANG\n|'), 'Shift-Tab');
    expect(render(back)).toBe('BANG\n|');
    expect(parse(back.doc.toString()).blocks[0]?.kind).toBe('action');
  });

  test('a name typed, then a change the app makes elsewhere, is still a name', () => {
    let state = keys(classicEditor('|'), 'Tab', 'june', 'Enter');
    state = state.update({
      changes: { from: 0, insert: 'A.\n\n' },
      annotations: appChange.of(true),
    }).state;
    expect(render(type(state, 'Hi.'))).toBe('A.\n\nJUNE\nHi.|');
  });

  test.each([
    [
      'Enter at its end',
      'A door.|\nBANG\nIt echoes.',
      'Enter',
      'A door.\n\n|\n\n!BANG\nIt echoes.',
    ],
    ['Tab at its end', 'A door.|\nBANG\nIt echoes.', 'Tab', 'A door.\n\n|\n\n!BANG\nIt echoes.'],
    ['Tab mid-line', 'A do|or.\nBANG\nIt echoes.', 'Tab', 'A door.\n\n|\n\n!BANG\nIt echoes.'],
    ['Enter mid-line', 'A door.\nBA|NG\nIt echoes.', 'Enter', 'A door.\nBA\n\n!|NG\nIt echoes.'],
    ['Enter at its start', 'A door.\n|BANG\nIt echoes.', 'Enter', 'A door.\n\n!|BANG\nIt echoes.'],
  ])(
    'a key in an Action paragraph keeps the capitals it leaves below as Action: %s',
    (_n, before, key, after) => {
      const state = keys(classicEditor(before), key);
      expect(render(state)).toBe(after);
      const kinds = parse(state.doc.toString()).blocks.map((block) => block.kind);
      expect(kinds.every((kind) => kind === 'action')).toBe(true);
    },
  );

  test('left unused, the line Enter made goes, and the ! it wrote below with it', () => {
    const state = keys(classicEditor('A door.|\nBANG\nIt echoes.'), 'Enter');
    const away = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
    expect(away.doc.toString()).toBe('A door.\nBANG\nIt echoes.');
  });

  test('a name typed and gone on from is still a name, its speech under it', () => {
    const state = keys(classicEditor('|'), 'Tab', 'june', 'Enter', 'Hi.');
    expect(render(state)).toBe('JUNE\nHi.|');
    const tabbed = keys(classicEditor('|'), 'Tab', 'june', 'Enter', 'Tab', 'softly');
    expect(render(tabbed)).toBe('JUNE\n(softly|)');
  });

  test('the line after Shift+Enter stays in its element', () => {
    expect(render(keys(classicEditor('BANG|'), 'Shift-Enter', 'INT.'))).toBe('!BANG\nINT.|');
    const state = keys(classicEditor('JUNE\nHello.|'), 'Shift-Enter');
    expect(elementAt(state)?.kind).toBe('dialogue');
  });
});

describe('where the keys give way', () => {
  const COMMANDS = [classicEnter, classicTab, classicShiftTab, classicShiftEnter];

  test('a read-only editor gives Tab back', () => {
    const state = classicEditor('She waits.|', { with: [EditorState.readOnly.of(true)] });
    for (const command of COMMANDS) expect(run(state, command).handled).toBe(false);
    expect(render(keys(state, 'Tab'))).toBe('She waits.|');
  });

  const STANDING_BACK = [
    'Title: Signal| Hill\n\nA.',
    'A.\n\n[[a no|te]]\n\nB.',
    'A.\n\n/* gone\nstill| gone */',
    // A line that starts in a boneyard, the cursor past its end: Fountain's Tab made it a cue.
    'A.\n\n/* gone\nknows the. */ more|',
  ];

  test('on the title page, in a note, and in a boneyard, Tab and Shift+Tab write nothing', () => {
    // The ruling on Task 13: Classic takes them, so Fountain's Tab never runs there; Esc then Tab leaves.
    for (const marked of STANDING_BACK) {
      const state = classicEditor(marked);
      for (const command of [classicTab, classicShiftTab]) {
        const pressed = run(state, command);
        expect(pressed.handled, marked).toBe(true);
        expect(pressed.state.doc.eq(state.doc), marked).toBe(true);
      }
      for (const command of [classicEnter, classicShiftEnter]) {
        expect(run(state, command).handled, marked).toBe(false);
      }
      expect(render(keys(state, 'Tab'))).toBe(render(state));
      expect(render(keys(state, 'Shift-Tab'))).toBe(render(state));
    }
  });

  test('there, Esc then Tab still goes to the browser, to leave the text', () => {
    for (const marked of STANDING_BACK) {
      const parent = document.createElement('div');
      document.body.append(parent);
      const view = new EditorView({ state: classicEditor(marked), parent });
      try {
        const tab = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            keyCode: 9,
            bubbles: true,
            cancelable: true,
          });
          view.contentDOM.dispatchEvent(event);
          return event.defaultPrevented;
        };
        expect(tab(), `${marked}: Tab is Classic's`).toBe(true);
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            keyCode: 27,
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(tab(), `${marked}: Esc then Tab is the browser's`).toBe(false);
        expect(render(view.state)).toBe(render(classicEditor(marked)));
      } finally {
        view.destroy();
        parent.remove();
      }
    }
  });

  test('Shift+Alt+M on a Mac turns on Tab focus mode, read by the key’s place, not its letter', () => {
    // Option+Shift+M types a letter on a Mac ("Â" on a US layout), which CodeMirror's own binding,
    // `Shift-Alt-m`, never matches there; the escape the help page names must still work (§12).
    const platform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({ state: classicEditor('One.|'), parent });
    try {
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', {
          key,
          code: 'KeyM',
          keyCode: 77,
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const tab = () => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          keyCode: 9,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(press('Â')).toBe(true);
      expect(tab(), 'Tab is the browser’s').toBe(false);
      expect(tab(), 'and stays so').toBe(false);
      expect(press('Â')).toBe(true);
      expect(tab(), 'Tab is Classic’s again').toBe(true);
      expect(view.state.doc.toString().startsWith('One.')).toBe(true);
    } finally {
      view.destroy();
      parent.remove();
      delete (navigator as unknown as Record<string, unknown>).platform;
      if (platform) Object.defineProperty(Navigator.prototype, 'platform', platform);
    }
  });

  test('several cursors give every key back', () => {
    const state = classicEditor('One\n\nTwo', {
      with: [EditorState.allowMultipleSelections.of(true)],
    });
    const many = state.update({
      selection: state.selection.addRange(EditorSelection.cursor(0)),
    }).state;
    expect(many.selection.ranges).toHaveLength(2);
    for (const command of COMMANDS) expect(run(many, command).handled).toBe(false);
  });
});

describe('every key is Classic’s own', () => {
  test('each transaction carries classicEdit, and a stored line outlives one that writes nothing', () => {
    const state = classicEditor('A.\n\n|');
    expect(run(state, classicTab).transactions[0]?.annotation(classicEdit)).toBe(true);
    expect(run(state, classicEnter).transactions[0]?.annotation(classicEdit)).toBe(true);
    expect(elementAt(keys(state, 'Tab', 'Enter'))?.kind).toBe('character');
  });

  test('a key that writes something is no move', () => {
    const [tr] = run(classicEditor('A.|'), classicEnter).transactions;
    expect(tr?.annotation(classicMove)).toBeUndefined();
  });
});

describe('the file', () => {
  const crlf = (marked: string) =>
    classicEditor(marked, { with: [EditorState.lineSeparator.of('\r\n')] });

  test('a CRLF file gets CRLF', () => {
    expect(keys(crlf('INT. A|'), 'Enter').sliceDoc()).toBe('INT. A\r\n\r\n');
    expect(keys(crlf('JUNE\nHello.|'), 'Tab').sliceDoc()).toBe('JUNE\r\nHello.\r\n()');
    expect(keys(crlf('She |waits.'), 'Enter').sliceDoc()).toBe('She \r\n\r\nwaits.');
    expect(keys(crlf('BANG|'), 'Shift-Enter').sliceDoc()).toBe('!BANG\r\n');
  });

  test('a byte-order mark stays', () => {
    expect(render(keys(classicEditor(`${BOM}INT. A|`), 'Enter'))).toBe(`${BOM}INT. A\n\n|`);
    expect(render(keys(classicEditor(`${BOM}BANG|`), 'Shift-Enter'))).toBe(`${BOM}!BANG\n|`);
    expect(render(keys(classicEditor(`${BOM}|She`), 'Enter'))).toBe(`${BOM}\n|She`);
  });
});

describe('undo', () => {
  const undoable = (marked: string) => classicEditor(marked, { with: [history()] });

  test.each<[string, string, ClassicKind?]>([
    ['Enter', 'She waits.|'],
    ['Tab', 'She waits.|'],
    ['Enter', 'She |waits.'],
    ['Tab', 'JUNE\nHello.|'],
    ['Shift-Enter', 'BANG|'],
    // Dialogue stored, as Enter from a name leaves it: a lone name come back to is Action.
    ['Shift-Enter', 'JUNE\n|', 'dialogue'],
    ['Enter', 'JUNE\n(|)'],
    ['Shift-Tab', 'JUNE\n|', 'dialogue'],
    ['Enter', 'JU|NE', 'character'],
  ])(
    'each key is one undo step and undo gives the exact text back: %s on %s',
    (key, marked, on) => {
      const state = undoable(marked);
      const before = state.update(on ? { effects: setStored.of({ kind: on }) } : {}).state;
      const pressed = keys(before, key);
      expect(pressed.doc.eq(before.doc)).toBe(false);
      expect(apply(pressed, undo).sliceDoc()).toBe(before.sliceDoc());
    },
  );

  test('undo after a bar change gives the text back', () => {
    const state = undoable('She waits|');
    const barred = apply(state, makeElement('lyric'));
    expect(barred.sliceDoc()).toBe('~She waits');
    const typed = type(keys(barred, 'Enter'), 'la');
    let back = apply(typed, undo);
    back = apply(back, undo);
    back = apply(back, undo);
    expect(back.sliceDoc()).toBe('She waits');
  });
});

describe('the agreed flow', () => {
  /** The six steps, with the words typed where autofill will later help. */
  const flow = (state: EditorState) =>
    keys(
      state,
      // 1. Scene heading: type INT., then the place, and Enter goes to Action.
      'int. diner - night',
      'Enter',
      // 2. Action: Enter starts a new action line. Tab goes to Character.
      'June sits.',
      'Enter',
      'The radio hums.',
      'Tab',
      // 3. Character: the name, and Tab goes to Dialogue.
      'june',
      'Tab',
      // 4. Dialogue: Tab goes to a Parenthetical.
      'Hello.',
      'Tab',
      'softly',
      // 5. After a Parenthetical, Enter goes back to Dialogue.
      'Enter',
      'Anyone here?',
      // 4 again. Dialogue: Enter goes to the next Character.
      'Enter',
      'dale',
      'Enter',
      'Just me.',
      'Enter',
    );

  const WRITTEN = [
    'INT. DINER - NIGHT',
    '',
    'June sits.',
    '',
    'The radio hums.',
    '',
    'JUNE',
    'Hello.',
    '(softly)',
    'Anyone here?',
    '',
    'DALE',
    'Just me.',
    '',
    '',
  ].join('\n');

  test('the agreed flow, key by key, on a blank script', () => {
    const state = flow(classicEditor(''));
    expect(state.sliceDoc()).toBe(WRITTEN);
    // 6. Enter on an empty line writes nothing: Task 9's chooser opens there.
    expect(keys(state, 'Enter').sliceDoc()).toBe(WRITTEN);
  });

  test('the agreed flow, key by key, on a script with a following scene', () => {
    const NEXT_SCENE = '\n\nEXT. ROAD - DAY\n\nDale drives.';
    const state = flow(classicEditor(`|${NEXT_SCENE}`));
    expect(state.sliceDoc()).toBe(`${WRITTEN}${NEXT_SCENE}`);
  });
});

describe('what a key leaves reads right', () => {
  /** What the parser reads at each line with text, in order. */
  const kinds = (state: EditorState) => state.field(parsedDoc).blocks.map((block) => block.kind);

  describe('a key never cuts a speech', () => {
    rows([
      [
        'Enter at the start of a speech line opens a line above it',
        'JUNE\n|Hello.',
        'Enter',
        'JUNE\n|\nHello.',
      ],
      ['Shift+Enter there too', 'JUNE\n|Hello.', 'Shift-Enter', 'JUNE\n|\nHello.'],
      ['Enter at the start of a lyric in a speech', 'JUNE\n~|La', 'Enter', 'JUNE\n|\n~La'],
      [
        'Enter on a Parenthetical with speech below',
        'JUNE\n(soft|ly)\nHello.',
        'Enter',
        'JUNE\n(softly)\n|\nHello.',
      ],
      [
        'Tab on a Parenthetical with speech below',
        'JUNE\n(soft|ly)\nHello.',
        'Tab',
        'JUNE\n(softly)\n|\nHello.',
      ],
      ['Enter on a lyric with speech below', 'JUNE\n~La|\nHi.', 'Enter', 'JUNE\n~La\n|\nHi.'],
      [
        'Shift+Enter at the end of dialogue with speech below',
        'JUNE\nHi.|\nAgain.',
        'Shift-Enter',
        'JUNE\nHi.\n|\nAgain.',
      ],
      ['Enter in an empty () with speech under', 'JUNE\n(|)\nHello.', 'Enter', 'JUNE\n|\nHello.'],
      ['Tab in an empty () with speech under', 'JUNE\n(|)\nHello.', 'Tab', 'JUNE\n|\nHello.'],
      [
        'Shift+Tab in an empty () with speech under',
        'JUNE\n(|)\nHello.',
        'Shift-Tab',
        'JUNE\n|\nHello.',
      ],
    ]);

    test.each([
      ['JUNE\n(soft|ly)\nHello.'],
      ['JUNE\nHi.|\nAgain.'],
      ['JUNE\n|Hello.'],
      ['JUNE\n(|)\nHello.'],
    ])('the first letter on the line %s opens heals the speech', (marked) => {
      const after = kinds(keys(classicEditor(marked), 'Enter', 'x'));
      expect(after).not.toContain('action');
      expect(after[0]).toBe('character');
    });

    test('the new line is pending Dialogue', () => {
      const state = keys(classicEditor('JUNE\nHi.|\nAgain.'), 'Enter');
      expect(elementAt(state)).toMatchObject({
        kind: 'dialogue',
        pending: true,
        tab: 'parenthetical',
      });
    });

    test('the first letter continues the speech with one break', () => {
      const state = keys(classicEditor('JUNE\nHi.|\nAgain.'), 'Enter', 'S');
      expect(render(state)).toBe('JUNE\nHi.\nS|\nAgain.');
    });

    const left = (state: EditorState, anchor = 0, userEvent = 'select.pointer') =>
      state.update({ selection: { anchor }, userEvent }).state;
    const SPEECH = 'JUNE\nHi.|\nAgain.';
    const ORIGINAL = 'JUNE\nHi.\nAgain.';

    test('Enter, a letter, Backspace, and leaving give the text back', () => {
      const typed = keys(classicEditor(SPEECH), 'Enter', 'x');
      const { head } = typed.selection.main;
      const gone = typed.update({
        changes: { from: head - 1, to: head },
        userEvent: 'delete.backward',
      }).state;
      expect(left(gone).sliceDoc()).toBe(ORIGINAL);
    });

    test('Enter and leaving give the text back', () => {
      expect(left(keys(classicEditor(SPEECH), 'Enter')).sliceDoc()).toBe(ORIGINAL);
    });

    test('Enter, ArrowLeft, and typing lose nothing', () => {
      const state = keys(classicEditor(SPEECH), 'Enter');
      const moved = left(state, state.selection.main.head - 1, 'select');
      expect(render(type(moved, 'x'))).toBe('JUNE\nHi.x|\nAgain.');
    });

    test('a lyric’s new line, Tab, and a letter write no mark into the speech', () => {
      const state = keys(classicEditor('JUNE\n~La|\nHi.'), 'Enter', 'Tab', 'x');
      expect(render(state)).toBe('JUNE\n~La\n(x|)\nHi.');
    });

    test('Shift+Tab off a lyric’s new line goes back, with the line', () => {
      const state = keys(classicEditor('JUNE\n~La|\nHi.'), 'Enter', 'Shift-Tab');
      expect(render(state)).toBe('JUNE\n~La|\nHi.');
    });

    test('Shift+Enter twice, then a letter, replaces the spaces', () => {
      const state = keys(classicEditor('JUNE\nHi.|'), 'Shift-Enter', 'Shift-Enter', 'x');
      expect(render(state)).toBe('JUNE\nHi.\nx|');
    });

    // A name typed and gone on from: a lone name the cursor came back to stays Action (ruling).
    const typedName = () => keys(classicEditor('|'), 'Tab', 'june', 'Enter');

    test('a letter between the two spaces is kept, and they go', () => {
      const state = keys(typedName(), 'Shift-Enter');
      const between = state.update({ selection: { anchor: state.doc.length - 1 } }).state;
      expect(render(type(between, 'x'))).toBe('JUNE\nx|');
    });

    test('two spaces in a file are replaced the same way', () => {
      expect(render(type(classicEditor('JUNE\nHi.\n  |\nAgain.'), 'x'))).toBe(
        'JUNE\nHi.\nx|\nAgain.',
      );
    });

    test('a space typed on them changes nothing, so it can’t cut the speech', () => {
      expect(render(type(classicEditor('JUNE\n  |'), ' '))).toBe('JUNE\n  |');
      const between = 'JUNE\nHi.\n |\nAgain.'.replace(' |', '  ');
      const state = classicEditor(between);
      const at = state.update({ selection: { anchor: 'JUNE\nHi.\n '.length } }).state;
      expect(type(at, ' ').sliceDoc()).toBe('JUNE\nHi.\n  \nAgain.');
    });

    test('a deliberate blank speech line stays when it’s left', () => {
      const state = keys(typedName(), 'Shift-Enter');
      expect(left(state).sliceDoc()).toBe('JUNE\n  ');
    });

    test('a lyric’s new line in a speech gets its ~ with the first letter', () => {
      const state = keys(classicEditor('JUNE\n~La|\nHi.'), 'Enter', 'oh');
      expect(render(state)).toBe('JUNE\n~La\n~oh|\nHi.');
    });

    test('Enter at the start, left, is gone', () => {
      const state = keys(classicEditor('JUNE\n|Hello.'), 'Enter');
      const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
      expect(left.sliceDoc()).toBe('JUNE\nHello.');
    });

    test('Tab on the new line writes ()', () => {
      expect(render(keys(classicEditor('JUNE\nHi.|\nAgain.'), 'Enter', 'Tab'))).toBe(
        'JUNE\nHi.\n(|)\nAgain.',
      );
    });

    test('a new line left is gone, and Shift+Tab leaves it too', () => {
      const state = keys(classicEditor('JUNE\nHi.|\nAgain.'), 'Enter');
      const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
      expect(left.sliceDoc()).toBe('JUNE\nHi.\nAgain.');
      expect(render(keys(state, 'Shift-Tab'))).toBe('JUNE\nHi.|\nAgain.');
    });

    test('an empty () in a file, left, takes its line and keeps the speech', () => {
      const state = keys(classicEditor('JUNE\n(|)\nHello.'), 'Enter');
      const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
      expect(left.sliceDoc()).toBe('JUNE\nHello.');
    });

    test('undo gives the text back', () => {
      const state = classicEditor('JUNE\nHi.|\nAgain.', { with: [history()] });
      expect(apply(keys(state, 'Enter'), undo).sliceDoc()).toBe('JUNE\nHi.\nAgain.');
    });
  });

  describe('a hidden mark at a line’s start', () => {
    rows([
      ['@|JUNE', '@|JUNE\nHi.', 'Enter', '\n@|JUNE\nHi.'],
      ['.|FLASH', 'A.\n\n.|FLASH', 'Enter', 'A.\n\n\n.|FLASH'],
      ['!|BANG', 'A.\n\n!|BANG', 'Enter', 'A.\n\n\n!|BANG'],
      ['>|FADE OUT.', '>|FADE OUT.', 'Enter', '\n>|FADE OUT.'],
      ['>|THE END<', '>|THE END<', 'Enter', '\n>|THE END<'],
      ['~|La', '~|La', 'Enter', '\n~|La'],
      ['before the mark', '|@JUNE\nHi.', 'Enter', '\n@|JUNE\nHi.'],
      ['> |THE END <', '> |THE END <', 'Enter', '\n> |THE END <'],
      ['> THE END| <', '> THE END| <', 'Enter', '> THE END <\n\n|'],
      ['@ |JUNE', '@ |JUNE\nHi.', 'Enter', '\n@ |JUNE\nHi.'],
      ['~ |La', '~ |La', 'Enter', '\n~ |La'],
      ['! |BANG', 'A.\n\n! |BANG', 'Enter', 'A.\n\n\n! |BANG'],
      ['Shift+Enter, !|BANG', '!|BANG', 'Shift-Enter', '\n!|BANG'],
    ]);

    test('dialogue has no mark: a leading . is its words', () => {
      const speech = classicEditor('JUNE\n.5 cal');
      const line = speech.doc.line(2);
      expect(visibleStart(speech, line)).toBe(line.from);
      const heading = classicEditor('.5 cal');
      expect(visibleStart(heading, heading.doc.line(1))).toBe(1);
    });

    test('a byte-order mark comes before the mark', () => {
      expect(render(keys(classicEditor(`${BOM}!|BANG`), 'Enter'))).toBe(`${BOM}\n!|BANG`);
    });
  });

  test('Enter inside an inline note is Fountain’s, and Tab writes nothing there', () => {
    const state = classicEditor('She [[a no|te]] waits.');
    for (const command of [classicEnter, classicShiftEnter]) {
      expect(run(state, command).handled).toBe(false);
    }
    // The ruling on Task 13: taken, so Fountain's Tab doesn't run; Esc then Tab leaves.
    for (const command of [classicTab, classicShiftTab]) {
      const pressed = run(state, command);
      expect(pressed.handled).toBe(true);
      expect(pressed.state.doc.eq(state.doc)).toBe(true);
    }
    expect(render(keys(state, 'Enter'))).toBe('She [[a no\n|te]] waits.');
    expect(render(keys(state, 'Tab'))).toBe('She [[a no|te]] waits.');
  });

  describe('Enter mid-line, element by element', () => {
    rows([
      ['Centered: both parts marked', '>THE| END<', 'Enter', '>THE<\n\n>| END<'],
      ['Lyric: both parts marked', '~la| la', 'Enter', '~la\n~| la'],
      ['Section: the second is Action', '# ACT| ONE', 'Enter', '# ACT\n\n| ONE'],
      ['Synopsis: both parts marked', '= she| runs', 'Enter', '= she\n\n= | runs'],
      ['A page break: at its end', '=|==', 'Enter', '===\n\n|'],
      ['A page break, Tab', '=|==', 'Tab', '===\n\n|'],
    ]);

    rows([['Act: the second is Action', '# ACT| ONE', 'Enter', '# ACT\n\n| ONE']], PLAY);

    test('each part reads as it should', () => {
      expect(kinds(keys(classicEditor('>THE| END<'), 'Enter'))).toEqual(['centered', 'centered']);
      expect(render(keys(classicEditor('~la| la'), 'Enter', 'x'))).toBe('~la\n~x| la');
      expect(kinds(keys(classicEditor('~la| la'), 'Enter'))).toEqual(['lyric']);
      expect(kinds(keys(classicEditor('= she| runs'), 'Enter'))).toEqual(['synopsis', 'synopsis']);
      expect(kinds(keys(classicEditor('# ACT| ONE'), 'Enter'))).toEqual(['section', 'action']);
      expect(kinds(keys(classicEditor('=|=='), 'Enter'))).toEqual(['page_break']);
    });

    test('Action’s first part gets its ! when it would read as a Transition', () => {
      const state = keys(classicEditor('SMASH TO:| black'), 'Enter');
      expect(render(state)).toBe('!SMASH TO:\n\n| black');
      expect(kinds(state)).toEqual(['action', 'action']);
    });

    test('both parts of Action can need one', () => {
      const state = keys(classicEditor('SMASH TO:|INT. BAR'), 'Enter');
      expect(render(state)).toBe('!SMASH TO:\n\n!|INT. BAR');
    });
  });

  test('!BANG loses its ! when Shift+Enter’s empty line is tidied away', () => {
    const state = keys(classicEditor('BANG|\n\nHe leaves.'), 'Shift-Enter');
    expect(state.sliceDoc()).toBe('!BANG\n\n\nHe leaves.');
    const end = state.doc.length;
    const left = state.update({ selection: { anchor: end }, userEvent: 'select.pointer' }).state;
    expect(render(left)).toBe('BANG\n\nHe leaves.|');
  });

  test('!BANG keeps its ! when the line under it is typed on', () => {
    const state = keys(classicEditor('BANG|\n\nHe leaves.'), 'Shift-Enter', 'x');
    const left = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
    expect(left.sliceDoc()).toBe('!BANG\nx\n\nHe leaves.');
  });

  describe('a name with a note under it', () => {
    rows([
      [
        'Enter skips the note to the speech',
        'JUNE|\n[[a note]]\nHello.\nAgain.',
        'Enter',
        'JUNE\n[[a note]]\nHello.|\nAgain.',
      ],
      [
        'Tab skips the note to the speech',
        'JUNE|\n[[a note]]\nHello.',
        'Tab',
        'JUNE\n[[a note]]\nHello.|',
      ],
      [
        'no speech: Dialogue goes under the note',
        'JUNE|\n[[a note]]\n\nHe.',
        'Enter',
        'JUNE\n[[a note]]\n|\n\nHe.',
        'character',
      ],
    ]);
  });

  rows([
    [
      'Shift+Enter on a blank line of the file writes nothing that joins what’s below',
      'JUNE\nHi.\n|\nHe leaves.',
      'Shift-Enter',
      'JUNE\nHi.\n|\nHe leaves.',
    ],
  ]);
});
