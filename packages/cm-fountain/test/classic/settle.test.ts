import { history, undo, undoDepth } from '@codemirror/commands';
import type { EditorState } from '@codemirror/state';
import { makeElement } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import {
  type ClassicKind,
  classicLine,
  elementAt,
  type StoredLine,
  setStored,
} from '../../src/classic/line';
import { MAX_RUN, readsAs, settleLine, shapeOf } from '../../src/classic/marks';
import { apply, render } from '../helpers';
import { classicEditor, type } from './harness';

const PLAY = builtins['stage-play-standard'] as Template;

/** The state with `kind` chosen on the cursor's line, as Tab or the chooser leaves it. */
const choose = (state: EditorState, kind: ClassicKind) =>
  state.update({ effects: setStored.of({ kind, chosen: true }) }).state;

/** Types a letter at a time, and gives the text of the cursor's line after each. */
function lettering(state: EditorState, text: string): string[] {
  const steps: string[] = [];
  let next = state;
  for (const letter of text) {
    next = type(next, letter);
    steps.push(next.doc.lineAt(next.selection.main.head).text);
  }
  return steps;
}

/** The cursor's line after typing `text`. */
const typedOn = (state: EditorState, text: string) => lettering(state, text).at(-1);

const line = (state: EditorState) => state.doc.lineAt(state.selection.main.head);
const stored = (state: EditorState) => state.field(classicLine) as StoredLine;
const cursorTo = (state: EditorState, pos: number) =>
  state.update({ selection: { anchor: pos }, userEvent: 'select' }).state;
/** A script with the cursor left and come back: a firm line. */
const returned = (marked: string) => {
  const state = classicEditor(marked);
  const { head } = state.selection.main;
  return cursorTo(cursorTo(state, head === 0 ? state.doc.length : 0), head);
};

const SOFT = 'She waits.\n\n|';

describe('§4.2, the table, row by row', () => {
  test('Scene heading (chosen): FLASHBACK - 1987 is .FLASHBACK - 1987', () => {
    const state = choose(classicEditor(SOFT), 'scene_heading');
    expect(lettering(state, 'flash')).toEqual(['.F', '.FL', '.FLA', '.FLAS', '.FLASH']);
    expect(typedOn(state, 'flashback - 1987')).toBe('.FLASHBACK - 1987');
  });

  test('Scene heading: INT. DINER - DAY is as typed', () => {
    const steps = lettering(choose(classicEditor(SOFT), 'scene_heading'), 'INT. D');
    expect(steps).toEqual(['.I', '.IN', '.INT', 'INT.', 'INT. ', 'INT. D']);
    expect(typedOn(classicEditor(SOFT), 'INT. DINER - DAY')).toBe('INT. DINER - DAY');
  });

  test('Character: june pasted on a Character is @june', () => {
    const state = choose(classicEditor(SOFT), 'character');
    expect(settleLine(state, line(state), 'june', stored(state)).text).toBe('@june');
  });

  test('Character: a name in a script with no case is @李明', () => {
    const state = choose(classicEditor(SOFT), 'character');
    expect(lettering(state, '李明')).toEqual(['@李', '@李明']);
  });

  test('Action, chosen: INT. BY THE DOOR takes !', () => {
    const state = choose(classicEditor(SOFT), 'action');
    expect(lettering(state, 'INT.')).toEqual(['I', 'IN', 'INT', '!INT.']);
    expect(typedOn(state, 'INT. BY THE DOOR')).toBe('!INT. BY THE DOOR');
  });

  test('firm Action keeps CUT TO: with !', () => {
    const state = choose(classicEditor(SOFT), 'action');
    expect(lettering(state, 'CUT TO:').at(-2)).toBe('CUT TO');
    expect(typedOn(state, 'CUT TO:')).toBe('!CUT TO:');
    expect(typedOn(returned('She waits.\n\nCUT TO|'), ':')).toBe('!CUT TO:');
  });

  test('.45 in the drawer gets its ! at its second character', () => {
    const steps = lettering(classicEditor(SOFT), '.45 in');
    expect(steps).toEqual(['.', '!.4', '!.45', '!.45 ', '!.45 i', '!.45 in']);
  });

  test('.FLASHBACK on Action stays Action', () => {
    expect(typedOn(classicEditor(SOFT), '.FLASHBACK')).toBe('!.FLASHBACK');
    expect(typedOn(choose(classicEditor(SOFT), 'action'), '.FLASHBACK')).toBe('!.FLASHBACK');
  });

  test.each([
    ['=== on Action is !===', '===', ['!=', '!==', '!===']],
    ['~la on Action is !~la', '~la', ['!~', '!~l', '!~la']],
    ['>foo on Action is !>foo', '>fo', ['!>', '!>f', '!>fo']],
    ['@home', '@ho', ['!@', '!@h', '!@ho']],
    ['#1 fan', '#1', ['!#', '!#1']],
    ['= sign', '= s', ['!=', '!= ', '!= s']],
  ])('%s', (_name, text, steps) => {
    expect(lettering(classicEditor(SOFT), text)).toEqual(steps);
  });

  test('a typed ! on Action is kept: !Bang writes !!Bang', () => {
    expect(lettering(classicEditor(SOFT), '!Ba')).toEqual(['!!', '!!B', '!!Ba']);
  });

  test('BANG on Action stays Action', () => {
    expect(lettering(classicEditor(SOFT), 'BANG')).toEqual(['B', 'BA', 'BAN', 'BANG']);
    expect(elementAt(type(classicEditor(SOFT), 'BANG'))?.kind).toBe('action');
  });

  test('!BANG is written by Shift+Enter: settleLine, given a text below', () => {
    const state = classicEditor('She waits.\n\nBANG|\nThe door opens.');
    const own: StoredLine = {
      from: line(state).from,
      kind: 'action',
      soft: false,
      chosen: false,
      added: [],
      made: null,
      dismissed: false,
      beganEmpty: false,
      arrivedAs: 'action',
    };
    const settled = settleLine(state, line(state), 'BANG', own);
    expect(settled).toMatchObject({ text: '!BANG', kind: 'action' });
    expect(settled.added).toEqual([{ from: line(state).from, to: line(state).from + 1 }]);
  });

  test('a keystroke on a line with text under it writes the ! at once', () => {
    const state = classicEditor('She waits.\n\n|\nThe door opens.');
    expect(lettering(state, 'BA')).toEqual(['!B', '!BA']);
    // In mixed case it needs none, and the mark this stay added goes.
    expect(lettering(state, 'Ba')).toEqual(['!B', 'Ba']);
  });

  test('Transition: FADE OUT. is >FADE OUT.', () => {
    const state = choose(classicEditor(SOFT), 'transition');
    expect(lettering(state, 'fa')).toEqual(['>F', '>FA']);
    expect(typedOn(state, 'fade out.')).toBe('>FADE OUT.');
  });

  test('Transition: CUT TO: is as typed, and >CUT TO takes its > off', () => {
    const steps = lettering(choose(classicEditor(SOFT), 'transition'), 'CUT TO:');
    expect(steps.slice(-2)).toEqual(['>CUT TO', 'CUT TO:']);
  });

  test("a play's stage direction is firm: SMASH CUT TO: and INT. take !", () => {
    const state = classicEditor('She waits.\n\n|', { template: PLAY });
    expect(typedOn(state, 'SMASH CUT TO:')).toBe('!SMASH CUT TO:');
    expect(typedOn(state, 'INT. A')).toBe('!INT. A');
  });

  test('Lyric, Centered, and a play’s Act and Scene need their marks always', () => {
    expect(lettering(choose(classicEditor(SOFT), 'lyric'), 'la')).toEqual(['~l', '~la']);
    const centered = type(choose(classicEditor(SOFT), 'centered'), 'hi');
    expect(render(centered)).toBe('She waits.\n\n>hi|<');
    const play = classicEditor('|', { template: PLAY });
    expect(typedOn(choose(play, 'act'), 'one')).toBe('# ONE');
    expect(typedOn(choose(play, 'scene_heading'), 'two')).toBe('## TWO');
  });

  test('Section and Synopsis take # and =', () => {
    expect(typedOn(choose(classicEditor(SOFT), 'section'), 'Part')).toBe('# Part');
    expect(typedOn(choose(classicEditor(SOFT), 'synopsis'), 'June')).toBe('= June');
  });
});

describe('soft lines', () => {
  test('int. on a soft line is a heading, capitals on its prefix', () => {
    expect(lettering(classicEditor(SOFT), 'int.')).toEqual(['i', 'in', 'int', 'INT.']);
    // `EXT ` alone, its space trimmed, isn't a heading to the parser yet; it is at the next letter.
    expect(lettering(classicEditor(SOFT), 'ext x')).toEqual(['e', 'ex', 'ext', 'EXT ', 'EXT X']);
    expect(typedOn(classicEditor(SOFT), 'i/e x')).toBe('I/E X');
    expect(typedOn(classicEditor(SOFT), 'int./ext. x')).toBe('INT./EXT. X');
    expect(typedOn(classicEditor(SOFT), 'est. x')).toBe('EST. X');
    expect(elementAt(type(classicEditor(SOFT), 'int. x'))?.kind).toBe('scene_heading');
  });

  test('the cursor stays after the letter it typed', () => {
    expect(render(type(classicEditor(SOFT), 'int.'))).toBe('She waits.\n\nINT.|');
    expect(render(type(classicEditor('She waits.\n\n|\nThe door.'), 'B'))).toBe(
      'She waits.\n\n!B|\nThe door.',
    );
  });

  test('a soft line of capitals ending TO: is a Transition', () => {
    const steps = lettering(classicEditor(SOFT), 'CUT TO:');
    expect(steps.at(-1)).toBe('CUT TO:');
    expect(elementAt(type(classicEditor(SOFT), 'CUT TO:'))?.kind).toBe('transition');
    expect(elementAt(type(classicEditor(SOFT), 'CUT TO: X'))?.kind).toBe('action');
    expect(typedOn(classicEditor(SOFT), 'Cut to:')).toBe('Cut to:');
  });

  test('a line starting with a mark’s character is never a shape', () => {
    const state = classicEditor(SOFT);
    expect(shapeOf(state, line(state), '.INT. X')).toBeNull();
    expect(shapeOf(state, line(state), '>CUT TO:')).toBeNull();
    expect(shapeOf(state, line(state), 'INT. X')).toBe('scene_heading');
  });

  test('a heading that stops being one goes back to what the line was', () => {
    const state = type(classicEditor(SOFT), 'int.');
    const back = state.update({
      changes: { from: state.doc.length - 1, to: state.doc.length },
      userEvent: 'delete.backward',
    }).state;
    expect(render(type(back, 'o'))).toBe('She waits.\n\nINTo|');
    expect(stored(type(back, 'o'))).toMatchObject({ kind: 'action', soft: true });
  });
});

describe('a worked-out pending Character', () => {
  const AFTER_SPEECH = 'JUNE\nHello.\n\n|';

  test('a heading prefix on a worked-out pending Character is a Scene heading, with no @', () => {
    const state = classicEditor(AFTER_SPEECH);
    expect(lettering(state, 'int. d')).toEqual(['I', 'IN', 'INT', 'INT.', 'INT. ', 'INT. D']);
    expect(elementAt(type(state, 'int. d'))?.kind).toBe('scene_heading');
  });

  test('stored by a key as it makes the line, not only on arrival', () => {
    const state = classicEditor(AFTER_SPEECH).update({
      effects: setStored.of({ kind: 'character' }),
    }).state;
    expect(typedOn(state, 'int. d')).toBe('INT. D');
  });

  test('each of the parser’s prefixes', () => {
    for (const [typed, written] of [
      ['ext. x', 'EXT. X'],
      ['est. x', 'EST. X'],
      ['i/e x', 'I/E X'],
      ['int./ext. x', 'INT./EXT. X'],
    ]) {
      expect(typedOn(classicEditor(AFTER_SPEECH), typed as string)).toBe(written);
    }
  });

  test('a name is still a name', () => {
    const state = classicEditor(AFTER_SPEECH);
    expect(lettering(state, 'dale')).toEqual(['D', 'DA', 'DAL', 'DALE']);
    expect(elementAt(type(state, 'dale'))?.kind).toBe('character');
  });

  test('only a heading’s prefix: a line of capitals ending TO: is a name there', () => {
    expect(typedOn(classicEditor(AFTER_SPEECH), 'cut to:')).toBe('@CUT TO:');
  });

  test('a Character chosen stays a Character: @INT. DINER', () => {
    const state = choose(classicEditor(AFTER_SPEECH), 'character');
    expect(typedOn(state, 'int. diner')).toBe('@INT. DINER');
  });

  test('a name the cursor returned to stays a name', () => {
    expect(typedOn(returned('She waits.\n\nINT|\nHello.'), '.')).toBe('@INT.');
  });
});

describe('marks that come off, and marks that aren’t ours', () => {
  test('.INT, .INT., then INT. takes its dot off (a chosen Scene heading)', () => {
    // The parser reads INT. as a heading the moment its dot is typed, so that's when ours goes.
    const state = choose(classicEditor(SOFT), 'scene_heading');
    const dotted = type(state, 'INT');
    expect(render(dotted)).toBe('She waits.\n\n.INT|');
    expect(stored(dotted).added).toHaveLength(1);
    const done = type(dotted, '.');
    expect(render(done)).toBe('She waits.\n\nINT.|');
    expect(stored(done).added).toEqual([]);
  });

  test('>CUT TO, then CUT TO: takes its > off', () => {
    const state = type(choose(classicEditor(SOFT), 'transition'), 'CUT TO');
    expect(render(state)).toBe('She waits.\n\n>CUT TO|');
    expect(render(type(state, ':'))).toBe('She waits.\n\nCUT TO:|');
  });

  test('a mark from an opened file is never touched', () => {
    expect(typedOn(returned('She waits.\n\n!Bang|'), 'x')).toBe('!Bangx');
    expect(typedOn(returned('She waits.\n\n!plain action|'), 'x')).toBe('!plain actionx');
    expect(typedOn(returned('She waits.\n\n@JUNE|\nHello.'), 'x')).toBe('@JUNEX');
    expect(typedOn(returned('She waits.\n\n.INT. DINER|'), 'x')).toBe('.INT. DINERX');
    expect(typedOn(returned('She waits.\n\n>CUT TO:|'), 'x')).toBe('>CUT TO:X');
    expect(typedOn(returned('She waits.\n\n~la|'), 'x')).toBe('~lax');
    expect(type(returned('She waits.\n\n!Bang|'), 'x').field(classicLine)).toBeNull();
  });

  test('a mark typed in a chosen Scene heading is the same mark', () => {
    const state = choose(classicEditor(SOFT), 'scene_heading');
    expect(lettering(state, '.fla')).toEqual(['.', '.F', '.FL', '.FLA']);
    expect(lettering(choose(classicEditor(SOFT), 'character'), '@ju')).toEqual(['@', '@J', '@JU']);
  });

  test('a mark that wouldn’t work isn’t written', () => {
    const state = choose(classicEditor(SOFT), 'scene_heading');
    expect(typedOn(state, '"DINER"')).toBe('"DINER"');
  });

  test('a line that is only a note takes no mark', () => {
    expect(typedOn(choose(classicEditor(SOFT), 'action'), '[[later]]')).toBe('[[later]]');
    expect(typedOn(classicEditor(SOFT), '/* cut */')).toBe('/* cut */');
  });

  test('capitals stay out of a note', () => {
    const state = choose(classicEditor(SOFT), 'scene_heading');
    expect(typedOn(state, 'int. a[[b')).toBe('INT. A[[b');
  });

  test('a firm line typed on then deleted to empty is soft', () => {
    const state = type(returned('She waits.\n\nCUT TO|'), ':');
    const start = line(state).from;
    const emptied = state.update({
      changes: { from: start, to: state.doc.length },
      userEvent: 'delete.backward',
    }).state;
    expect(elementAt(emptied)).toMatchObject({ kind: 'action', pending: true, soft: true });
  });
});

describe('the title page', () => {
  test('Title: x mid-script takes no mark', () => {
    expect(typedOn(classicEditor(SOFT), 'Title: x')).toBe('Title: x');
    expect(typedOn(choose(classicEditor(SOFT), 'action'), 'Title: x')).toBe('Title: x');
  });

  test('Title: x on a soft line 1 becomes the title page', () => {
    const state = type(classicEditor('|'), 'Title: x');
    expect(state.sliceDoc()).toBe('Title: x');
    expect(elementAt(state)?.kind).toBe('title_page');
    const empty = classicEditor('|');
    expect(shapeOf(empty, line(empty), 'Title: x')).toBe('title_page');
  });

  test('Title: x on a firm line 1 takes !', () => {
    expect(typedOn(choose(classicEditor('|'), 'action'), 'Title: x')).toBe('!Title: x');
  });

  test('a line 1 that is no title page is read as any other', () => {
    expect(typedOn(classicEditor('|'), 'INT. HALL: DAY')).toBe('INT. HALL: DAY');
    expect(typedOn(classicEditor('|'), 'She waits: a beat.')).toBe('She waits: a beat.');
  });
});

describe('capitals and code points', () => {
  test('a surrogate pair is capitalised as one', () => {
    const small = String.fromCodePoint(0x10428);
    const capital = String.fromCodePoint(0x10400);
    const state = choose(classicEditor(SOFT), 'character');
    expect(line(type(state, small)).text).toBe(capital);
    expect(line(type(state, small, { by: 'unit' })).text).toBe(capital);
  });

  test('a name of all capitals needs no mark', () => {
    const state = choose(classicEditor(SOFT), 'character');
    expect(lettering(state, 'june')).toEqual(['J', 'JU', 'JUN', 'JUNE']);
    expect(lettering(state, 'june (v.o.)').at(-1)).toBe('JUNE (V.O.)');
  });

  test('capitals apply to what is typed, not what was there', () => {
    const state = classicEditor('She waits.\n\n@June|\nHello.');
    expect(typedOn(returned(render(state)), 'a')).toBe('@JuneA');
  });

  test('a letter that grows keeps the cursor after it', () => {
    const state = type(choose(classicEditor(SOFT), 'character'), 'ß');
    expect(render(state)).toBe('She waits.\n\nSS|');
  });

  test('a byte-order mark stays first', () => {
    const state = choose(classicEditor('﻿|'), 'lyric');
    expect(render(type(state, 'la'))).toBe('﻿~la|');
  });
});

describe('the transaction', () => {
  test('the mark and the letter are one undo step', () => {
    const before = choose(classicEditor(SOFT, { with: [history()] }), 'lyric');
    const typed = type(before, 'l');
    expect(typed.sliceDoc()).toBe('She waits.\n\n~l');
    expect(undoDepth(typed)).toBe(1);
    expect(apply(typed, undo).sliceDoc()).toBe(before.sliceDoc());
    expect(typed.field(classicLine)).not.toBeNull();
  });

  test('a capital, a mark, and a letter undo together, and the kept text comes back', () => {
    const before = choose(classicEditor(SOFT, { with: [history()] }), 'character');
    const typed = type(before, '李');
    expect(typed.doc.line(3).text).toBe('@李');
    expect(apply(typed, undo).sliceDoc()).toBe(before.sliceDoc());
  });

  test.each(['input.paste', 'input.type.compose', 'undo', 'redo', 'input.replace', 'input'])(
    'steps back for %s',
    (userEvent) => {
      const state = choose(classicEditor(SOFT), 'lyric');
      const { from } = state.selection.main;
      const tr = state.update({ changes: { from, insert: 'l' }, userEvent });
      expect(tr.newDoc.line(3).text).toBe('l');
    },
  );

  test('steps back with no user event, and on another line', () => {
    const state = choose(classicEditor(SOFT), 'lyric');
    const { from } = state.selection.main;
    expect(state.update({ changes: { from, insert: 'l' } }).newDoc.line(3).text).toBe('l');
    const elsewhere = state.update({ changes: { from: 0, insert: 'l' }, userEvent: 'input.type' });
    expect(elsewhere.newDoc.toString()).toBe('lShe waits.\n\n');
  });

  test('steps back in a note and on the title page', () => {
    expect(typedOn(returned('Title: A|\n\nShe waits.'), 'b')).toBe('Title: Ab');
    expect(typedOn(returned('She waits.\n\n[[later|]]'), 'B')).toBe('[[laterB]]');
  });
});

describe('makeElement on the cursor’s line', () => {
  test('makeElement on the cursor’s line replaces the stored element', () => {
    const heading = type(choose(classicEditor(SOFT), 'scene_heading'), 'flash');
    expect(render(heading)).toBe('She waits.\n\n.FLASH|');
    const action = apply(heading, makeElement('action'));
    expect(action.field(classicLine)).toBeNull();
    expect(render(type(action, ' x'))).toBe('She waits.\n\nFLASH x|');
  });

  test('a stale stored line never re-adds a mark', () => {
    const lyric = type(choose(classicEditor(SOFT), 'lyric'), 'la');
    const dialogue = apply(lyric, makeElement('action'));
    expect(dialogue.doc.line(3).text).toBe('la');
    expect(type(dialogue, 'x').doc.line(3).text).toBe('lax');
  });

  test('a command that writes nothing still ends the stored line', () => {
    const soft = type(classicEditor(SOFT), 'HELLO');
    expect(stored(soft).soft).toBe(true);
    const made = apply(soft, makeElement('action'));
    expect(made.sliceDoc()).toBe(soft.sliceDoc());
    expect(made.field(classicLine)).toBeNull();
    expect(type(made, ' TO:').doc.line(3).text).toBe('!HELLO TO:');
  });

  test('on an empty chosen line, what is chosen goes and the line is worked out again', () => {
    const chosen = choose(classicEditor(SOFT), 'character');
    expect(stored(apply(chosen, makeElement('action')))).toMatchObject({
      kind: 'action',
      chosen: false,
    });
  });
});

describe('fix round 1', () => {
  test('Action under an action paragraph after a speech stays Action', () => {
    expect(typedOn(classicEditor('JUNE\nHello.\n\nShe leaves.\n|'), 'She waits for him')).toBe(
      'She waits for him',
    );
    const between = classicEditor('JUNE\nHello.\n\nOne.\n|\nTwo.');
    expect(typedOn(between, 'She waits for him')).toBe('She waits for him');
    expect(elementAt(type(between, 'She'))?.kind).toBe('action');
  });

  test.each([
    ['She waits.\n|', 'int. x', 'int. x'],
    ['She waits.\n|', 'CUT TO:', 'CUT TO:'],
    ['One.\n|\nTwo.', 'int. x', 'int. x'],
    ['One.\n|\nTwo.', 'CUT TO:', 'CUT TO:'],
  ])('a shape needs a blank line above: %j + %s stays Action', (marked, text, written) => {
    const state = classicEditor(marked);
    expect(typedOn(state, text)).toBe(written);
    expect(elementAt(type(state, text))?.kind).toBe('action');
  });

  test('a shape on line 1 needs no blank line above', () => {
    expect(typedOn(classicEditor('|'), 'int. x')).toBe('INT. X');
  });

  test('a stored element that was not chosen outlives the first letter', () => {
    const lyric = classicEditor(SOFT).update({ effects: setStored.of({ kind: 'lyric' }) }).state;
    expect(lettering(lyric, 'la')).toEqual(['~l', '~la']);
    expect(elementAt(type(lyric, 'la'))?.kind).toBe('lyric');
    expect(typedOn(lyric, 'int. x')).toBe('~int. x');
    const play = classicEditor('# ONE\n\n|', { template: PLAY }).update({
      effects: setStored.of({ kind: 'scene_heading' }),
    }).state;
    expect(typedOn(play, 'two')).toBe('## TWO');
  });

  test.each([
    ['lyric', '~la', ['~~', '~~l', '~~la']],
    ['transition', '>x', ['>>', '>>X']],
    ['synopsis', '=x', ['= =', '= =x']],
    ['section', '#x', ['# #', '# #x']],
  ] as const)('a mark’s character typed on %s is kept: %s', (kind, text, steps) => {
    expect(lettering(choose(classicEditor(SOFT), kind), text)).toEqual(steps);
  });

  test('those marks from a file are still left alone', () => {
    expect(typedOn(returned('She waits.\n\n= plan|'), 'x')).toBe('= planx');
    expect(typedOn(returned('She waits.\n\n# Part|'), 'x')).toBe('# Partx');
  });

  test('#X on a chosen Scene heading is not read as a Section', () => {
    expect(typedOn(choose(classicEditor(SOFT), 'scene_heading'), '#x')).toBe('!#X');
  });

  test('FADE< on a Transition is not Centered and keeps its <', () => {
    const steps = lettering(choose(classicEditor(SOFT), 'transition'), 'FADE<X');
    expect(steps.slice(-3)).toEqual(['>FADE', 'FADE<', '>FADE<X']);
  });
});

describe('readsAs', () => {
  test('a name is tested with a line under it', () => {
    const state = classicEditor(SOFT);
    expect(readsAs(state, line(state), 'JUNE', 'character', 'JUNE')).toBe(true);
    expect(readsAs(state, line(state), 'June', 'character', 'June')).toBe(false);
  });

  test('Action reads the words too', () => {
    const state = classicEditor(SOFT);
    expect(readsAs(state, line(state), 'Bang', 'action', 'Bang')).toBe(true);
    expect(readsAs(state, line(state), '!Bang', 'action', '!Bang')).toBe(false);
    expect(readsAs(state, line(state), '!!Bang', 'action', '!Bang')).toBe(true);
  });

  test('past the cap it says yes, so no new mark is written', () => {
    const state = classicEditor(SOFT);
    const long = '.'.repeat(MAX_RUN.chars + 1);
    expect(readsAs(state, line(state), long, 'scene_heading', long)).toBe(true);
    const lines = `${'She waits.\n'.repeat(MAX_RUN.lines + 1)}|`;
    const deep = classicEditor(lines);
    expect(typedOn(deep, '.4')).toBe('.4');
  });
});
