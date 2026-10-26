import {
  EditorSelection,
  EditorState,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import * as api from '@drafter/cm-fountain';
import {
  convertToAction,
  convertToCharacter,
  cueMode,
  forceKind,
  fountainEnter,
  fountainInput,
  fountainKeymap,
  fountainShiftTab,
  fountainTab,
  parsedDoc,
  toggleDual,
  wrapInBoneyard,
  wrapInNote,
} from '@drafter/cm-fountain';
import { afterEach, describe, expect, it } from 'vitest';
import { apply, editor, press, render, run, type } from './helpers';

type Kind = Parameters<typeof forceKind>[0];

/** The command the keymap runs for a key, so a row of a table tests the binding too. */
function bound(key: string): StateCommand {
  const binding = fountainKeymap.find((candidate) => candidate.key === key);
  if (!binding?.run) throw new Error(`The keymap has no ${key}`);
  return binding.run as unknown as StateCommand;
}

/** Each row: the text before, with the cursor as `|`; the key; and the text after. */
function rows(table: Array<[before: string, key: string, after: string]>) {
  for (const [before, key, after] of table) {
    it(`${key} turns ${JSON.stringify(before)} into ${JSON.stringify(after)}`, () => {
      expect(render(apply(editor(before), bound(key)))).toBe(after);
    });
  }
}

/** Several cursors or selections, which a state allows only when the app says so. */
const MULTIPLE = EditorState.allowMultipleSelections.of(true);

/** The kinds of every block that `parsedDoc` finds in a state. */
const kinds = (state: EditorState) => state.field(parsedDoc).blocks.map((block) => block.kind);

describe('the package', () => {
  it('exports the keymap and the input filters', () => {
    expect(Object.keys(api)).toEqual(
      expect.arrayContaining([
        'convertToAction',
        'convertToCharacter',
        'cueMode',
        'forceKind',
        'fountainEnter',
        'fountainInput',
        'fountainKeymap',
        'fountainShiftTab',
        'fountainTab',
        'toggleDual',
        'wrapInBoneyard',
        'wrapInNote',
      ]),
    );
  });
});

describe('fountainKeymap', () => {
  it('binds the keys of technical design §3.3 and leaves the save keys to the app', () => {
    expect(fountainKeymap.map((binding) => binding.key).sort()).toEqual(
      [
        'Enter',
        'Tab',
        'Shift-Tab',
        'Mod-Alt-1',
        'Mod-Alt-2',
        'Mod-Alt-3',
        'Mod-Alt-4',
        'Mod-Alt-5',
        'Mod-Alt-6',
        'Mod-Alt-7',
        'Mod-Shift-d',
        'Mod-/',
        'Mod-Shift-/',
      ].sort(),
    );
  });

  it('never sets preventDefault, which would take Tab where the command lets it through', () => {
    expect(fountainKeymap.every((binding) => binding.run && !binding.preventDefault)).toBe(true);
  });

  it('puts the seven kinds on Mod-Alt-1 to 7, in the order of the table', () => {
    // Each key onto an empty line: the marker, or the pair with the cursor between.
    const after = ['.|', '!|', '@|', '(|)', '>|', '>|<', '~|'];
    after.forEach((expected, i) => {
      const key = `Mod-Alt-${i + 1}`;
      expect(render(apply(editor('|'), bound(key))), key).toBe(expected);
    });
  });
});

describe('the table of technical design §3.3', () => {
  rows([
    ['MARGARET|', 'Enter', 'MARGARET\n|'],
    ['MARGARET\n(quietly|)', 'Enter', 'MARGARET\n(quietly)\n|'],
    ['INT. HALL - DAY|', 'Enter', 'INT. HALL - DAY\n\n|'],
    ['INT. HALL| - DAY', 'Enter', 'INT. HALL\n| - DAY'],
    ['CUT TO:|', 'Enter', 'CUT TO:\n\n|'],
    ['She waits.\n\n|', 'Tab', 'She waits.\n\n@|'],
    ['MARGARET\n|', 'Tab', 'MARGARET\n(|)'],
    ['margaret|', 'Tab', '@MARGARET|'],
    ['@MARGARET|', 'Shift-Tab', 'Margaret|'],
    ['MARGARET\nHi.|', 'Mod-Shift-d', 'MARGARET ^\nHi.|'],
    ['!She waits.|', 'Mod-Alt-3', '@She waits.|'],
  ]);

  it('Tab on an empty line after a blank one starts cue mode', () => {
    expect(apply(editor('She waits.\n\n|'), fountainTab).field(cueMode)).toBe(true);
  });

  it('Tab cycles a cue through (V.O.), (O.S.), and nothing', () => {
    // A lone `MARGARET` is action to the parser (a cue needs a line after it, rule 12), so the
    // cue has its speech.
    let state = editor('MARGARET|\nHello.');
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      state = apply(state, bound('Tab'));
      seen.push(render(state));
    }
    expect(seen).toEqual([
      'MARGARET (V.O.)|\nHello.',
      'MARGARET (O.S.)|\nHello.',
      'MARGARET|\nHello.',
    ]);
  });

  it('Mod-/ wraps the selection in a note and Mod-Shift-/ in a boneyard', () => {
    const note = apply(editor('[a b]'), bound('Mod-/'));
    expect(note.sliceDoc()).toBe('[[a b]]');
    const boneyard = apply(editor('[cut]'), bound('Mod-Shift-/'));
    expect(boneyard.sliceDoc()).toBe('/*cut*/');
  });
});

describe('Enter', () => {
  rows([
    // A selection is replaced by one line break, even at the end of a heading's line.
    ['INT. [HALL] - DAY', 'Enter', 'INT. \n| - DAY'],
    ['INT. HALL - [DAY]', 'Enter', 'INT. HALL - \n|'],
    // A parenthetical moves the cursor past its `)` only from just before it.
    ['MARGARET\n(qui|etly)', 'Enter', 'MARGARET\n(qui\n|etly)'],
    ['MARGARET\n(quietly)|', 'Enter', 'MARGARET\n(quietly)\n|'],
    // Forced transitions and lower-case headings are what the parse says they are.
    ['>FADE OUT.|', 'Enter', '>FADE OUT.\n\n|'],
    ['int. hall - day|', 'Enter', 'int. hall - day\n\n|'],
    // And a line that only looks like one, in the middle of an action paragraph, is not.
    ['She waits.\nINT. HALL|', 'Enter', 'She waits.\nINT. HALL\n|'],
    // Nothing else gets two.
    ['> THE END <|', 'Enter', '> THE END <\n|'],
    ['# ACT ONE|', 'Enter', '# ACT ONE\n|'],
    ['MARGARET\nHello.|', 'Enter', 'MARGARET\nHello.\n|'],
    ['|', 'Enter', '\n|'],
  ]);

  it('breaks at every cursor, and gives each the break its line asks for', () => {
    const text = 'INT. HALL - DAY\n\nMARGARET\nHello.';
    const state = EditorState.create({
      doc: text,
      selection: EditorSelection.create([
        EditorSelection.cursor(15),
        EditorSelection.cursor(text.length),
      ]),
      extensions: [fountainInput(), MULTIPLE],
    });
    const next = apply(state, fountainEnter);
    expect(next.sliceDoc()).toBe('INT. HALL - DAY\n\n\n\nMARGARET\nHello.\n');
    expect(next.selection.ranges.map((range) => range.head)).toEqual([17, 35]);
  });

  it('does nothing in a read-only editor', () => {
    expect(run(editor('INT. HALL - DAY|'), fountainEnter).handled).toBe(true);
    const state = editor('INT. HALL - DAY|', [EditorState.readOnly.of(true)]);
    expect(run(state, fountainEnter)).toMatchObject({ handled: false, transactions: [] });
  });
});

describe('Tab and Shift-Tab', () => {
  rows([
    // The top of the script is after a blank line.
    ['|', 'Tab', '@|'],
    // A parenthetical goes under a cue, a parenthetical, or a line of speech.
    ['MARGARET\nHello.\n|', 'Tab', 'MARGARET\nHello.\n(|)'],
    ['MARGARET\n(beat)\n|', 'Tab', 'MARGARET\n(beat)\n(|)'],
    // The line to convert may be forced, indented, or have the cursor in its middle.
    ['!she waits.|', 'Tab', '@SHE WAITS.|'],
    ['marg|aret', 'Tab', '@MARG|ARET'],
    ['  margaret|', 'Tab', '  @MARGARET|'],
    // The extension goes before a dual cue's ^, and comes out with the space before it.
    ['@MARGARET ^|\nHi.', 'Tab', '@MARGARET (V.O.) ^|\nHi.'],
    ['MARGARET (O.S.) ^|\nHi.', 'Tab', 'MARGARET ^|\nHi.'],
    // Shift-Tab lower-cases all but the first letter, markers and extensions with it.
    ['@MARGARET (V.O.)|', 'Shift-Tab', 'Margaret (v.o.)|'],
    ['MARGARET|\nHello.', 'Shift-Tab', 'Margaret|\nHello.'],
    ['@marg|aret', 'Shift-Tab', 'marg|aret'],
    // A name of one letter would still be a cue, so the line is forced to be action.
    ['@Q|\nWho?', 'Shift-Tab', '!Q|\nWho?'],
  ]);

  it('reads a converted cue as action, and a converted line as a cue', () => {
    const action = apply(editor('@Q|\nWho?'), fountainShiftTab);
    expect(kinds(action)).toEqual(['action']);
    const cue = apply(editor('margaret|\nHello.'), fountainTab);
    expect(kinds(cue)).toEqual(['character', 'dialogue']);
  });

  it('have convertToCharacter and convertToAction as commands of their own', () => {
    expect(press(editor('margaret|'), convertToCharacter)).toEqual(['@MARGARET', 9]);
    expect(press(editor('@MARGARET|'), convertToAction)).toEqual(['Margaret', 8]);
    // Each is for its own line: the first for action, the second for a cue.
    expect(run(editor('INT. HALL - DAY|'), convertToCharacter).handled).toBe(false);
    expect(run(editor('She waits.|'), convertToAction).handled).toBe(false);
  });

  // The keys that take Tab must give it back wherever the table gives it no meaning, or a keyboard
  // user could not leave the editor (WCAG 2.1.2).
  it('lets Tab through where it has no Fountain meaning', () => {
    const neither = [
      'INT. HALL - DAY|', // a scene heading
      'CUT TO:|', // a transition
      'MARGARET\nHello there.|', // a line of dialogue
      'MARGARET\n(quietly)|', // a parenthetical
      '> THE END <|', // centered text
      '# ACT ONE|', // a section
      '= A synopsis.|', // a synopsis
      '===|', // a page break
      '~La la la.|', // a lyric
      'She waits.\n|', // under action that is not a cue
      'She waits.\n\n   |', // a line of spaces
      '[[a no|te]]', // in a note
      '/* a bone|yard */', // in a boneyard
      '/*\n\n|\n*/', // on an empty line in a boneyard
      'Title: The Call|', // on the title page
      'Title: The Call\n|', // and under it, where another field would go
      '[She waits.]', // a selection
    ];
    const states = neither.map((marked) => [marked, editor(marked)] as const);
    // Several cursors, each of which would convert its line alone.
    const two = EditorSelection.create([EditorSelection.cursor(8), EditorSelection.cursor(18)]);
    const several = editor('margaret\n\nmargaret', [MULTIPLE]);
    states.push(['two cursors', several.update({ selection: two }).state]);
    for (const [label, state] of states) {
      for (const command of [fountainTab, fountainShiftTab]) {
        expect(run(state, command), label).toMatchObject({ handled: false, transactions: [] });
      }
    }
    // An extension outside the cycle is left alone by Tab; Shift-Tab still converts the cue.
    const custom = editor("MARGARET (CONT'D)|\nHello.");
    expect(run(custom, fountainTab)).toMatchObject({ handled: false, transactions: [] });
    expect(run(custom, fountainShiftTab).handled).toBe(true);
    // A cue with no name yet, such as the `@` a first Tab leaves, has nothing to extend. Shift-Tab
    // takes the `@` back.
    const bare = editor('x\n\n@|');
    expect(run(bare, fountainTab)).toMatchObject({ handled: false, transactions: [] });
    expect(render(apply(bare, fountainShiftTab))).toBe('x\n\n|');
    // And Shift-Tab has nothing to do on action.
    expect(run(editor('She waits.|'), fountainShiftTab).handled).toBe(false);
    // Nor in a read-only editor, where the keys that would change text give Tab back too.
    const readOnly = editor('margaret|', [EditorState.readOnly.of(true)]);
    expect(run(readOnly, fountainTab).handled).toBe(false);
  });
});

describe('forceKind', () => {
  const table: Array<[before: string, kind: Kind, after: string]> = [
    // The seven kinds on plain text.
    ['She waits.|', 'scene_heading', '.She waits.|'],
    ['She waits.|', 'action', '!She waits.|'],
    ['She waits.|', 'character', '@She waits.|'],
    ['She waits.|', 'parenthetical', '(She waits.|)'],
    ['She waits.|', 'transition', '>She waits.|'],
    ['She waits.|', 'centered', '>She waits.|<'],
    ['She waits.|', 'lyric', '~She waits.|'],
    // A marker or wrapper the line has is replaced, and spaces around the text go with it.
    ['!She waits.|', 'character', '@She waits.|'],
    ['>THE END<|', 'transition', '>THE END|'],
    ['> THE END <|', 'parenthetical', '(THE END|)'],
    ['(quietly)|', 'action', '!quietly|'],
    ['~ la la|', 'action', '!la la|'],
    ['.HALL|', 'action', '!HALL|'],
    ['  She waits.|', 'action', '!She waits.|'],
    // Not a marker: a dot with no letter after it, and parentheses that are two groups.
    ['...and then|', 'action', '!...and then|'],
    ['(a) and (b)|', 'action', '!(a) and (b)|'],
    // Case is never touched, the cursor keeps its place in the text, and only its line changes.
    ['!she waits.|', 'character', '@she waits.|'],
    ['She |waits.', 'action', '!She |waits.'],
    ['One.\nTwo|.\nThree.', 'lyric', 'One.\n~Two|.\nThree.'],
    // The same kind again changes nothing.
    ['!She waits.|', 'action', '!She waits.|'],
    ['(quietly)|', 'parenthetical', '(quietly)|'],
    // An empty line gets the marker, or the pair with the cursor between.
    ['|', 'character', '@|'],
    ['|', 'parenthetical', '(|)'],
    ['|', 'centered', '>|<'],
  ];
  for (const [before, kind, after] of table) {
    it(`${kind} turns ${JSON.stringify(before)} into ${JSON.stringify(after)}`, () => {
      expect(render(apply(editor(before), forceKind(kind)))).toBe(after);
    });
  }

  it('takes the key even when the line already has the kind', () => {
    expect(run(editor('!She waits.|'), forceKind('action')).handled).toBe(true);
  });
});

describe('toggleDual', () => {
  rows([
    ['MARGARET ^\nHi.|', 'Mod-Shift-d', 'MARGARET\nHi.|'],
    ['MARGARET|\nHi.', 'Mod-Shift-d', 'MARGARET| ^\nHi.'],
    ['MARGARET\n(beat)\nHi.|', 'Mod-Shift-d', 'MARGARET ^\n(beat)\nHi.|'],
    ['@MARGARET (V.O.)  \nHi.|', 'Mod-Shift-d', '@MARGARET (V.O.) ^  \nHi.|'],
    ['MARGARET ^  \nHi.|', 'Mod-Shift-d', 'MARGARET  \nHi.|'],
  ]);

  it('is for a dialogue group, and gives the key back anywhere else', () => {
    for (const marked of [
      'She waits.|',
      'MARGARET\nHi.\n|', // under a speech, on the blank line that ends it
      'MARGARET\nHi.\n\nShe waits.|', // after it
      '~La la la.|', // a lyric with no cue above it
      'INT. HALL - DAY|',
      '|',
    ]) {
      expect(run(editor(marked), toggleDual), JSON.stringify(marked)).toMatchObject({
        handled: false,
        transactions: [],
      });
    }
  });
});

describe('wrapInNote and wrapInBoneyard', () => {
  it('keeps the wrapped text selected', () => {
    const note = apply(editor('x [a b] y'), wrapInNote);
    expect(note.sliceDoc()).toBe('x [[a b]] y');
    expect(note.selection.main).toMatchObject({ from: 4, to: 7 });
    const boneyard = apply(editor('x [a b] y'), wrapInBoneyard);
    expect(boneyard.sliceDoc()).toBe('x /*a b*/ y');
    expect(boneyard.selection.main).toMatchObject({ from: 4, to: 7 });
  });

  it('inserts an empty pair with the cursor inside when nothing is selected', () => {
    expect(render(apply(editor('one |two'), wrapInNote))).toBe('one [[|]]two');
    expect(render(apply(editor('one |two'), wrapInBoneyard))).toBe('one /*|*/two');
  });

  it('wraps every selection', () => {
    const state = editor('a b c', [MULTIPLE]).update({
      selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(4, 5)]),
    }).state;
    const next = apply(state, wrapInNote);
    expect(next.sliceDoc()).toBe('[[a]] b [[c]]');
    expect(next.selection.ranges.map((range) => [range.from, range.to])).toEqual([
      [2, 3],
      [10, 11],
    ]);
  });

  it('does nothing in a read-only editor', () => {
    expect(run(editor('[a b]'), wrapInNote).handled).toBe(true);
    const state = editor('[a b]', [EditorState.readOnly.of(true)]);
    expect(run(state, wrapInNote).handled).toBe(false);
    expect(run(state, wrapInBoneyard).handled).toBe(false);
  });
});

describe('the other commands in a read-only editor', () => {
  it('give the keys back', () => {
    const readOnly = [EditorState.readOnly.of(true)];
    const cases: Array<[string, StateCommand]> = [
      ['She waits.\n\n|', fountainTab],
      ['@MARGARET|', fountainShiftTab],
      ['margaret|', convertToCharacter],
      ['@MARGARET|', convertToAction],
      ['MARGARET\nHi.|', toggleDual],
      ['She waits.|', forceKind('action')],
    ];
    for (const [marked, command] of cases) {
      // Each does its work when the editor can be changed, so it is the editor that stops it.
      expect(run(editor(marked), command).handled, marked).toBe(true);
      expect(run(editor(marked, readOnly), command).handled, marked).toBe(false);
    }
  });
});

describe('cue mode', () => {
  it('upper-cases a cue while typing after Tab, until Enter', () => {
    let state = apply(editor('She waits.\n\n|'), fountainTab);
    expect(state.field(cueMode)).toBe(true);
    state = type(state, 'margaret');
    expect(state.sliceDoc()).toBe('She waits.\n\n@MARGARET');
    expect(state.field(cueMode)).toBe(true);
    state = apply(state, fountainEnter);
    expect(state.field(cueMode)).toBe(false);
    state = type(state, 'hi');
    expect(state.sliceDoc()).toBe('She waits.\n\n@MARGARET\nhi');
  });

  it('ends when the cursor leaves the line, or the @ is deleted', () => {
    const started = apply(editor('x\n\n|'), fountainTab);
    expect(started.sliceDoc()).toBe('x\n\n@');
    // Moving along the line keeps it.
    const home = started.update({ selection: { anchor: 3 } }).state;
    expect(home.field(cueMode)).toBe(true);
    // Leaving the line ends it for good, even when the cursor comes back.
    const away = started.update({ selection: { anchor: 0 } }).state;
    expect(away.field(cueMode)).toBe(false);
    const back = away.update({ selection: { anchor: 4 } }).state;
    expect(back.field(cueMode)).toBe(false);
    expect(type(back, 'ab').sliceDoc()).toBe('x\n\n@ab');
    // Deleting the @ gives up the cue, so the next words are plain.
    const deleted = started.update({
      changes: { from: 3, to: 4 },
      userEvent: 'delete.backward',
    }).state;
    expect(deleted.field(cueMode)).toBe(false);
    expect(type(deleted, 'hi').sliceDoc()).toBe('x\n\nhi');
  });

  it('is not started by a typed @, only by Tab', () => {
    const state = type(editor('|'), '@margaret');
    expect(state.sliceDoc()).toBe('@margaret');
    expect(state.field(cueMode)).toBe(false);
  });

  it('follows the line when text is added above it', () => {
    const started = apply(editor('x\n\n|'), fountainTab);
    const above = started.update({ changes: { from: 0, insert: 'INT. HALL - DAY\n\n' } }).state;
    expect(above.field(cueMode)).toBe(true);
    expect(type(above, 'ab').sliceDoc()).toBe('INT. HALL - DAY\n\nx\n\n@AB');
  });
});

describe('the input filters', () => {
  it("upper-cases a scene heading as it's typed", () => {
    expect(type(editor('INT. |'), 'hall - day').sliceDoc()).toBe('INT. HALL - DAY');
    // Edits in the middle of the heading too, with a prefix that has no dot, or in lower case.
    expect(type(editor('EXT. HAL| - DAY'), 'lway').sliceDoc()).toBe('EXT. HALLWAY - DAY');
    expect(type(editor('INT |'), 'hall').sliceDoc()).toBe('INT HALL');
    expect(type(editor('I/E. |'), 'car').sliceDoc()).toBe('I/E. CAR');
    expect(type(editor('|'), 'int. hall - day').sliceDoc()).toBe('int. HALL - DAY');
    // A heading between other paragraphs, which is where one usually is.
    expect(type(editor('She waits.\n\nEST. |\n\nHe waits.'), 'a').sliceDoc()).toBe(
      'She waits.\n\nEST. A\n\nHe waits.',
    );
  });

  it('never changes case anywhere else', () => {
    // Action, dialogue, a cue typed by hand, and everything else the text can hold.
    expect(type(editor('She waits|'), ' by the door').sliceDoc()).toBe('She waits by the door');
    expect(type(editor('MARGARET\nHello|'), ' there').sliceDoc()).toBe('MARGARET\nHello there');
    expect(type(editor('|'), '@margaret').sliceDoc()).toBe('@margaret');
    expect(type(editor('# act |'), 'one').sliceDoc()).toBe('# act one');
    expect(type(editor('Title: |'), 'the call').sliceDoc()).toBe('Title: the call');
    // The prefix is not a heading in the middle of a paragraph, in a speech, in a note, on the title
    // page, or in a boneyard.
    for (const before of [
      'She waits.\nInt |',
      'MARGARET\nExt |',
      '[[a\nInt. |]]',
      'Title: x\n   Int. |',
      '/* \nINT. |',
    ]) {
      const text = before.replace('|', 'hall');
      expect(type(editor(before), 'hall').sliceDoc(), before).toBe(text);
    }
    // Text that is already there is not touched when its neighbours are typed.
    expect(type(editor('INT. hall| - DAY'), 'way').sliceDoc()).toBe('INT. hallWAY - DAY');
    // Nor is anything that is not typing: a paste, a drop, a completion, an IME composition, or a
    // change made by the app, in a cue or a heading.
    for (const userEvent of ['input.paste', 'input.drop', 'input.complete', 'input.type.compose']) {
      const cue = apply(editor('x\n\n|'), fountainTab);
      expect(type(cue, 'margaret', { userEvent, by: 'whole' }).sliceDoc(), userEvent).toBe(
        'x\n\n@margaret',
      );
      const heading = editor('INT. |');
      expect(type(heading, 'hall', { userEvent, by: 'whole' }).sliceDoc(), userEvent).toBe(
        'INT. hall',
      );
    }
    const cue = apply(editor('x\n\n|'), fountainTab);
    const programmatic = cue.update({ changes: { from: 4, insert: 'margaret' } }).state;
    expect(programmatic.sliceDoc()).toBe('x\n\n@margaret');
    // What is typed after text that was pasted into the cue is upper-case, and the paste is not.
    const pasted = type(cue, 'marg', { userEvent: 'input.paste', by: 'whole' });
    expect(type(pasted, 'aret').sliceDoc()).toBe('x\n\n@margARET');
    // A convert command is the one thing that changes what is there, and it says so by name.
    expect(press(editor('margaret|'), convertToCharacter)[0]).toBe('@MARGARET');
    // Forcing a kind never changes case.
    expect(press(editor('she waits.|'), forceKind('character'))[0]).toBe('@she waits.');
  });

  it('upper-cases only the first line of what is typed', () => {
    const cue = apply(editor('x\n\n|'), fountainTab);
    expect(type(cue, 'ab\ncd', { by: 'whole' }).sliceDoc()).toBe('x\n\n@AB\ncd');
    expect(type(editor('INT. |'), 'ab\ncd', { by: 'whole' }).sliceDoc()).toBe('INT. AB\ncd');
  });

  it('upper-cases only the cue line when several cursors type', () => {
    const cue = apply(editor('x\n\n|\ny', [MULTIPLE]), fountainTab);
    const both = cue.update({
      selection: EditorSelection.create([EditorSelection.cursor(4), EditorSelection.cursor(6)]),
    }).state;
    const typed = both.update({
      changes: both.selection.ranges.map((range) => ({ from: range.from, insert: 'ab' })),
      userEvent: 'input.type',
    }).state;
    expect(typed.sliceDoc()).toBe('x\n\n@AB\nyab');
  });

  it('upper-cases a cue without splitting surrogate pairs', () => {
    const lower = String.fromCodePoint(0x10428); // DESERET SMALL LETTER LONG I
    const upper = String.fromCodePoint(0x10400); // DESERET CAPITAL LETTER LONG I
    const emoji = String.fromCodePoint(0x1f600);
    const lone = /\p{Surrogate}/u;
    const cue = apply(editor('x\n\n|'), fountainTab);
    for (const by of ['point', 'whole', 'unit'] as const) {
      const state = type(cue, `a${lower}b${emoji}c`, { by });
      expect(state.sliceDoc(), by).toBe(`x\n\n@A${upper}B${emoji}C`);
      expect(lone.test(state.sliceDoc()), by).toBe(false);
      // The cursor is after the last character, however many units the case change took.
      expect(state.selection.main.head, by).toBe(state.doc.length);
    }
    // A letter whose upper case is longer takes the cursor with it.
    const sharp = type(cue, 'straße');
    expect(sharp.sliceDoc()).toBe('x\n\n@STRASSE');
    expect(sharp.selection.main.head).toBe(sharp.doc.length);
    // The same in a heading, with the two halves of the pair typed apart.
    expect(type(editor('INT. |'), lower, { by: 'unit' }).sliceDoc()).toBe(`INT. ${upper}`);
  });
});

describe('every command', () => {
  /** Each command, with a text that it changes. */
  const commands: Array<[name: string, command: StateCommand, marked: string]> = [
    ['Enter', fountainEnter, 'INT. HALL - DAY|'],
    ['Enter in a parenthetical', fountainEnter, 'MARGARET\n(quietly|)'],
    ['Tab to start a cue', fountainTab, 'She waits.\n\n|'],
    ['Tab to open a parenthetical', fountainTab, 'MARGARET\n|'],
    ['Tab to cycle', fountainTab, 'MARGARET|\nHello.'],
    ['Tab to convert', fountainTab, 'margaret|'],
    ['Shift-Tab', fountainShiftTab, '@MARGARET|'],
    ['convertToCharacter', convertToCharacter, '!margaret|'],
    ['convertToAction', convertToAction, 'MARGARET|\nHello.'],
    ['forceKind', forceKind('centered'), 'THE END|'],
    ['toggleDual', toggleDual, 'MARGARET\nHi.|'],
    ['wrapInNote', wrapInNote, '[a b]'],
    ['wrapInBoneyard', wrapInBoneyard, 'a b|'],
  ];

  it('makes every command one undo step', () => {
    for (const [name, command, marked] of commands) {
      const state = editor(marked);
      const pressed = run(state, command);
      expect(pressed.handled, name).toBe(true);
      // One transaction, so one entry in the history...
      expect(pressed.transactions, name).toHaveLength(1);
      const tr = pressed.transactions[0] as Transaction;
      expect(tr.docChanged, name).toBe(true);
      // ...which the history would not join to the typing around it...
      expect(tr.isUserEvent('input.type'), name).toBe(false);
      // ...and which undoes whole: the history applies the inverse of the changes.
      expect(tr.changes.invert(state.doc).apply(tr.newDoc).toString(), name).toBe(
        state.doc.toString(),
      );
    }
  });

  it("inserts the file's own line break", () => {
    const crlf = [EditorState.lineSeparator.of('\r\n')];
    // The cursor moves one position for each break, though each is two characters.
    expect(press(editor('INT. HALL - DAY|', crlf), fountainEnter)).toEqual([
      'INT. HALL - DAY\r\n\r\n',
      17,
    ]);
    expect(press(editor('MARGARET|', crlf), fountainEnter)).toEqual(['MARGARET\r\n', 9]);
    expect(press(editor('MARGARET\n(quietly|)', crlf), fountainEnter)).toEqual([
      'MARGARET\r\n(quietly)\r\n',
      19,
    ]);
    const lf = [EditorState.lineSeparator.of('\n')];
    expect(press(editor('CUT TO:|', lf), fountainEnter)).toEqual(['CUT TO:\n\n', 9]);
    // And no bare `\n` comes out in a CRLF file.
    const text = press(editor('INT. HALL - DAY|', crlf), fountainEnter)[0];
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('never indents after Enter', () => {
    for (const marked of [
      '  She waits.|',
      '\tShe waits.|',
      '    INT. HALL - DAY|',
      'MARGARET\n    Hello.|',
      'MARGARET\n    (quietly|)',
      '  \tCUT TO:|',
    ]) {
      const after = render(apply(editor(marked), fountainEnter));
      // Every line break is followed by the cursor, or by nothing at all.
      expect(after, marked).toMatch(/\n+\|$/);
    }
    // In the middle of an indented line the new line starts where the cursor was.
    expect(render(apply(editor('    She |waits.'), fountainEnter))).toBe('    She \n|waits.');
  });
});

describe('a scene from the keyboard', () => {
  it('types a scene, and the parse reads it as the writer meant', () => {
    let state = editor('|');
    const keys = (...names: string[]) => {
      for (const name of names) state = apply(state, bound(name));
    };
    const typed = (text: string) => {
      state = type(state, text);
    };
    // A heading, in lower case, which the filter upper-cases after its prefix.
    typed('int. hall - day');
    keys('Enter');
    // Action keeps its case, and a blank line makes room for a cue.
    typed('Margaret waits.');
    keys('Enter', 'Enter', 'Tab');
    expect(state.field(cueMode)).toBe(true);
    typed('margaret');
    // Enter ends the cue; Tab on the empty line under it opens a parenthetical.
    keys('Enter', 'Tab');
    expect(state.field(cueMode)).toBe(false);
    typed('quietly');
    // Enter before the `)` moves past it, and the speech keeps its case.
    keys('Enter');
    typed('Hello there.');
    expect(state.sliceDoc()).toBe(
      'int. HALL - DAY\n\nMargaret waits.\n\n@MARGARET\n(quietly)\nHello there.',
    );
    expect(kinds(state)).toEqual([
      'scene_heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
    ]);
  });
});

describe('the keymap in a view', () => {
  const views: EditorView[] = [];

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  function mount(marked: string): EditorView {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: editor(marked, [keymap.of(fountainKeymap)]),
      parent,
    });
    views.push(view);
    return view;
  }

  /** Presses a key in the view, and says whether the keymap took it, so the browser will not. */
  function key(view: EditorView, init: KeyboardEventInit): boolean {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    view.contentDOM.dispatchEvent(event);
    return event.defaultPrevented;
  }

  const TAB = { key: 'Tab', keyCode: 9 };

  it('takes Tab where it means something, and leaves it to the browser where it does not', () => {
    // Where it has no meaning, the event is not prevented, so focus moves on.
    for (const marked of ['INT. HALL - DAY|', 'CUT TO:|', 'MARGARET\nHello.|', 'She waits.\n|']) {
      const view = mount(marked);
      expect(key(view, TAB), marked).toBe(false);
      expect(key(view, { ...TAB, shiftKey: true }), marked).toBe(false);
      expect(view.state.sliceDoc(), marked).toBe(marked.replace('|', ''));
    }
    // Where it has some, it is taken.
    const action = mount('margaret|');
    expect(key(action, TAB)).toBe(true);
    expect(action.state.sliceDoc()).toBe('@MARGARET');
    expect(key(action, { ...TAB, shiftKey: true })).toBe(true);
    expect(action.state.sliceDoc()).toBe('Margaret');
  });

  it('runs each command from its key', () => {
    const enter = mount('INT. HALL - DAY|');
    expect(key(enter, { key: 'Enter', keyCode: 13 })).toBe(true);
    expect(enter.state.sliceDoc()).toBe('INT. HALL - DAY\n\n');

    const force = mount('She waits.|');
    expect(key(force, { key: '3', keyCode: 51, ctrlKey: true, altKey: true })).toBe(true);
    expect(force.state.sliceDoc()).toBe('@She waits.');

    const dual = mount('MARGARET\nHi.|');
    expect(key(dual, { key: 'D', keyCode: 68, ctrlKey: true, shiftKey: true })).toBe(true);
    expect(dual.state.sliceDoc()).toBe('MARGARET ^\nHi.');

    const note = mount('[a b]');
    expect(key(note, { key: '/', keyCode: 191, ctrlKey: true })).toBe(true);
    expect(note.state.sliceDoc()).toBe('[[a b]]');

    const boneyard = mount('[cut]');
    expect(key(boneyard, { key: '?', keyCode: 191, ctrlKey: true, shiftKey: true })).toBe(true);
    expect(boneyard.state.sliceDoc()).toBe('/*cut*/');

    // A key that is not in the keymap is not taken.
    expect(key(enter, { key: 'x', keyCode: 88 })).toBe(false);
  });
});
