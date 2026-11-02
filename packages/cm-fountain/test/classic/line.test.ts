import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { appChange } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import {
  type ClassicElement,
  classicEdit,
  classicLine,
  elementAt,
  lineKindAt,
  nextFrom,
  pendingAt,
  setDismissed,
  setStored,
} from '../../src/classic/line';
import { classicEditor, type } from './harness';

const PLAY = builtins['stage-play-standard'] as Template;

const cursorTo = (state: EditorState, pos: number) =>
  state.update({ selection: { anchor: pos }, userEvent: 'select' }).state;

const element = (state: EditorState) => elementAt(state) as ClassicElement;

/** The kind of the pending line at the cursor of a marked script. */
const pending = (marked: string, template?: Template) => {
  const state = classicEditor(marked, template ? { template } : {});
  return pendingAt(state, state.selection.main.head);
};

describe('the pending element of an empty line', () => {
  test('directly under a name, a parenthetical, or a line of speech is Dialogue', () => {
    expect(pending('\nJUNE\n|')).toBe('dialogue'); // a lone name: action to the parser
    expect(pending('JUNE\n(quietly)\n|\n\nmore')).toBe('dialogue');
    expect(pending('JUNE\nHello.\n|')).toBe('dialogue');
    expect(pending('JUNE\nHello.\n  \n|')).toBe('dialogue');
    expect(pending('JUNE\n~la la\n|')).toBe('dialogue');
  });

  test('after a speech is Character', () => {
    expect(pending('JUNE\nHello.\n\n|')).toBe('character');
    expect(pending('JUNE\n(quietly)\n\n\n|')).toBe('character');
    expect(pending('JUNE\nHello.\n\n[[a note]]\n\n|')).toBe('character');
  });

  test('elsewhere is soft Action, and a stage direction in a play, which is firm', () => {
    expect(pending('INT. DINER - DAY\n\n|')).toBe('action');
    expect(pending('She waits.\n\n|')).toBe('action');
    const soft = classicEditor('She waits.\n\n|');
    expect(element(soft)).toMatchObject({ kind: 'action', pending: true, soft: true });

    const play = classicEditor('She waits.\n\n|', { template: PLAY });
    expect(pendingAt(play, play.selection.main.head)).toBe('action');
    expect(element(play)).toMatchObject({ kind: 'action', pending: true, soft: false });
  });

  test('a new script and the line after a Transition are soft Action', () => {
    expect(element(classicEditor('|'))).toMatchObject({
      kind: 'action',
      pending: true,
      soft: true,
    });
    expect(element(classicEditor('CUT TO:\n\n|'))).toMatchObject({
      kind: 'action',
      pending: true,
      soft: true,
    });
  });

  test('a pending Character is firm: the heading prefix rule is its own', () => {
    expect(element(classicEditor('JUNE\nHello.\n\n|'))).toMatchObject({
      kind: 'character',
      soft: false,
    });
  });
});

describe('a line with text', () => {
  test('a line with text reads the parse, and a play’s roles', () => {
    const kinds = (script: string, template?: Template) => {
      const state = classicEditor(`${script}\n`, template ? { template } : {});
      return elementAt(cursorTo(state, 0))?.kind;
    };
    expect(kinds('INT. DINER - DAY')).toBe('scene_heading');
    expect(kinds('She waits.')).toBe('action');
    expect(kinds('JUNE\nHello.')).toBe('character');
    expect(kinds('CUT TO:')).toBe('transition');
    expect(kinds('> THE END <')).toBe('centered');
    expect(kinds('= A summary')).toBe('synopsis');
    expect(kinds('# A part')).toBe('section');
    expect(kinds('~la la')).toBe('lyric');
    expect(kinds('===')).toBe('page_break');

    expect(kinds('# Act One', PLAY)).toBe('act');
    expect(kinds('## Scene One', PLAY)).toBe('scene_heading');
    expect(kinds('### A part', PLAY)).toBe('section');
    // A play's role map disables these, and they print as a stage direction.
    expect(kinds('INT. DINER - DAY', PLAY)).toBe('action');
    expect(kinds('CUT TO:', PLAY)).toBe('action');
  });

  test('a line of speech is read as one, with no pending and no stored line', () => {
    const state = classicEditor('JUNE\n(quietly)\nHello.\n|');
    expect(elementAt(cursorTo(state, 6))?.kind).toBe('parenthetical');
    expect(elementAt(cursorTo(state, 16))).toMatchObject({ kind: 'dialogue', pending: false });
    expect(cursorTo(state, 16).field(classicLine)).toBeNull();
  });

  test('a lone name is a Character while its Dialogue line is pending', () => {
    const state = classicEditor('\nJUNE\n|');
    const name = state.doc.line(2);
    expect(element(state)).toMatchObject({ kind: 'dialogue', pending: true });
    expect(lineKindAt(state, name)).toBe('character');
    // Elsewhere it draws what the parser reads.
    expect(lineKindAt(cursorTo(state, 0), name)).toBe('action');
  });

  test('a lone name the cursor returns to reads as Action', () => {
    expect(element(classicEditor('\nJUNE|\n'))).toMatchObject({ kind: 'action', pending: false });
  });

  test('a chosen Dialogue under plain action leaves the action as it is', () => {
    const state = classicEditor('She waits.\n|').update({
      effects: setStored.of({ kind: 'dialogue', chosen: true }),
    }).state;
    expect(element(state).kind).toBe('dialogue');
    expect(lineKindAt(state, state.doc.line(1))).toBe('action');
  });

  test('a note and a title page typed on a stored line draw as neither', () => {
    const note = type(classicEditor('She waits.\n\n|'), '[[hi]]');
    expect(note.field(classicLine)).not.toBeNull();
    expect(lineKindAt(note, note.doc.line(3))).toBeNull();
    const title = type(classicEditor('|'), 'Title: x');
    expect(title.field(classicLine)).not.toBeNull();
    expect(lineKindAt(title, title.doc.line(1))).toBeNull();
  });

  test('a line under a chosen element is not read as a lone name', () => {
    const state = classicEditor('\nBANG\n|').update({
      effects: setStored.of({ kind: 'action', chosen: true }),
    }).state;
    expect(lineKindAt(state, state.doc.line(2))).toBe('action');
  });
});

describe('the stored line', () => {
  test('a chosen element wins', () => {
    const state = classicEditor('She waits.\n\n|').update({
      effects: setStored.of({ kind: 'transition', chosen: true }),
    }).state;
    expect(element(state)).toMatchObject({ kind: 'transition', pending: true, soft: false });
    expect(state.field(classicLine)).toMatchObject({ from: 12, chosen: true });
    expect(element(type(state, 'FADE OUT.'))).toMatchObject({ kind: 'transition', pending: false });
  });

  test('a click on an empty line and an undo agree', () => {
    const start = classicEditor('JUNE\nHello.\n\n|');
    const typed = type(start, 'x');
    // What the history dispatches: the letter taken out, the cursor put back.
    const undone = typed.update({
      changes: { from: start.doc.length, to: typed.doc.length },
      selection: { anchor: start.doc.length },
      userEvent: 'undo',
    }).state;

    const clicked = cursorTo(cursorTo(start, 0), start.doc.length);
    const opened = classicEditor('JUNE\nHello.\n\n|');
    expect(element(undone)).toEqual(element(clicked));
    expect(element(clicked)).toEqual(element(opened));
  });

  test('a change that isn’t the writer’s drops the stored line', () => {
    const chosen = classicEditor('She waits.\n\n|').update({
      effects: setStored.of({ kind: 'transition', chosen: true, added: [{ from: 0, to: 1 }] }),
    }).state;
    const changes = { from: 0, insert: 'x' };
    const others = [
      { changes, annotations: appChange.of(true), userEvent: 'input' },
      { changes, annotations: appChange.of(true), userEvent: 'input.type' },
      { changes },
      { changes, userEvent: 'input.paste' },
      { changes, userEvent: 'undo' },
    ];
    for (const spec of others) {
      const next = chosen.update(spec).state;
      expect(next.field(classicLine)).toMatchObject({ chosen: false, added: [] });
      expect(element(next).kind).toBe('action');
    }

    const onText = type(classicEditor('She waits.\n\n|'), 'He');
    expect(onText.field(classicLine)).not.toBeNull();
    const dropped = onText.update({ changes, annotations: appChange.of(true) }).state;
    expect(dropped.field(classicLine)).toBeNull();
  });

  test('the writer’s typing and Classic’s own edits keep it, mapped through the change', () => {
    const start = classicEditor('She waits.\n\n|').update({
      effects: setStored.of({
        kind: 'transition',
        chosen: true,
        made: { from: 10, to: 12 },
      }),
    }).state;
    const typed = type(start, 'F').update({
      effects: setStored.of({ kind: 'transition', added: [{ from: 12, to: 13 }] }),
    }).state;
    expect(typed.field(classicLine)).toMatchObject({ from: 12, chosen: true });

    const edited = typed.update({
      changes: { from: 0, insert: 'xx' },
      annotations: classicEdit.of(true),
      userEvent: 'input',
    }).state;
    expect(edited.field(classicLine)).toMatchObject({
      from: 14,
      chosen: true,
      added: [{ from: 14, to: 15 }],
      made: { from: 12, to: 14 },
    });
  });

  test('a delete inside the line keeps it, and one across a break drops it', () => {
    const chosen = type(
      classicEditor('She waits.\n\n|').update({
        effects: setStored.of({ kind: 'character', chosen: true }),
      }).state,
      'JU',
    );
    const end = chosen.doc.length;
    const remove = (from: number, to: number, userEvent: string) =>
      chosen.update({ changes: { from, to }, userEvent }).state;

    // Backspace and Delete, and a word or a selection, down to an empty line.
    for (const userEvent of ['delete.backward', 'delete.forward', 'delete.selection']) {
      expect(remove(end - 1, end, userEvent).field(classicLine)).toMatchObject({
        kind: 'character',
        chosen: true,
      });
    }
    const emptied = remove(end - 2, end, 'delete.backward');
    expect(element(emptied)).toMatchObject({ kind: 'character', pending: true });

    expect(
      cursorTo(chosen, end - 2)
        .update({
          changes: { from: end - 3, to: end - 2 },
          userEvent: 'delete.backward',
        })
        .state.field(classicLine),
    ).toBeNull();
    expect(
      chosen
        .update({
          changes: { from: end - 1, to: end },
          annotations: appChange.of(true),
          userEvent: 'delete.backward',
        })
        .state.field(classicLine),
    ).toBeNull();
  });

  test('a stored mark or made line that is deleted goes', () => {
    const start = classicEditor('She waits.\n\n|').update({
      effects: setStored.of({
        kind: 'action',
        added: [{ from: 2, to: 3 }],
        made: { from: 4, to: 5 },
      }),
    }).state;
    const next = start.update({
      changes: { from: 1, to: 6 },
      annotations: classicEdit.of(true),
      userEvent: 'input',
    }).state;
    expect(next.field(classicLine)).toMatchObject({ added: [], made: null });
  });

  test('setStored keeps what it doesn’t name, on the same line', () => {
    const start = classicEditor('She waits.\n\n|');
    const next = start.update({
      effects: setStored.of({ kind: 'scene_heading', added: [{ from: 12, to: 13 }] }),
    }).state;
    expect(next.field(classicLine)).toMatchObject({ kind: 'scene_heading', soft: true });
    const after = next.update({ effects: setStored.of({ kind: 'action' }) }).state;
    expect(after.field(classicLine)).toMatchObject({ added: [{ from: 12, to: 13 }] });
  });

  test('setStored on a line the transaction moves to starts afresh there', () => {
    const start = classicEditor('She waits.\n\n|').update({
      effects: setStored.of({ kind: 'transition', chosen: true }),
    }).state;
    const next = start.update({
      changes: { from: 12, insert: 'x\n\n' },
      selection: { anchor: 15 },
      effects: setStored.of({ kind: 'action' }),
      annotations: classicEdit.of(true),
      userEvent: 'input',
    }).state;
    expect(next.field(classicLine)).toEqual({
      from: 15,
      kind: 'action',
      soft: false,
      chosen: false,
      added: [],
      made: null,
      dismissed: false,
      beganEmpty: true,
      arrivedAs: 'action',
    });
  });

  test('leaving the line clears it, and a line the cursor returns to is firm', () => {
    const typed = type(classicEditor('She waits.\n\n|'), 'He sits.');
    expect(element(typed)).toMatchObject({ kind: 'action', pending: false, soft: true });
    const left = cursorTo(typed, 0);
    expect(left.field(classicLine)).toBeNull();
    const back = cursorTo(left, typed.doc.length);
    expect(back.field(classicLine)).toBeNull();
    expect(element(back)).toMatchObject({ kind: 'action', pending: false, soft: false });
  });

  test('moving on the line keeps it', () => {
    const typed = type(classicEditor('She waits.\n\n|'), 'He sits.');
    expect(element(cursorTo(typed, 13)).soft).toBe(true);
  });

  test('Escape’s dismissal holds until the next letter', () => {
    const typed = type(classicEditor('She waits.\n\n|'), 'JO');
    const dismissed = typed.update({ effects: setDismissed.of(true) }).state;
    expect(dismissed.field(classicLine)?.dismissed).toBe(true);
    expect(cursorTo(dismissed, typed.doc.length - 1).field(classicLine)?.dismissed).toBe(true);
    expect(type(dismissed, 'H').field(classicLine)?.dismissed).toBe(false);
  });

  test('a cursor arriving in a note, a boneyard, or on the title page stores nothing', () => {
    // A blank line ends a note and a title page, so only a boneyard can hold one.
    expect(classicEditor('Hello.\n\n/* one\n|\n two */\n').field(classicLine)).toBeNull();
    expect(classicEditor('Hello.\n\n/* one| */\n').field(classicLine)).toBeNull();
    expect(classicEditor('Hello.\n\n[[a note|]]\n').field(classicLine)).toBeNull();
    expect(classicEditor('Hello.\n\n[[a note\n| that runs on]]\n').field(classicLine)).toBeNull();
    expect(classicEditor('Title: One|\nAuthor: Me\n\nINT. X\n').field(classicLine)).toBeNull();
  });

  test('a firm line deleted to empty counts as soft, as a click on an empty line does', () => {
    const typed = type(classicEditor('She waits.\n\n|'), 'He');
    const end = typed.doc.length;
    const back = cursorTo(cursorTo(typed, 0), end);
    expect(element(back)).toMatchObject({ pending: false, soft: false });
    const emptied = back.update({
      changes: { from: end - 2, to: end },
      userEvent: 'delete.backward',
    }).state;
    expect(element(emptied)).toMatchObject({ kind: 'action', pending: true, soft: true });
  });

  test('classicEdit keeps the line with no user event, and appChange beats it', () => {
    const typed = type(classicEditor('She waits.\n\n|'), 'He');
    const changes = { from: 0, insert: 'x' };
    expect(
      typed.update({ changes, annotations: classicEdit.of(true) }).state.field(classicLine),
    ).not.toBeNull();
    expect(
      typed
        .update({ changes, annotations: [classicEdit.of(true), appChange.of(true)] })
        .state.field(classicLine),
    ).toBeNull();
  });
});

describe('elementAt', () => {
  test('elementAt is null with a selection, and with several cursors', () => {
    expect(elementAt(classicEditor('[She] waits.'))).toBeNull();
    const several = classicEditor('She waits.\n\n|').update({
      effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)),
    }).state;
    const both = several.update({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)]),
    }).state;
    expect(both.selection.ranges.length).toBe(2);
    expect(elementAt(both)).toBeNull();
    expect(both.field(classicLine)).toBeNull();
  });

  test('the title page, a note, and a boneyard are named, with no enter or tab', () => {
    const named = (marked: string, kind: string) =>
      expect(elementAt(classicEditor(marked))).toEqual({
        kind,
        pending: false,
        soft: false,
        enter: null,
        tab: null,
      });
    named('Title: One|\nAuthor: Me\n\nINT. DINER\n', 'title_page');
    named('Hello.\n\n[[a note|]]\n', 'note');
    named('Hello.\n\n[[a note\n| that runs on]]\n\nAfter.', 'note');
    named('Hello.\n\n/* cut| */\n', 'boneyard');
    named('Hello.\n\n/* one\n\n| two */\n', 'boneyard');
  });

  test('enter and tab name what comes next, for the status line', () => {
    const next = (marked: string, template?: Template) => {
      const { enter, tab } = element(classicEditor(marked, template ? { template } : {}));
      return [enter, tab];
    };
    expect(next('INT. DINER - DAY|\n')).toEqual(['action', 'action']);
    expect(next('She waits.|\n')).toEqual(['action', 'character']);
    expect(next('JUNE|\nHello.\n')).toEqual(['dialogue', 'dialogue']);
    expect(next('JUNE\n(quietly)|\nHello.\n')).toEqual(['dialogue', 'dialogue']);
    expect(next('JUNE\nHello.|\n')).toEqual(['character', 'parenthetical']);
    expect(next('JUNE\nHello| there.\n')).toEqual(['dialogue', 'parenthetical']);
    expect(next('JUNE\nHello.|\nAgain.\n')).toEqual(['dialogue', 'parenthetical']);
    expect(next('JUNE\nHello.|\n(quietly)\nAgain.\n')).toEqual(['dialogue', 'parenthetical']);
    expect(next('CUT TO:|\n')).toEqual(['action', 'action']);
    expect(next('~la la|\n')).toEqual(['lyric', 'action']);
    expect(next('JUNE\n~la la|\n')).toEqual(['lyric', 'dialogue']);
    expect(next('= A summary|\n')).toEqual(['action', 'action']);

    expect(next('# Act One|\n', PLAY)).toEqual(['scene_heading', 'scene_heading']);
    expect(next('## Scene One|\n', PLAY)).toEqual(['action', 'action']);
    expect(next('She waits.|\n', PLAY)).toEqual(['action', 'character']);

    expect(next('She waits.\n\n|')).toEqual(['chooser', 'character']);
    expect(next('JUNE\nHello.\n\n|')).toEqual(['chooser', 'transition']);
    expect(next('JUNE\nHello.\n|')).toEqual(['chooser', 'parenthetical']);
    expect(next('She waits.\n\n|', PLAY)).toEqual(['chooser', 'character']);
    expect(next('JUNE\nHello.\n\n|', PLAY)).toEqual(['chooser', 'act']);
  });

  test('the row walks on and comes round, in both templates', () => {
    const empty = { empty: true, lastOfSpeech: true, inSpeech: false };
    const walk = (first: Parameters<typeof nextFrom>[0], headings: boolean) => {
      const seen = [first];
      for (let i = 0; i < 4; i++) {
        seen.push(nextFrom(seen.at(-1) as typeof first, { ...empty, headings }).tab);
      }
      return seen;
    };
    expect(walk('action', true)).toEqual([
      'action',
      'character',
      'transition',
      'scene_heading',
      'action',
    ]);
    expect(walk('action', false)).toEqual([
      'action',
      'character',
      'act',
      'scene_heading',
      'action',
    ]);
  });
});
