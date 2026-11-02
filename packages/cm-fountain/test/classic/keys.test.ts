import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { makeElement } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
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
    ['Dialogue: Shift+Tab goes back to the end of the name', 'JUNE\n|', 'Shift-Tab', 'JUNE|'],
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

  test('a kind with no row here is Fountain’s Enter', () => {
    expect(run(classicEditor('~La| la'), classicEnter).handled).toBe(false);
    expect(render(keys(classicEditor('~La| la'), 'Enter'))).toBe('~La\n| la');
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
      'Shift+Enter on an empty speech line writes two spaces',
      'JUNE\n|',
      'Shift-Enter',
      'JUNE\n  |',
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

  test('the title page and a note give Tab back', () => {
    for (const marked of [
      'Title: Signal| Hill\n\nA.',
      'A.\n\n[[a no|te]]\n\nB.',
      'A.\n\n/* gone\nstill| gone */',
    ]) {
      const state = classicEditor(marked);
      for (const command of COMMANDS) expect(run(state, command).handled).toBe(false);
      expect(render(keys(state, 'Tab'))).toBe(render(state));
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
    ['Shift-Enter', 'JUNE\n|'],
    ['Enter', 'JUNE\n(|)'],
    ['Shift-Tab', 'JUNE\n|'],
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
