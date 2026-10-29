import { completionStatus } from '@codemirror/autocomplete';
import { EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  canMakeParenthetical,
  cueMode,
  type ElementKind,
  elementHint,
  elementStructure,
  fountain,
  fountainEnter,
  fountainTab,
  insertMark,
  insertPageBreak,
  makeElement,
  opensCompletion,
  readsAsName,
  structureOf,
  withCompletion,
  wrapInBold,
  wrapInItalic,
  wrapInUnderline,
} from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply, BOM, editor, render, run, stateOf, type } from './helpers';

// The element bar's commands (docs/drafter-element-bar-design.md §4): each writes natural Fountain
// where it can, and a forcing mark only where the line would read as something else without one.

/** Each row: the text before, with the cursor as `|` or a selection in `[ ]`, and the text after. */
function rows(kind: ElementKind, table: Array<[before: string, after: string]>) {
  for (const [before, after] of table) {
    it(`turns ${JSON.stringify(before)} into ${JSON.stringify(after)}`, () => {
      expect(render(apply(editor(before), makeElement(kind)))).toBe(after);
    });
  }
}

/** Whether the command's one transaction asks for the completion list. */
const asks = (marked: string, command: StateCommand) => {
  const { transactions } = run(editor(marked), command);
  return transactions.some(opensCompletion);
};

describe('Scene heading', () => {
  rows('scene_heading', [
    // An empty line starts a heading for the writer to finish.
    ['|', 'INT. |'],
    // A heading needs a blank line before and after it.
    ['She waits.\n|', 'She waits.\n\nINT. |'],
    ['She waits.\nkitchen - night|\nHe goes.', 'She waits.\n\nINT. KITCHEN - NIGHT|\n\nHe goes.'],
    // Text is upper-cased and, with no prefix of its own, gets `INT. ` before it.
    ['kitchen - night|', 'INT. KITCHEN - NIGHT|'],
    ['kit|chen', 'INT. KITCHEN|'],
    ['int. kitchen - night|', 'INT. KITCHEN - NIGHT|'],
    ['ext hall|', 'EXT HALL|'],
    ['i/e car - moving|', 'I/E CAR - MOVING|'],
    // A heading that names no place is forced with `.` instead.
    ['flashback|', '.FLASHBACK|'],
    ['end montage|', '.END MONTAGE|'],
    ['moments later|', '.MOMENTS LATER|'],
    ['dream sequence|', '.DREAM SEQUENCE|'],
    // Only a whole line of those words: anything more is taken for a place.
    ['dream house|', 'INT. DREAM HOUSE|'],
    ['back to school hallway|', 'INT. BACK TO SCHOOL HALLWAY|'],
    ['flashback kitchen|', 'INT. FLASHBACK KITCHEN|'],
    // A note on the line is the writer's own words, and keeps its case.
    ['the hallway [[check]]|', 'INT. THE HALLWAY [[check]]|'],
    // Another kind's mark goes.
    ['!int. hall|', 'INT. HALL|'],
    ['@kitchen|', 'INT. KITCHEN|'],
    ['# kitchen|', 'INT. KITCHEN|'],
    // A heading already: a `.` it doesn't need comes off, and else nothing changes.
    ['.INT. HALL|', 'INT. HALL|'],
    ['.FLASHBACK|', '.FLASHBACK|'],
    ['INT. HA|LL - DAY', 'INT. HA|LL - DAY'],
    // After a title page, and at the start of a file with a byte-order mark.
    ['Title: The Call\n|', 'Title: The Call\n\nINT. |'],
    [`${BOM}kitchen|`, `${BOM}INT. KITCHEN|`],
  ]);

  it('opens the list of locations for an empty line, and not for one with text', () => {
    expect(asks('|', makeElement('scene_heading'))).toBe(true);
    expect(asks('kitchen|', makeElement('scene_heading'))).toBe(false);
  });

  it('makes each line of a selection a heading', () => {
    const next = apply(editor('[kitchen\nhall]'), makeElement('scene_heading'));
    expect(next.sliceDoc()).toBe('INT. KITCHEN\n\nINT. HALL');
    expect(next.selection.main.empty).toBe(false);
  });

  it('leaves the title page alone', () => {
    expect(
      run(editor('Title: The Ca|ll\nAuthor: Me\n\nShe waits.'), makeElement('scene_heading')),
    ).toMatchObject({ handled: false, transactions: [] });
  });
});

describe('Character', () => {
  rows('character', [
    // An empty line starts a cue, as Tab does, after a blank line.
    ['She waits.\n\n|', 'She waits.\n\n@|'],
    ['She waits.\n|', 'She waits.\n\n@|'],
    ['|', '@|'],
    // Capitals alone make a cue, so a name gets no `@`.
    ['margaret|', 'MARGARET|'],
    ['marg|aret', 'MARGARET|'],
    ['margaret (v.o.)|', 'MARGARET (V.O.)|'],
    ['Margaret|', 'MARGARET|'],
    // A name with a capital inside a word keeps its case, with the `@` it then needs.
    ['McDonald|', '@McDonald|'],
    ['McDONALD|', '@McDONALD|'],
    // Notes and a boneyard on the line keep their case.
    ['bob [[old name]]|', 'BOB [[old name]]|'],
    ['bob /* was ted */|', 'BOB /* was ted */|'],
    ['She waits.\nmargaret|\nHello.', 'She waits.\n\nMARGARET|\nHello.'],
    ['!margaret|', 'MARGARET|'],
    // A name with no capitals to give needs the `@`.
    ['丽丽|', '@丽丽|'],
    // A cue already: an `@` it doesn't need comes off, and else nothing changes.
    ['@MARGARET|\nHello.', 'MARGARET|\nHello.'],
    ['@McCLANE|\nHello.', '@McCLANE|\nHello.'],
    ['MARG|ARET\nHello.', 'MARG|ARET\nHello.'],
    ['MARGARET ^|\nHi.', 'MARGARET ^|\nHi.'],
  ]);

  it('turns on cue mode and opens the names for an empty line', () => {
    const next = apply(editor('She waits.\n\n|'), makeElement('character'));
    expect(next.field(cueMode)).toBe(true);
    expect(asks('She waits.\n\n|', makeElement('character'))).toBe(true);
    expect(asks('margaret|', makeElement('character'))).toBe(false);
  });
});

describe('Dialogue', () => {
  rows('dialogue', [
    // Under a cue, an empty line is already where the speech goes.
    ['MARGARET\n|', 'MARGARET\n|'],
    ['MARGARET\nHel|lo.', 'MARGARET\nHel|lo.'],
    // On a cue, the cursor goes to the speech, or to a new line for one.
    ['MARG|ARET\nHello.', 'MARGARET\nHello.|'],
    ['MARGARET|', 'MARGARET\n|'],
    ['MARGARET|\n\nShe waits.', 'MARGARET\n|\n\nShe waits.'],
    // Action just below a cue, a blank line between: the blank line goes.
    ['MARGARET\n\nHello.|', 'MARGARET\nHello.|'],
    ['MARGARET\n\n\n!Hel|lo.', 'MARGARET\nHello.|'],
    // A parenthetical or a lyric in a speech loses its mark.
    ['MARGARET\n(beat|)', 'MARGARET\nbeat|'],
    ['MARGARET\n~La la|', 'MARGARET\nLa la|'],
    // Anywhere else, a new cue above the line, for the writer to name the speaker.
    ['She waits.\n\nHello there.|', 'She waits.\n\n@|\nHello there.'],
    ['She waits.\nHe n|ods.', 'She waits.\n\n@|\nHe nods.'],
    ['Hello.|', '@|\nHello.'],
    ['She waits.\n|', 'She waits.\n\n@|'],
  ]);

  it('starts cue mode and opens the names when it adds a cue', () => {
    const state = 'She waits.\n\nHello there.|';
    expect(apply(editor(state), makeElement('dialogue')).field(cueMode)).toBe(true);
    expect(asks(state, makeElement('dialogue'))).toBe(true);
    expect(asks('MARGARET\n\nHello.|', makeElement('dialogue'))).toBe(false);
  });
});

describe('Parenthetical', () => {
  rows('parenthetical', [
    ['MARGARET\n|', 'MARGARET\n(|)'],
    ['MARGARET\nHello.\n|', 'MARGARET\nHello.\n(|)'],
    ['MARGARET\nqui|etly', 'MARGARET\n(quietly|)'],
    ['MARGARET\n~quietly|', 'MARGARET\n(quietly|)'],
    ['MARGARET\n(quie|tly)', 'MARGARET\n(quie|tly)'],
    // On a cue, it goes under the cue.
    ['MARG|ARET\nHello.', 'MARGARET\n(|)\nHello.'],
    // A name just written, with no speech yet, is a cue too.
    ['She waits.\n\nBOB|', 'She waits.\n\nBOB\n(|)'],
  ]);

  it('applies only under a cue or in a speech', () => {
    for (const marked of [
      'MARGARET\n|',
      'MARGARET\nHel|lo.',
      'MAR|GARET\nHi.',
      'MARGARET\n(a|)',
      '\nBOB|',
    ]) {
      expect(canMakeParenthetical(editor(marked)), marked).toBe(true);
    }
    for (const marked of ['She waits.|', 'She waits.\n\n|', '|', 'INT. HALL|', 'Title: A|\n\nB']) {
      expect(canMakeParenthetical(editor(marked)), marked).toBe(false);
      expect(run(editor(marked), makeElement('parenthetical')).handled, marked).toBe(false);
    }
  });
});

describe('Action', () => {
  rows('action', [
    ['!She waits.|', 'She waits.|'],
    ['She wa|its.', 'She wa|its.'],
    // A line that would read as something else keeps or gets a `!`.
    ['!INT. HALL|', '!INT. HALL|'],
    ['INT. HALL|', '!INT. HALL|'],
    ['CUT TO:|', '!CUT TO:|'],
    ['MARGARET|\nHello.', '!MARGARET|\nHello.'],
    // Other marks go, and no `!` where none is needed.
    ['.FLASHBACK|', 'FLASHBACK|'],
    ['# Act one|', 'Act one|'],
    ['>THE END<|', 'THE END|'],
    // A line of a speech is set apart from it.
    ['MARGARET\nHello.|', 'MARGARET\n\nHello.|'],
    ['MARGARET\n|', 'MARGARET\n\n|'],
    // A page break has no words to make action of.
    ['===|', '===|'],
  ]);
});

describe('Transition', () => {
  rows('transition', [
    ['cut to:|', 'CUT TO:|'],
    ['fade out.|', '>FADE OUT.|'],
    ['>CUT TO:|', 'CUT TO:|'],
    ['>FADE OUT.|', '>FADE OUT.|'],
    ['smash cut to: [[maybe]]|', 'SMASH CUT TO: [[maybe]]|'],
    ['She waits.\ncut to:|\nHe goes.', 'She waits.\n\nCUT TO:|\n\nHe goes.'],
    ['|', '>|'],
  ]);

  it('opens the list of transitions for an empty line', () => {
    expect(asks('|', makeElement('transition'))).toBe(true);
  });
});

describe('Centered, Lyric, Section, and Synopsis', () => {
  rows('centered', [
    ['THE END|', '>THE END|<'],
    ['|', '>|<'],
    ['> THE END <|', '> THE END <|'],
    ['She waits.\nTHE END|', 'She waits.\n\n>THE END|<'],
  ]);
  rows('lyric', [
    ['La la|', '~La la|'],
    ['MARGARET\nLa la|', 'MARGARET\n~La la|'],
    ['She waits.\nLa la|', 'She waits.\n\n~La la|'],
    ['~La la|', '~La la|'],
  ]);
  rows('section', [
    ['Act one|', '# Act one|'],
    ['|', '# |'],
    ['## Act one|', '## Act one|'],
  ]);
  rows('synopsis', [
    ['She finds the letter.|', '= She finds the letter.|'],
    ['|', '= |'],
    ['= She finds it.|', '= She finds it.|'],
  ]);
});

describe('a selection of whole lines', () => {
  // A triple click or Mod-L selects a line and its break, to the start of the next line.
  it('acts on the selected line, not the one after it', () => {
    const doc = (marked: string, kind: ElementKind) =>
      apply(editor(marked), makeElement(kind)).sliceDoc();
    expect(doc('[kitchen\n]He runs.', 'scene_heading')).toBe('INT. KITCHEN\n\nHe runs.');
    expect(doc('[cut to:\n]She runs.', 'transition')).toBe('CUT TO:\n\nShe runs.');
    expect(doc('\n[bob\n]Hi.', 'character')).toBe('\nBOB\nHi.');
  });

  it('makes only the first line a cue', () => {
    expect(apply(editor('[bob\nHi.]'), makeElement('character')).sliceDoc()).toBe('BOB\nHi.');
  });
});

describe('a cue begun from the bar', () => {
  /** Moves the cursor to the end of the text, as a click elsewhere would. */
  const leave = (state: EditorState) =>
    state.update({ selection: { anchor: state.doc.length }, userEvent: 'select.pointer' }).state;

  it('loses its `@` when the name typed reads as a cue', () => {
    let state = apply(editor('She waits.\n\n|'), makeElement('character'));
    state = type(state, 'bob');
    expect(state.sliceDoc()).toBe('She waits.\n\n@BOB');
    state = apply(state, fountainEnter);
    expect(render(state)).toBe('She waits.\n\nBOB\n|');
  });

  it('loses it when the cursor leaves the line, from Dialogue too', () => {
    let state = apply(editor('She waits.\n\nHello there.|'), makeElement('dialogue'));
    state = leave(type(state, 'bob'));
    expect(state.sliceDoc()).toBe('She waits.\n\nBOB\nHello there.');
  });

  it('keeps it when the name needs it, and after a Tab', () => {
    let state = apply(editor('She waits.\n\n|'), makeElement('character'));
    state = leave(type(state, '丽丽'));
    expect(state.sliceDoc()).toBe('She waits.\n\n@丽丽');
    // Tab's cue is the writer's own `@`, as before.
    const tab = leave(type(apply(editor('She waits.\n\n|'), fountainTab), 'bob'));
    expect(tab.sliceDoc()).toBe('She waits.\n\n@BOB');
  });
});

describe('readsAsName', () => {
  it('finds a name with no speech under it yet', () => {
    expect(readsAsName(editor('She waits.\n\nBOB|'))).toBe(true);
    expect(readsAsName(editor('She waits.\n\nBOB|\n\nHe goes.'))).toBe(true);
    expect(readsAsName(editor('She waits.\n\nBob runs.|'))).toBe(false);
    expect(readsAsName(editor('She waits.\nBOB|'))).toBe(false);
    expect(readsAsName(editor('BOB|\nHi.'))).toBe(false);
  });
});

describe('elementHint', () => {
  it('says why a command does nothing here', () => {
    expect(elementHint('scene_heading', editor('Title: The Ca|ll\n\nShe waits.'))).toMatch(
      /title page/,
    );
    expect(elementHint('action', editor('[[a note|]]'))).toMatch(/note or a boneyard/);
    expect(elementHint('dialogue', editor('MARGARET\n|'))).toMatch(/already dialogue/);
    expect(elementHint('dialogue', editor('MARGARET\nHel|lo.'))).toMatch(/already dialogue/);
    expect(elementHint('parenthetical', editor('She waits.|'))).toMatch(/under a character name/);
    expect(elementHint('action', editor('===|'))).toMatch(/page break/);
  });

  it('says nothing where the command acts', () => {
    expect(elementHint('scene_heading', editor('kitchen|'))).toBeNull();
    expect(elementHint('parenthetical', editor('MARGARET\n|'))).toBeNull();
    expect(elementHint('dialogue', editor('She waits.\n\nHi.|'))).toBeNull();
  });
});

describe('insertPageBreak', () => {
  const rowsOf = (table: Array<[string, string]>) => {
    for (const [before, after] of table) {
      it(`turns ${JSON.stringify(before)} into ${JSON.stringify(after)}`, () => {
        expect(render(apply(editor(before), insertPageBreak))).toBe(after);
      });
    }
  };
  rowsOf([
    ['|', '===|'],
    ['She waits.\n|', 'She waits.\n\n===|'],
    ['She waits.|', 'She waits.\n\n===|'],
    ['She wa|its.\nHe goes.', 'She waits.\n\n===|\n\nHe goes.'],
    ['She waits.|\n\nHe goes.', 'She waits.\n\n===|\n\nHe goes.'],
    ['===|', '===|'],
  ]);
});

describe('emphasis', () => {
  it('wraps the selection, or puts the cursor between an empty pair', () => {
    expect(render(apply(editor('a [word] b'), wrapInBold))).toBe('a **[word]** b');
    expect(render(apply(editor('a [word] b'), wrapInItalic))).toBe('a *[word]* b');
    expect(render(apply(editor('a [word] b'), wrapInUnderline))).toBe('a _[word]_ b');
    expect(render(apply(editor('a |'), wrapInBold))).toBe('a **|**');
  });
});

describe('every element command', () => {
  const commands: Array<[string, StateCommand, string]> = [
    ['scene', makeElement('scene_heading'), 'She waits.\nkitchen|'],
    ['action', makeElement('action'), 'INT. HALL|'],
    ['character', makeElement('character'), 'She waits.\n|'],
    ['dialogue', makeElement('dialogue'), 'MARGARET\n\nHello.|'],
    ['dialogue, a new cue', makeElement('dialogue'), 'She waits.\nHello.|'],
    ['parenthetical', makeElement('parenthetical'), 'MARGARET\nquietly|'],
    ['transition', makeElement('transition'), 'She waits.\ncut to:|\nHe goes.'],
    ['centered', makeElement('centered'), 'THE END|'],
    ['lyric', makeElement('lyric'), 'La la|'],
    ['section', makeElement('section'), 'Act one|'],
    ['synopsis', makeElement('synopsis'), 'She finds it.|'],
    ['page break', insertPageBreak, 'She waits.|\nHe goes.'],
    ['bold', wrapInBold, '[word]'],
  ];

  it('is one undo step', () => {
    for (const [name, command, marked] of commands) {
      const state = editor(marked);
      const pressed = run(state, command);
      expect(pressed.handled, name).toBe(true);
      expect(pressed.transactions, name).toHaveLength(1);
      const tr = pressed.transactions[0] as Transaction;
      expect(tr.docChanged, name).toBe(true);
      expect(tr.isUserEvent('input.type'), name).toBe(false);
      expect(tr.changes.invert(state.doc).apply(tr.newDoc).toString(), name).toBe(
        state.doc.toString(),
      );
    }
  });

  it('does nothing in a read-only editor', () => {
    for (const [name, command, marked] of commands) {
      const state = editor(marked, [EditorState.readOnly.of(true)]);
      expect(run(state, command), name).toMatchObject({ handled: false, transactions: [] });
    }
  });

  it("writes the file's own line break", () => {
    const crlf = [EditorState.lineSeparator.of('\r\n')];
    const heading = apply(
      editor('She waits.\nkitchen|\nHe goes.', crlf),
      makeElement('scene_heading'),
    );
    expect(heading.sliceDoc()).toBe('She waits.\r\n\r\nINT. KITCHEN\r\n\r\nHe goes.');
    // The cursor counts each break as one position, at the end of the heading.
    expect(heading.selection.main.head).toBe(24);
    const cue = apply(editor('She waits.\nHello.|', crlf), makeElement('dialogue'));
    expect(cue.sliceDoc()).toBe('She waits.\r\n\r\n@\r\nHello.');
    expect(cue.selection.main.head).toBe(13);
  });

  it('does nothing inside a boneyard', () => {
    const state = editor('/* She waits.\nkit|chen */');
    expect(run(state, makeElement('scene_heading')).handled).toBe(false);
  });
});

// jsdom has no layout; CodeMirror measures ranges to scroll the cursor into view.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

describe('withCompletion', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  function mount(doc: string) {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: fountain() }),
      parent,
    });
    views.push(view);
    return view;
  }

  it('opens the list when the command asks for it', async () => {
    const view = mount('MARGARET\nHi.\n\nBRICK\nHo.\n\n');
    expect(withCompletion(makeElement('character'))(view)).toBe(true);
    expect(view.state.doc.toString().endsWith('\n\n@')).toBe(true);
    await vi.waitFor(() => expect(completionStatus(view.state)).not.toBeNull(), { timeout: 3000 });
  });

  it('opens nothing when it does not', async () => {
    const view = mount('margaret');
    expect(withCompletion(makeElement('character'))(view)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(completionStatus(view.state)).toBeNull();
  });
});

describe('a stage play (the template’s roles)', () => {
  const play = builtins['stage-play-standard'] as Template;
  const screenplay = builtins['us-screenplay'] as Template;
  const stage = [elementStructure.of(() => structureOf(play))];
  const on = (marked: string, kind: ElementKind) =>
    render(apply(editor(marked, stage), makeElement(kind)));

  it('reads acts, scenes, and stage directions from the role map', () => {
    expect(structureOf(play)).toEqual({
      actDepth: 1,
      sceneDepth: 2,
      headings: false,
      transitions: false,
      stageDirections: true,
    });
    expect(structureOf(screenplay)).toEqual({
      actDepth: null,
      sceneDepth: null,
      headings: true,
      transitions: true,
      stageDirections: false,
    });
  });

  it('makes a scene a ## line, and an act a # line', () => {
    expect(on('|', 'scene_heading')).toBe('## |');
    expect(on('The kitchen|', 'scene_heading')).toBe('## The kitchen|');
    expect(on('She waits.\nScene two|', 'scene_heading')).toBe('She waits.\n\n## Scene two|');
    expect(on('## Scene two|', 'scene_heading')).toBe('## Scene two|');
    expect(on('# Scene two|', 'scene_heading')).toBe('## Scene two|');
    expect(on('Act one|', 'act')).toBe('# Act one|');
    expect(on('|', 'act')).toBe('# |');
  });

  it('writes no transition, and says why', () => {
    const state = editor('cut to:|', stage);
    expect(run(state, makeElement('transition')).handled).toBe(false);
    expect(elementHint('transition', state)).toMatch(/no transitions/);
  });

  it('has no acts in a screenplay, and says why', () => {
    const state = editor('Act one|');
    expect(run(state, makeElement('act')).handled).toBe(false);
    expect(elementHint('act', state)).toMatch(/no acts/);
  });

  it('runs Mod-Alt-1 as a scene there too', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: fountain({ template: () => play }),
      }),
      parent: document.body,
    });
    view.dispatch({ selection: { anchor: 0 } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '1',
        keyCode: 49,
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(view.state.sliceDoc()).toBe('## ');
    view.destroy();
  });

  it('tells the app why a key did nothing', () => {
    const hints: string[] = [];
    const view = new EditorView({
      state: EditorState.create({
        doc: 'She waits.',
        selection: { anchor: 10 },
        extensions: fountain({ onHint: (message) => hints.push(message) }),
      }),
      parent: document.body,
    });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '4',
        keyCode: 52,
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(hints).toEqual([expect.stringMatching(/under a character name/)]);
    view.destroy();
  });
});

describe('a cue begun from the bar and left empty', () => {
  it('leaves no lone @ behind', () => {
    let state = apply(editor('She waits.\n\n|'), makeElement('character'));
    expect(state.sliceDoc()).toBe('She waits.\n\n@');
    state = state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }).state;
    expect(state.sliceDoc()).toBe('She waits.\n\n');
  });

  it('is left alone by a change the app makes', () => {
    let state = type(apply(editor('She waits.\n\n|'), makeElement('character')), 'bob');
    // A file put back from disk (no user event) replaces the text; nothing of it is touched.
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: '@BOB\nHi.' },
      selection: { anchor: 0 },
    }).state;
    expect(state.sliceDoc()).toBe('@BOB\nHi.');
  });
});

describe('insertMark', () => {
  const mark = (doc: string, head: 'Setup' | 'Payoff', readOnly = false) => {
    const state = stateOf(doc, [EditorState.readOnly.of(readOnly)]);
    let after = state;
    const handled = insertMark(head)({
      state,
      dispatch: (tr) => {
        after = tr.state;
      },
    });
    return { handled, text: after.doc.toString(), head: after.selection.main.head };
  };

  it('puts the mark at the end of the line, with the cursor before its ]]', () => {
    const found = mark('She waits.', 'Setup');
    expect(found.handled).toBe(true);
    expect(found.text).toBe('She waits. [[Setup: ]]');
    expect(found.head).toBe(found.text.length - 2);
  });

  it('does nothing where the mark would change the script, or in a read-only editor', () => {
    expect(mark('/* cut', 'Payoff').handled).toBe(false);
    expect(mark('She waits.', 'Payoff', true).handled).toBe(false);
  });
});
