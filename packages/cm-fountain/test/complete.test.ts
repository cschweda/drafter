import {
  acceptCompletion,
  CompletionContext,
  completionStatus,
  currentCompletions,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import * as api from '@drafter/cm-fountain';
import { fountainCompletion, fountainCompletionSource } from '@drafter/cm-fountain';
import { parse } from '@drafter/fountain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stateOf } from './helpers';

const text = (...rows: string[]) => rows.join('\n');

/** The state and cursor for the `|` in `marked`, which is not part of the text. */
function at(marked: string) {
  const [before = '', after = ''] = marked.split('|');
  // A CRLF is one position to the editor, so the cursor is counted in the editor's own way.
  const pos = EditorState.create({ doc: before }).doc.length;
  return { state: stateOf(before + after), pos };
}

/**
 * What the source offers at the `|` in `marked`: the labels in order, and the text they would
 * replace, which runs from where the completion starts to the cursor. Null when it offers nothing.
 */
function ask(marked: string, explicit = false) {
  const { state, pos } = at(marked);
  const result = fountainCompletionSource(new CompletionContext(state, pos, explicit));
  return (
    result && {
      labels: result.options.map((option) => option.label),
      replaces: state.sliceDoc(result.from, pos),
    }
  );
}

describe('the package', () => {
  it('exports the completion', () => {
    expect(Object.keys(api)).toEqual(
      expect.arrayContaining(['fountainCompletion', 'fountainCompletionSource']),
    );
  });

  it('brings the parse with it', () => {
    const state = EditorState.create({
      doc: text('MARGARET', 'Hi.', '', 'MA'),
      extensions: [fountainCompletion()],
    });
    const context = new CompletionContext(state, state.doc.length, false);
    expect(fountainCompletionSource(context)?.options.map((o) => o.label)).toEqual(['MARGARET']);
  });
});

describe('character names', () => {
  // Four speeches, then (after the cursor, in the middle) three more names, one of them twice.
  const earlier = [
    ...['MARGARET', 'One.', ''],
    ...['BRICK', 'Two.', ''],
    ...['MARGARET', 'Three.', ''],
    ...['DOCTOR', 'Four.', ''],
  ];
  const later = [
    ...['AMY', 'Five.', ''],
    ...['ZED', 'Six.', ''],
    ...['BRICK', 'Seven.', ''],
    ...['ZED', 'Eight.', ''],
  ];

  it('offers character names on a cue line, the nearest last cue first', () => {
    // Before the cursor, DOCTOR spoke last, then MARGARET, then BRICK. AMY and ZED haven't spoken
    // yet, so the one with more cues comes first, though AMY comes first in the script.
    const middle = text(...earlier, '@|', 'Nine.', '', ...later);
    const names = ['DOCTOR', 'MARGARET', 'BRICK', 'ZED', 'AMY'];
    expect(ask(middle, true)).toEqual({ labels: names, replaces: '' });
    // At the end of the script the same names are in the order they last spoke.
    const end = text(...earlier, ...later, '@|');
    const byEnd = ['ZED', 'BRICK', 'AMY', 'DOCTOR', 'MARGARET'];
    expect(ask(end, true)).toEqual({ labels: byEnd, replaces: '' });
    // Positions count a CRLF as one character, and the order is the same.
    expect(ask(middle.replaceAll('\n', '\r\n'), true)).toEqual({ labels: names, replaces: '' });
  });

  it('offers the names that begin with what is typed, with or without an @', () => {
    const script = (cue: string) => text(...earlier, cue);
    expect(ask(script('MA|'))).toEqual({ labels: ['MARGARET'], replaces: 'MA' });
    expect(ask(script('@ma|'))).toEqual({ labels: ['MARGARET'], replaces: 'ma' });
    // The start is after the @ and the spaces that follow it, which the parser skips.
    expect(ask(script('@  DO|'))).toEqual({ labels: ['DOCTOR'], replaces: 'DO' });
    // Only the start of a name counts, not letters inside it.
    expect(ask(script('OC|'))).toBeNull();
  });

  it('offers nothing for one letter unless asked', () => {
    const script = (cue: string) => text('MARGARET', 'Hello.', '', cue);
    // One letter after an @, or alone on a line, is too little to open a list...
    expect(ask(script('@M|'))).toBeNull();
    expect(ask(script('M|'))).toBeNull();
    // ...unless the writer asks for it (Ctrl+Space).
    expect(ask(script('@M|'), true)).toEqual({ labels: ['MARGARET'], replaces: 'M' });
    expect(ask(script('M|'), true)).toEqual({ labels: ['MARGARET'], replaces: 'M' });
    // Asking on an empty line offers every name; typing there offers nothing.
    expect(ask(script('|'), true)).toEqual({ labels: ['MARGARET'], replaces: '' });
    expect(ask(script('|'))).toBeNull();
    // Two letters are enough.
    expect(ask(script('MA|'))).toEqual({ labels: ['MARGARET'], replaces: 'MA' });
    expect(ask(script('@MA|'))).toEqual({ labels: ['MARGARET'], replaces: 'MA' });
  });

  it('leaves a typed name alone when a longer name starts with it', () => {
    const cast = text('DAN', 'Hi.', '', 'DANNY', 'Hi.', '', 'DAN|');
    // Enter would take DANNY and lengthen the name the writer typed in full, so no list opens.
    expect(ask(cast)).toBeNull();
    expect(ask(cast, true)).toBeNull();
    expect(ask(text('DAN', 'Hi.', '', 'DANNY', 'Hi.', '', '@dan|'))).toBeNull();
    // One more letter reaches the longer name.
    expect(ask(text('DAN', 'Hi.', '', 'DANNY', 'Hi.', '', 'DANN|'))).toEqual({
      labels: ['DANNY'],
      replaces: 'DANN',
    });
    // The line being typed is no label for itself, though the parser may read it as a cue.
    expect(ask(text('DANNY', 'Hi.', '', 'DAN|', 'Hello.'))).toEqual({
      labels: ['DANNY'],
      replaces: 'DAN',
    });
    expect(ask(text('# ACT ONE', '', '# ACT|'))).toEqual({ labels: ['ACT ONE'], replaces: 'ACT' });
    // The same goes for every list.
    const places = text(
      'INT. HALL - DAY',
      '',
      'INT. HALL - DAYS',
      '',
      '# ACT ONE',
      '',
      '# ACT ONE B',
      '',
      'CUT TO:',
      '',
      'CUT TO: B',
      '',
    );
    expect(ask(`${places}\nINT. HALL - DAY|`)).toBeNull();
    expect(ask(`${places}\n# ACT ONE|`)).toBeNull();
    expect(ask(`${places}\n>CUT TO:|`)).toBeNull();
  });

  it('drops a name the cue already spells out, so Enter starts the speech', () => {
    const script = (cue: string) => text('MARGARET', 'Hello.', '', cue);
    // Part of a name still offers it...
    expect(ask(script('MAR|'))).toEqual({ labels: ['MARGARET'], replaces: 'MAR' });
    // ...but with the whole name typed, the list would open with MARGARET selected, and Enter
    // would accept it instead of going on to the speech. So a name identical to the text it would
    // replace is not offered, and with nothing left no list opens.
    expect(ask(script('MARGARET|'))).toBeNull();
    expect(ask(script('MARGARET|'), true)).toBeNull();
    // The case doesn't matter: Enter would only change the writer's capitals.
    expect(ask(script('@Margaret|'))).toBeNull();
    // Nor is a longer name that goes on from it, which Enter would reach by lengthening the name.
    const longer = text('MARGARET', 'Hello.', '', 'MARGARET ANN', 'Hi.', '', 'MARGARET|');
    expect(ask(longer)).toBeNull();
    // The cue is a cue to the parser once a speech follows it, and still isn't offered to itself.
    expect(ask(text('MARGARET', 'Hello.', '', 'MARGARET|', 'Again.'))).toBeNull();
    // The same goes for every list.
    const places = text('INT. HALL - DAY', '', '# ACT ONE', '', 'CUT TO:', '');
    expect(ask(`${places}\nINT. HALL|`)).toBeNull();
    expect(ask(`${places}\nINT. HALL - DAY|`)).toBeNull();
    expect(ask(`${places}\n>CUT TO:|`)).toBeNull();
    expect(ask(`${places}\n# ACT ONE|`)).toBeNull();
  });

  it('completes a name that goes on past a space', () => {
    const script = (cue: string) => text('OLD MAN', 'Hello.', '', cue);
    expect(ask(script('OLD |'))).toEqual({ labels: ['OLD MAN'], replaces: 'OLD ' });
    expect(ask(script('OLD M|'))).toEqual({ labels: ['OLD MAN'], replaces: 'OLD M' });
  });

  describe('where a cue line can be', () => {
    it('is after a blank line, or the start of the script', () => {
      const speech = text('MARGARET', 'Hello.', '');
      expect(ask(text('MARGARET', 'Hello.', '', 'MA|'))).not.toBeNull();
      // The first line has no line before it.
      expect(ask(text('MA|', 'Hi.', '', 'MARGARET', 'Hello.'))).toEqual({
        labels: ['MARGARET'],
        replaces: 'MA',
      });
      // A line of spaces or tabs is blank...
      expect(ask(`${speech}\n \t \nMA|`)).not.toBeNull();
      // ...but a line of two spaces is not: it joins the lines around it, as the parser reads it.
      expect(ask(`${speech}\n  \nMA|`)).toBeNull();
      // Shouted dialogue and action in capitals are not cues.
      expect(ask(text('MARGARET', 'MA|'))).toBeNull();
      expect(ask(text('MARGARET', 'Hello.', 'MA|'))).toBeNull();
      expect(ask(text('She waits.', 'MA|'))).toBeNull();
    });

    it('has no lower case, unless it is forced with an @', () => {
      const script = (cue: string) => text('MARGARET', 'Hello.', '', cue);
      expect(ask(script('Ma|'))).toBeNull();
      expect(ask(script('ma|'))).toBeNull();
      expect(ask(script('@Ma|'))).toEqual({ labels: ['MARGARET'], replaces: 'Ma' });
      // Prose in capitals is not offered a name it doesn't begin with.
      expect(ask(script('WHAT A|'))).toBeNull();
    });

    it('is not a scene heading, a transition, or a section', () => {
      // KIM is a name, and nothing after INT., >, or # is offered it, though each of those lines
      // is in capitals on a line after a blank one, as a cue is.
      const script = (line: string) =>
        text(
          ...['INT. KITCHEN - DAY', ''],
          ...['KIM', 'Hello.', ''],
          ...['# KITCHEN SINK', ''],
          line,
        );
      expect(ask(script('INT. KI|'))?.labels).toEqual(['KITCHEN']);
      expect(ask(script('# KI|'))?.labels).toEqual(['KITCHEN SINK']);
      expect(ask(script('>KI|'))).toBeNull();
    });
  });

  it('offers names on a cue right under a section or synopsis', () => {
    // The parser starts a new block at a `#`, `=`, or `===` line, so a cue right under one is a cue
    // with no blank line between. The completion reads such a line as blank too.
    const speech = text('MARGARET', 'Hello.', '');
    for (const above of ['# ACT ONE', '## Act one', '= She arrives.', '===']) {
      const script = text(speech, above, 'MA|', 'Hi.');
      const blocks = parse(script.replace('|', '')).blocks;
      expect(blocks.at(-2)?.kind).toBe('character');
      expect(ask(script)).toEqual({ labels: ['MARGARET'], replaces: 'MA' });
      expect(ask(text(speech, above, '@|'), true)).toEqual({ labels: ['MARGARET'], replaces: '' });
    }
    // Under anything else it is not a cue line: dialogue and action are not blank.
    expect(ask(text(speech, 'She waits.', 'MA|'))).toBeNull();
    expect(ask(text(speech, '#', 'MA|'))).not.toBeNull();
  });

  it('offers names anywhere when asked', () => {
    const script = (line: string) =>
      text('MARGARET', 'Hello.', '', 'BRICK', 'Hi.', '', 'MARGARET', 'Bye.', '', line);
    // In action text, the word before the cursor is completed, in any case, or all names if none.
    expect(ask(script('She sees Mar|'), true)).toEqual({ labels: ['MARGARET'], replaces: 'Mar' });
    expect(ask(script('She sees |'), true)).toEqual({
      labels: ['MARGARET', 'BRICK'],
      replaces: '',
    });
    expect(ask(script('She sees B|'), true)).toEqual({ labels: ['BRICK'], replaces: 'B' });
    // Also inside a speech, on the lines under a cue.
    const speech = text('MARGARET', 'Hello.', '', 'BRICK', 'Tell mar|');
    expect(ask(speech, true)).toEqual({ labels: ['MARGARET'], replaces: 'mar' });
    // The first word of an action line, though a name is not a cue in lower case.
    expect(ask(script('Ma|'), true)).toEqual({ labels: ['MARGARET'], replaces: 'Ma' });
    // Only when asked: typing offers nothing in action.
    expect(ask(script('She sees Mar|'))).toBeNull();
    // Nothing that starts with the word, nothing offered; the word is a name in full, likewise.
    expect(ask(script('She sees Zed|'), true)).toBeNull();
    expect(ask(script('She sees MARGARET|'), true)).toBeNull();
    // A name that needs an @ to be a cue is a name all the same, in the middle of a line.
    const odd = text('@McCLANE', 'Got it.', '', 'Then Mc|');
    expect(ask(odd, true)).toEqual({ labels: ['McCLANE'], replaces: 'Mc' });
    // An apostrophe is part of a word, a space or punctuation is not.
    expect(ask(script('Marge, Mar|'), true)).toEqual({ labels: ['MARGARET'], replaces: 'Mar' });
    // With no word yet, the cast is listed after a space but not after punctuation.
    expect(ask(script('Hello,|'), true)).toBeNull();
    // A very long word costs no more than its length.
    const started = performance.now();
    expect(ask(script(`${'a'.repeat(200_000)}|`), true)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
    // Other lists keep their own lines.
    expect(ask(script('INT. MAR|'), true)).toBeNull();
    expect(ask(script('>MAR|'), true)).toBeNull();
  });

  it('leaves out the names that need an @ unless the cue has one', () => {
    const script = (cue: string) =>
      text('MARGARET', 'Hello.', '', '@McCLANE', 'Got it.', '', '@田中一郎', 'はい。', '', cue);
    // Without an @ the cue would not be a cue: a name with lower case, or with no case at all.
    expect(ask(script('MC|'))).toBeNull();
    expect(ask(script('田中|'))).toBeNull();
    expect(ask(script('|'), true)).toEqual({ labels: ['MARGARET'], replaces: '' });
    // With one, any name will do.
    expect(ask(script('@MC|'))).toEqual({ labels: ['McCLANE'], replaces: 'MC' });
    expect(ask(script('@田中|'))).toEqual({ labels: ['田中一郎'], replaces: '田中' });
    expect(ask(script('@|'), true)).toEqual({
      labels: ['田中一郎', 'McCLANE', 'MARGARET'],
      replaces: '',
    });
  });
});

describe('extensions', () => {
  const dubbed = text(
    ...['BRICK (V.O.)', 'Hello.', ''],
    ...['HANS (V.O.) (SUBTITLED)', 'Hallo.', ''],
    ...['JOAN (on the radio)', 'Hello.', ''],
  );
  const script = (cue: string) => `${dubbed}\n${cue}`;
  const all = ['(V.O.)', '(SUBTITLED)', '(on the radio)', '(O.S.)'];

  it('offers extensions after a name and a space', () => {
    // The ones the script uses come first, the more used first, each of a group of extensions on
    // its own, and then (V.O.) and (O.S.) if the script doesn't use them.
    expect(ask(script('MARGARET |'), true)).toEqual({ labels: all, replaces: '' });
    expect(ask(script('@MARGARET |'), true)).toEqual({ labels: all, replaces: '' });
    // Typing the space is not asking.
    expect(ask(script('MARGARET |'))).toBeNull();
  });

  it('completes an extension from its parenthesis, in any case', () => {
    expect(ask(script('MARGARET (V|'))).toEqual({ labels: ['(V.O.)'], replaces: '(V' });
    expect(ask(script('MARGARET (o|'))).toEqual({
      labels: ['(on the radio)', '(O.S.)'],
      replaces: '(o',
    });
    // The parenthesis alone is one character, and the name's case is the only case that counts.
    expect(ask(script('MARGARET (|'))).toBeNull();
    expect(ask(script('MARGARET (|'), true)).toEqual({ labels: all, replaces: '(' });
    // A second extension, after the first.
    expect(ask(script('MARGARET (V.O.) (SU|'))).toEqual({
      labels: ['(SUBTITLED)'],
      replaces: '(SU',
    });
    // Nothing to complete once an extension is closed, or where no name comes before it.
    expect(ask(script('MARGARET (V.O.)|'), true)).toBeNull();
    expect(ask(script('(V|'), true)).toBeNull();
  });

  it('offers extensions only where no name goes on', () => {
    const named = text('OLD MAN', 'Hello.', '', 'OLD MAN |');
    expect(ask(named, true)).toEqual({ labels: ['(V.O.)', '(O.S.)'], replaces: '' });
    expect(ask(named)).toBeNull();
    // Where one does, it is the name that is offered.
    expect(ask(text('OLD MAN', 'Hello.', '', 'OLD |'), true)?.labels).toEqual(['OLD MAN']);
  });
});

describe('scene headings', () => {
  const places = text(
    ...['INT. HALL - NIGHT', ''],
    ...['INT. KITCHEN - DUSK', ''],
    ...['EXT. YARD - NIGHT', ''],
    ...['INT. HALL - DAY', ''],
    ...['EXT. YARD - DAY #12#', ''],
    ...['INT. HALL \u2013 NIGHT', ''],
  );
  const script = (line: string) => `${places}\n${line}`;

  it('offers locations after INT.', () => {
    // Most used first; the ones used as often stay in the order they were first used.
    const used = ['HALL', 'YARD', 'KITCHEN'];
    expect(ask(script('INT. |'), true)).toEqual({ labels: used, replaces: '' });
    expect(ask(script('EXT. |'), true)).toEqual({ labels: used, replaces: '' });
    expect(ask(script('INT./EXT. |'), true)).toEqual({ labels: used, replaces: '' });
    expect(ask(script('I/E   |'), true)).toEqual({ labels: used, replaces: '' });
    expect(ask(script('int. |'), true)).toEqual({ labels: used, replaces: '' });
    // Asking is the only way to a list before something is typed.
    expect(ask(script('INT. |'))).toBeNull();
    expect(ask(script('INT. K|'))).toBeNull();
    expect(ask(script('INT. KI|'))).toEqual({ labels: ['KITCHEN'], replaces: 'KI' });
    expect(ask(script('INT. K|'), true)).toEqual({ labels: ['KITCHEN'], replaces: 'K' });
    // The prefix has to be a word of its own, and be followed by a space.
    expect(ask(script('INT.HA|'))).toBeNull();
    expect(ask(script('INTERIOR HA|'))).toBeNull();
    expect(ask(script('EXTRAS HA|'))).toBeNull();
  });

  it('offers times after the dash', () => {
    // The times the script uses, the more used first, and then the stock ones it doesn't use.
    const times = ['NIGHT', 'DAY', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'];
    expect(ask(script('INT. HALL - |'), true)).toEqual({ labels: times, replaces: '' });
    expect(ask(script('INT. HALL - |'))).toBeNull();
    expect(ask(script('INT. HALL - DU|'))).toEqual({ labels: ['DUSK'], replaces: 'DU' });
    expect(ask(script('INT. HALL - mo|'))).toEqual({ labels: ['MOMENTS LATER'], replaces: 'mo' });
    // The last dash counts, a dash can be an en dash, and spaces after it are not replaced.
    expect(ask(script('INT. A - B - NI|'))).toEqual({ labels: ['NIGHT'], replaces: 'NI' });
    expect(ask(script('INT. HALL \u2013 NI|'))).toEqual({ labels: ['NIGHT'], replaces: 'NI' });
    expect(ask(script('INT. HALL -   NI|'))).toEqual({ labels: ['NIGHT'], replaces: 'NI' });
    // A hyphen with no spaces around it is part of the location.
    expect(ask(script('INT. HALL-NI|'))).toBeNull();
  });
});

describe('transitions', () => {
  const script = (line: string) =>
    text(
      ...['CUT TO:', ''],
      ...['>FADE OUT.', ''],
      ...['> BURN TO WHITE', ''],
      ...['CUT TO:', ''],
      ...['> THE END <', ''],
      line,
    );

  it('offers transitions on a > line', () => {
    // The script's own, the more used first (a centered line is not a transition), then the
    // stock ones it doesn't use.
    const all = ['CUT TO:', 'FADE OUT.', 'BURN TO WHITE', 'DISSOLVE TO:', 'SMASH CUT TO:'];
    expect(ask(script('>|'), true)).toEqual({ labels: all, replaces: '' });
    expect(ask(script('>|'))).toBeNull();
    expect(ask(script('>SM|'))).toEqual({ labels: ['SMASH CUT TO:'], replaces: 'SM' });
    // A space after the > is kept, and so is leading space.
    expect(ask(script('> di|'))).toEqual({ labels: ['DISSOLVE TO:'], replaces: 'di' });
    expect(ask(script('  >   FA|'))).toEqual({ labels: ['FADE OUT.'], replaces: 'FA' });
    // Only a line that starts with a >.
    expect(ask(script('FADE OU|'))).toBeNull();
  });

  it('takes the > off for a transition that ends in TO:, which needs none', () => {
    // The element bar's Transition writes a > on an empty line and opens this list.
    const accept = (marked: string, label: string) => {
      const { state, pos } = at(marked);
      const result = fountainCompletionSource(new CompletionContext(state, pos, true));
      const option = result?.options.find((o) => o.label === label);
      if (!result || !option) throw new Error(`no ${label}`);
      let next = state;
      const view = { state, dispatch: (spec: object) => (next = state.update(spec).state) };
      if (typeof option.apply === 'function') {
        option.apply(view as unknown as EditorView, option, result.from, pos);
      } else {
        next = state.update({ changes: { from: result.from, to: pos, insert: label } }).state;
      }
      return next.doc.line(next.doc.lines).text;
    };
    expect(accept(script('>|'), 'CUT TO:')).toBe('CUT TO:');
    expect(accept(script('> sm|'), 'SMASH CUT TO:')).toBe('SMASH CUT TO:');
    expect(accept(script('>|'), 'FADE OUT.')).toBe('>FADE OUT.');
  });
});

describe('sections', () => {
  const script = (line: string) =>
    text(
      ...['# ACT ONE', ''],
      ...['## THE CALL', ''],
      ...['She waits.', '# ACT TWO', ''],
      ...['# ACT ONE', ''],
      line,
    );

  it('offers section titles after #', () => {
    // Each once, in the order of the script, whatever the depth.
    const titles = ['ACT ONE', 'THE CALL', 'ACT TWO'];
    expect(ask(script('#|'), true)).toEqual({ labels: titles, replaces: '' });
    expect(ask(script('##   |'), true)).toEqual({ labels: titles, replaces: '' });
    expect(ask(script('#|'))).toBeNull();
    expect(ask(script('## ac|'))).toEqual({ labels: ['ACT ONE', 'ACT TWO'], replaces: 'ac' });
    expect(ask(script('#TH|'))).toEqual({ labels: ['THE CALL'], replaces: 'TH' });
    // A section needs no blank line before it, and no title is offered inside a line.
    expect(ask(text('She waits.', '# TH|', '', '# THE CALL'))?.labels).toEqual(['THE CALL']);
    expect(ask(script('INT. HALL #A|'), true)).toBeNull();
  });
});

describe('the list the source gives', () => {
  it('has a plain label for each option, and marks the typed start of each', () => {
    const { state, pos } = at(text('MARGARET', 'Hi.', '', 'MARK', 'Ho.', '', 'MA|'));
    const result = fountainCompletionSource(new CompletionContext(state, pos, false));
    if (!result) throw new Error('expected a completion');
    expect(result.options).toEqual([{ label: 'MARK' }, { label: 'MARGARET' }]);
    // The source does its own matching, so the list is as it ranks it, and the matched start of
    // each label is marked for the popup to show.
    expect(result.filter).toBe(false);
    expect(result.options.map((option) => result.getMatch?.(option))).toEqual([
      [0, 2],
      [0, 2],
    ]);
  });
});

describe('in a view', () => {
  // The completion extension itself, with CodeMirror's own popup logic, in jsdom, which has no
  // layout and so draws nothing that can be seen. The state it keeps is what is read here.
  const views: EditorView[] = [];

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.parentElement?.remove();
      view.destroy();
    }
  });

  /** A view of `doc` with the completion and the cursor at the end. */
  function mount(doc: string) {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [fountainCompletion()],
    });
    const view = new EditorView({ state, parent });
    views.push(view);
    return view;
  }

  /** Types at the cursor as a writer does, which asks for completions after a short wait. */
  function type(view: EditorView, typed: string) {
    const at = view.state.selection.main.head;
    view.dispatch({
      changes: { from: at, insert: typed },
      selection: { anchor: at + typed.length },
      userEvent: 'input.type',
    });
  }

  /** Waits for the completion to answer the last thing typed. */
  const answered = (view: EditorView) =>
    vi.waitFor(
      () => {
        if (completionStatus(view.state) === 'pending') throw new Error('still pending');
      },
      { timeout: 3000 },
    );

  const labels = (view: EditorView) => currentCompletions(view.state).map((c) => c.label);

  it('opens a list when two letters are typed, and Enter takes the selected name', async () => {
    const view = mount(text('MARGARET', 'Hi.', '', ''));
    type(view, 'M');
    await answered(view);
    expect(completionStatus(view.state)).toBeNull();
    type(view, 'A');
    await answered(view);
    expect(labels(view)).toEqual(['MARGARET']);
    // Enter does nothing for a moment after a list opens, so that a key already on its way
    // doesn't pick from it.
    await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true), { timeout: 3000 });
    expect(view.state.doc.line(4).text).toBe('MARGARET');
  });

  it('leaves Enter to the editor once the name is typed in full', async () => {
    const view = mount(text('MARGARET', 'Hi.', '', ''));
    type(view, 'MARGARE');
    await answered(view);
    expect(labels(view)).toEqual(['MARGARET']);
    // The last letter: the list is still up for an instant, and Enter is not taken by it...
    type(view, 'T');
    expect(acceptCompletion(view)).toBe(false);
    // ...and then the list goes, because the name is all there is to offer.
    await answered(view);
    expect(completionStatus(view.state)).toBeNull();
    expect(acceptCompletion(view)).toBe(false);
    expect(view.state.doc.line(4).text).toBe('MARGARET');
  });
});

describe('hostile scripts', () => {
  const rows = (count: number, row: (i: number) => string) =>
    Array.from({ length: count }, (_, i) => row(i)).join('\n');

  // Each is a script that would slow careless code down, with the cursor at the `|`, asked for
  // explicitly so that nothing is skipped for being too short. The state is built before the clock
  // starts, so the parse at creation isn't timed; the source is, and with it the parser's lazy
  // reading of the blocks, which every keystroke pays for again.
  const scripts: Array<[label: string, marked: string, offers: boolean]> = [
    ['a hundred thousand different names', `${rows(100_000, (i) => `NAME ${i}\nHi.\n`)}\n@|`, true],
    [
      'a hundred thousand different places',
      `${rows(100_000, (i) => `INT. PLACE ${i} - DAY\n`)}\nINT. |`,
      true,
    ],
    [
      'a hundred thousand different times',
      `${rows(100_000, (i) => `INT. A - TIME ${i}\n`)}\nINT. A - |`,
      true,
    ],
    [
      'a hundred thousand different transitions',
      `${rows(100_000, (i) => `>MOVE ${i}\n`)}\n>|`,
      true,
    ],
    ['a hundred thousand different sections', `${rows(100_000, (i) => `# PART ${i}\n`)}\n#|`, true],
    [
      'a hundred thousand different extensions',
      `${rows(100_000, (i) => `NAME (EXT ${i})\nHi.\n`)}\nNAME (|`,
      true,
    ],
    ['a cue line of a million capitals', `MARGARET\nHi.\n\n${'A'.repeat(1_000_000)}|`, false],
    ['a million open parentheses', `MARGARET\nHi.\n\nMARGARET ${'('.repeat(1_000_000)}|`, true],
    ['a million spaces after a prefix', `INT. HALL - DAY\n\nINT.${' '.repeat(1_000_000)}|`, true],
    ['a heading of three hundred thousand dashes', `INT. A${' - A'.repeat(300_000)} - |`, true],
    ['a million hashes', `# ACT ONE\n\n${'#'.repeat(1_000_000)}|`, true],
    ['a million spaces on the line before', `MARGARET\nHi.\n\n${' '.repeat(1_000_000)}\nMA|`, true],
  ];

  for (const [label, marked, offers] of scripts) {
    it(`answers ${label} in under a second`, () => {
      const { state, pos } = at(marked);
      const start = performance.now();
      const result = fountainCompletionSource(new CompletionContext(state, pos, true));
      expect(performance.now() - start).toBeLessThan(1000);
      expect(result !== null).toBe(offers);
    }, 60_000);
  }

  it('answers a hundred keystrokes in a script of 100 KB in under a second', () => {
    const script = rows(4_000, (i) => `NAME ${i % 200}\nHello, **you**.\n`);
    let state = stateOf(`${script}\nNA`);
    expect(state.doc.length).toBeGreaterThan(100_000);
    let spent = 0;
    for (let i = 0; i < 100; i++) {
      // A change anywhere parses the script again (the parse is timed in the other tests), and
      // the source then reads blocks that have not been read before.
      state = state.update({ changes: { from: 0, insert: ' ' } }).state;
      const start = performance.now();
      const result = fountainCompletionSource(
        new CompletionContext(state, state.doc.length, false),
      );
      spent += performance.now() - start;
      expect(result?.options).toHaveLength(200);
    }
    expect(spent).toBeLessThan(1000);
  }, 60_000);
});
