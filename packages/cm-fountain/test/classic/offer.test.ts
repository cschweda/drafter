import {
  CompletionContext,
  completionStatus,
  currentCompletions,
  selectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState, type Extension, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { fountainCompletion, fountainCompletionSource, parsedDoc } from '@drafter/cm-fountain';
import { parse } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, test } from 'vitest';
import { classicLine, elementAt } from '../../src/classic/line';
import { acceptOffer, classicSource, offerAt, placesRecent } from '../../src/classic/offer';
import { classicEditor, keys, type } from './harness';

// jsdom has no layout, and CodeMirror measures.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

const PLAY = builtins['stage-play-standard'] as Template;

/** Signal Hill's opening, more or less: KITCHEN is the most used place, and DINER the most recent. */
const SCRIPT = [
  'INT. KITCHEN - DAY',
  '',
  'Rain on the glass.',
  '',
  'JUNE',
  'You stayed.',
  '',
  'DALE',
  'Somebody had to.',
  '',
  'EXT. YARD - NIGHT',
  '',
  'JUNE',
  'Come in.',
  '',
  'CUT TO:',
  '',
  'INT. KITCHEN - NIGHT',
  '',
  'INT. DINER - DAY',
  '',
  'Steam.',
  '',
  '',
].join('\n');

/** The script's end on Character, chosen with Tab. */
const onCharacter = (more: string[] = []) => keys(classicEditor(`${SCRIPT}|`), 'Tab', ...more);

/** The script's end on Transition. */
const onTransition = (more: string[] = []) =>
  keys(classicEditor(`${SCRIPT}|`), 'Tab', 'Tab', ...more);

/** The script's end on a chosen Scene heading. */
const onHeading = (more: string[] = []) =>
  keys(classicEditor(`${SCRIPT}|`), 'Tab', 'Tab', 'Tab', ...more);

function offered(state: EditorState, explicit = false) {
  const offer = offerAt(state, state.selection.main.head, explicit);
  return offer ? offer.options.map((option) => option.label) : null;
}

describe('what is offered', () => {
  test('a chosen Scene heading offers its prefixes, in order, from the first letter', () => {
    expect(offered(onHeading(['I']))).toEqual(['INT.', 'INT./EXT.', 'I/E']);
    expect(offered(onHeading(['E']))).toEqual(['EXT.', 'EST.']);
  });

  test('asked for on an empty chosen Scene heading, every prefix', () => {
    expect(offered(onHeading(), true)).toEqual(['INT.', 'EXT.', 'INT./EXT.', 'EST.', 'I/E']);
  });

  test('soft Action reaches places by the shape, and gets no prefix list', () => {
    const start = classicEditor(`${SCRIPT}|`);
    expect(offered(type(start, 'I'))).toBeNull();
    expect(offered(type(start, 'INT. K'))).toEqual(['KITCHEN']);
  });

  test('places are most recent above the cursor first, in Classic Mode only', () => {
    expect(offered(type(classicEditor(`${SCRIPT}|`), 'INT. '), true)).toEqual([
      'DINER',
      'KITCHEN',
      'YARD',
    ]);
    const plain = EditorState.create({ doc: `${SCRIPT}INT. `, extensions: [parsedDoc] });
    const result = fountainCompletionSource(new CompletionContext(plain, plain.doc.length, true));
    expect(result?.options.map((option) => option.label)).toEqual(['KITCHEN', 'YARD', 'DINER']);
  });

  test('placesRecent ranks by the last use above the line, then by use', () => {
    const doc = parse(SCRIPT);
    expect(placesRecent(doc, SCRIPT.indexOf('EXT. YARD'))).toEqual(['KITCHEN', 'YARD', 'DINER']);
    expect(placesRecent(doc, SCRIPT.length)).toEqual(['DINER', 'KITCHEN', 'YARD']);
  });

  test('a time after a typed dash, from its first letter', () => {
    const state = type(classicEditor(`${SCRIPT}|`), 'INT. GARAGE - N');
    expect(offered(state)).toEqual(['NIGHT']);
    expect(offered(type(state, 'IGHT'))).toBeNull();
  });

  test('times are the script’s, most used first, then the rest', () => {
    const state = type(classicEditor(`${SCRIPT}|`), 'INT. KITCHEN');
    expect(offered(state, true)).toEqual(['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER']);
    const offer = offerAt(state, state.selection.main.head, true);
    expect(offer?.from).toBe(state.selection.main.head);
  });

  test('names are the most recent above the cursor first', () => {
    expect(offered(onCharacter(['D']))).toEqual(['DALE']);
    expect(offered(onCharacter(), true)).toEqual(['JUNE', 'DALE']);
  });

  test('lower-case names are offered', () => {
    const state = keys(classicEditor('@McGRAW\nLook.\n\n李明\nNo.\n\nNext.\n\n|'), 'Tab', 'M');
    expect(offered(state)).toEqual(['McGRAW']);
    const cast = keys(classicEditor('@李明\nNo.\n\nNext.\n\n|'), 'Tab');
    expect(offered(type(cast, '李'))).toEqual(['李明']);
  });

  test('the line being typed is never offered', () => {
    // Were `JU` itself a name, the text typed would be a label, and nothing would be offered.
    const state = classicEditor(`${SCRIPT}JU|\nOne line.`);
    expect(offered(state)).toEqual(['JUNE']);
  });

  test('(CONT’D) isn’t offered', () => {
    const script = `JUNE (CONT'D)\nOne.\n\nDALE (CONT’D)\nTwo.\n\nDALE (ON RADIO)\nThree.\n\nGo.\n\n|`;
    const state = keys(classicEditor(script), 'Tab', 'DALE (');
    expect(offered(state)).toEqual(['(ON RADIO)', '(V.O.)', '(O.S.)']);
  });

  test('a space after a name offers extensions, and so does (', () => {
    expect(offered(onCharacter(['JUNE ']))).toEqual(['(V.O.)', '(O.S.)']);
    expect(offered(onCharacter(['JUNE (']))).toEqual(['(V.O.)', '(O.S.)']);
    expect(offered(onCharacter(['JUNE (V.O.)']))).toBeNull();
  });

  test('a transition offers the script’s, then the rest', () => {
    expect(offered(onTransition(['C']))).toEqual(['CUT TO:']);
    expect(offered(onTransition(), true)).toEqual([
      'CUT TO:',
      'DISSOLVE TO:',
      'SMASH CUT TO:',
      'FADE OUT.',
    ]);
  });

  test('a play’s Scene offers the section titles in use, in script order', () => {
    const script = '# ACT ONE\n\n## The Shore\n\nWaves.\n\n## The Boat\n\nOars.\n\n|';
    // Stage direction, Character, Act, Scene.
    const state = keys(classicEditor(script, { template: PLAY }), 'Tab', 'Tab', 'Tab', 'T');
    expect(elementAt(state)?.kind).toBe('scene_heading');
    expect(offered(state)).toEqual(['The Shore', 'The Boat']);
  });

  test('it opens at the first letter', () => {
    expect(offered(onCharacter(['J']))).toEqual(['JUNE']);
  });

  test('it doesn’t open on an empty line', () => {
    expect(offered(onCharacter())).toBeNull();
    expect(offered(onHeading())).toBeNull();
  });

  test('Ctrl+Space opens it anywhere: the cast, for the word before the cursor', () => {
    expect(offered(classicEditor(`${SCRIPT}She looks at J|`), true)).toEqual(['JUNE']);
    expect(offered(classicEditor(`${SCRIPT}She looks at J|`))).toBeNull();
  });

  test('a setup’s label is offered as it is in Fountain Mode', () => {
    const script = 'A note. [[Setup: the gun]]\n\nLater. [[Payoff: th|';
    expect(offered(classicEditor(script))).toEqual(['the gun']);
  });

  test('nothing is offered in the middle of a line, or on Action or Dialogue as typed', () => {
    const typed = onCharacter(['JUDE']);
    const back = typed.update({ selection: { anchor: typed.doc.length - 2 } }).state;
    expect(offered(back)).toBeNull();
    expect(offered(type(classicEditor(`${SCRIPT}|`), 'JU'))).toBeNull();
    expect(offered(classicEditor('JUNE\nJu|'))).toBeNull();
  });

  test('a selection, a note, and the title page offer nothing', () => {
    expect(offered(classicEditor(`${SCRIPT}[JU]`))).toBeNull();
    expect(offered(classicEditor(`${SCRIPT}[[JU|]]`), true)).toBeNull();
    expect(offered(classicEditor('Title: Signal Hill|\n\nJUNE\nHi.'), true)).toBeNull();
  });
});

describe('the source', () => {
  test('is offerAt, with no filter and the matched start', () => {
    const state = onCharacter(['JU']);
    const context = new CompletionContext(state, state.selection.main.head, false);
    const result = classicSource(context);
    expect(result?.filter).toBe(false);
    expect(result?.options.map((option) => option.label)).toEqual(['JUNE']);
    expect(result?.getMatch?.({ label: 'JUNE' })).toEqual([0, 2]);
  });

  test('Fountain Mode’s source is untouched', () => {
    const state = EditorState.create({
      doc: `${SCRIPT}JU`,
      extensions: [parsedDoc],
    });
    const head = state.doc.length;
    const result = fountainCompletionSource(new CompletionContext(state, head, false));
    expect(result?.options).toEqual([{ label: 'JUNE' }]);
    expect(fountainCompletionSource(new CompletionContext(state, head - 1, false))).toBeNull();
  });
});

// In a real editor, with every extension the app has and the keys going through the keymap.
const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

interface Live {
  view: EditorView;
  /** Every transaction with a change in it, since the last `press`. */
  changes: number;
  said: string[];
}

function live(state: EditorState, said: string[] = []): Live {
  const held: Live = { view: null as unknown as EditorView, changes: 0, said };
  const view = new EditorView({
    state,
    parent: document.body,
    dispatchTransactions(transactions, target) {
      held.changes += transactions.filter((tr) => tr.docChanged).length;
      target.update(transactions);
    },
  });
  held.view = view;
  views.push(view);
  return held;
}

const READ_ONLY = EditorState.readOnly.of(true);

const IN_EDITOR: Extension[] = [fountainCompletion(), history()];

/** A live editor at the end of `SCRIPT`, after the steps, with the completion and the history. */
function liveAt(steps: string[], marked = `${SCRIPT}|`, said: string[] = []) {
  return live(
    keys(classicEditor(marked, { with: IN_EDITOR, say: (t) => said.push(t) }), ...steps),
    said,
  );
}

const codes: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40 };

function press(held: Live, key: string): boolean {
  held.changes = 0;
  const event = new KeyboardEvent('keydown', { key, keyCode: codes[key] ?? 0 });
  return runScopeHandlers(held.view, event, 'editor');
}

/** Letters as the writer's: each its own transaction, marks and capitals included. */
function typeIn({ view }: Live, text: string) {
  for (const letter of text) {
    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: letter },
      selection: { anchor: head + letter.length },
      userEvent: 'input.type',
    });
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Until a list is drawn, past CodeMirror's typing delay. */
async function listOpens({ view }: Live) {
  for (let i = 0; i < 40 && !currentCompletions(view.state).length; i++) await wait(10);
  expect(currentCompletions(view.state).length).toBeGreaterThan(0);
}

const textOf = ({ view }: Live) => view.state.doc.toString();
const tail = (held: Live) => textOf(held).slice(SCRIPT.length);
const cursor = ({ view }: Live) => view.state.selection.main.head;

/** Where the end of the text is, so a test can say the cursor sits there. */
const atEnd = (held: Live) => cursor(held) === held.view.state.doc.length;

describe.each(['Tab', 'Enter'])('%s accepts', (key) => {
  test(`JU and ${key} gives JUNE and Dialogue, with no list drawn`, () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'ju');
    expect(tail(held)).toBe('JU');
    expect(currentCompletions(held.view.state)).toEqual([]);
    expect(press(held, key)).toBe(true);
    expect(tail(held)).toBe('JUNE\n');
    expect(atEnd(held)).toBe(true);
    expect(elementAt(held.view.state)?.kind).toBe('dialogue');
    expect(held.changes).toBe(1);
    undo(held.view);
    expect(tail(held)).toBe('JU');
    expect(elementAt(held.view.state)?.kind).toBe('character');
  });

  test(`${key} in the 75 ms after a list opens`, async () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'JU');
    await listOpens(held);
    expect(press(held, key)).toBe(true);
    expect(tail(held)).toBe('JUNE\n');
    expect(held.changes).toBe(1);
  });

  test(`${key} with a list drawn, the highlighted one`, async () => {
    const held = liveAt(['Tab']);
    startCompletion(held.view);
    await listOpens(held);
    await wait(80);
    expect(press(held, 'ArrowDown')).toBe(true);
    expect(selectedCompletion(held.view.state)?.label).toBe('DALE');
    expect(press(held, key)).toBe(true);
    expect(tail(held)).toBe('DALE\n');
    expect(completionStatus(held.view.state)).toBeNull();
    expect(held.changes).toBe(1);
    undo(held.view);
    expect(tail(held)).toBe('');
  });

  test(`a name with no match goes on to Dialogue with ${key}`, () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'ZED');
    press(held, key);
    expect(tail(held)).toBe('ZED\n');
    expect(elementAt(held.view.state)?.kind).toBe('dialogue');
  });

  test(`JO after Escape stays JO with ${key}, as far as it goes`, () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'JU');
    press(held, 'Escape');
    press(held, key);
    expect(tail(held)).toBe('JU\n');
    expect(elementAt(held.view.state)?.kind).toBe('dialogue');
  });

  test(`a full label goes on with ${key}`, () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'JUNE');
    press(held, key);
    expect(tail(held)).toBe('JUNE\n');
    expect(held.changes).toBe(1);
  });

  test(`a name with lower case carries its hidden @, with ${key}`, () => {
    const script = '@McGRAW\nLook.\n\nGo.\n\n|';
    const held = liveAt(['Tab'], script);
    typeIn(held, 'mc');
    expect(textOf(held)).toBe('@McGRAW\nLook.\n\nGo.\n\nMC');
    press(held, key);
    expect(textOf(held)).toBe('@McGRAW\nLook.\n\nGo.\n\n@McGRAW\n');
    expect(held.changes).toBe(1);
    expect(parse(`${textOf(held)}Hi.`).blocks.filter((b) => b.kind === 'character')).toHaveLength(
      2,
    );
  });

  test(`a mark the letters needed comes off once the name doesn’t need it, with ${key}`, () => {
    const held = liveAt(['Tab'], '2B\nHi.\n\nGo.\n\n|');
    typeIn(held, '2');
    expect(textOf(held).endsWith('\n\n@2')).toBe(true);
    press(held, key);
    expect(textOf(held).endsWith('\n\n2B\n')).toBe(true);
  });

  test(`a name with a speech goes into it, with ${key}`, () => {
    const script = 'JUNE\nHi.\n\nGo.\n\n|\nStill here.';
    const held = liveAt(['Tab'], script);
    typeIn(held, 'JU');
    press(held, key);
    expect(textOf(held)).toBe('JUNE\nHi.\n\nGo.\n\nJUNE\nStill here.');
    expect(atEnd(held)).toBe(true);
    expect(held.changes).toBe(1);
  });
});

test('the next letter offers again', () => {
  const held = liveAt(['Tab']);
  typeIn(held, 'J');
  press(held, 'Escape');
  expect(offerAt(held.view.state, cursor(held), false)).toBeNull();
  typeIn(held, 'U');
  expect(offerAt(held.view.state, cursor(held), false)?.options[0]?.label).toBe('JUNE');
});

test('a line with no stored element can be dismissed too', () => {
  const held = liveAt([], 'JUNE\nHi.\n\nDALE\nHey.\n\nJU|\nAgain.');
  expect(held.view.state.field(classicLine)).toBeNull();
  press(held, 'Escape');
  expect(offerAt(held.view.state, cursor(held), false)).toBeNull();
});

test('asking again after Escape is asking', () => {
  const held = liveAt(['Tab']);
  typeIn(held, 'JU');
  press(held, 'Escape');
  expect(offerAt(held.view.state, cursor(held), true)?.options[0]?.label).toBe('JUNE');
});

test('Escape closes a list, and the key after it goes on with what’s typed', async () => {
  const held = liveAt(['Tab']);
  typeIn(held, 'JU');
  await listOpens(held);
  expect(press(held, 'Escape')).toBe(true);
  expect(completionStatus(held.view.state)).toBeNull();
  expect(textOf(held).endsWith('JU')).toBe(true);
  press(held, 'Tab');
  expect(tail(held)).toBe('JU\n');
});

describe('a heading', () => {
  test('accepting a place writes it and offers times', async () => {
    const held = liveAt(['INT. KI']);
    press(held, 'Tab');
    expect(tail(held)).toBe('INT. KITCHEN');
    expect(atEnd(held)).toBe(true);
    await listOpens(held);
    expect(currentCompletions(held.view.state).map((option) => option.label)).toEqual([
      'DAY',
      'NIGHT',
      'CONTINUOUS',
      'LATER',
      'MOMENTS LATER',
    ]);
  });

  test('accepting a time writes  - NIGHT and goes to Action', async () => {
    const held = liveAt(['INT. KI']);
    press(held, 'Enter');
    await listOpens(held);
    await wait(80);
    press(held, 'ArrowDown');
    expect(selectedCompletion(held.view.state)?.label).toBe('NIGHT');
    press(held, 'Enter');
    expect(tail(held)).toBe('INT. KITCHEN - NIGHT\n\n');
    expect(atEnd(held)).toBe(true);
    expect(elementAt(held.view.state)?.kind).toBe('action');
    expect(held.changes).toBe(1);
    undo(held.view);
    expect(tail(held)).toBe('INT. KITCHEN');
  });

  test('Escape leaves INT. KITCHEN with no dash', async () => {
    const held = liveAt(['INT. KI']);
    press(held, 'Tab');
    await listOpens(held);
    press(held, 'Escape');
    expect(tail(held)).toBe('INT. KITCHEN');
    press(held, 'Enter');
    expect(tail(held)).toBe('INT. KITCHEN\n\n');
    expect(elementAt(held.view.state)?.kind).toBe('action');
  });

  test('a typed  - works as today', () => {
    const held = liveAt(['INT. KITCHEN - ni']);
    expect(tail(held)).toBe('INT. KITCHEN - NI');
    press(held, 'Tab');
    expect(tail(held)).toBe('INT. KITCHEN - NIGHT\n\n');
  });

  test('accepting a prefix writes INT.  and offers places', async () => {
    const held = liveAt(['Tab', 'Tab', 'Tab']);
    typeIn(held, 'in');
    press(held, 'Tab');
    expect(tail(held).replace(/^\./, '')).toBe('INT. ');
    expect(atEnd(held)).toBe(true);
    await listOpens(held);
    expect(currentCompletions(held.view.state).map((option) => option.label)).toEqual([
      'DINER',
      'KITCHEN',
      'YARD',
    ]);
    press(held, 'Tab');
    expect(tail(held)).toBe('INT. DINER');
    expect(parse(textOf(held)).blocks.at(-1)?.kind).toBe('scene_heading');
  });
});

describe('after the name', () => {
  test('a transition goes to Action, an extension stays', () => {
    const transition = liveAt(['Tab', 'Tab']);
    typeIn(transition, 'cu');
    expect(tail(transition)).toBe('>CU');
    press(transition, 'Tab');
    expect(tail(transition)).toBe('CUT TO:\n\n');
    expect(elementAt(transition.view.state)?.kind).toBe('action');

    const extension = liveAt(['Tab']);
    typeIn(extension, 'JUNE (v');
    press(extension, 'Enter');
    expect(tail(extension)).toBe('JUNE (V.O.)');
    expect(atEnd(extension)).toBe(true);
    expect(elementAt(extension.view.state)?.kind).toBe('character');
    press(extension, 'Enter');
    expect(tail(extension)).toBe('JUNE (V.O.)\n');
  });

  test('a transition with no TO: keeps its mark', () => {
    const held = liveAt(['Tab', 'Tab']);
    typeIn(held, 'fa');
    press(held, 'Enter');
    expect(tail(held)).toBe('>FADE OUT.\n\n');
  });

  test('a click on an option does what the key does', async () => {
    const held = liveAt(['Tab']);
    typeIn(held, 'JU');
    await listOpens(held);
    await wait(80);
    const [option] = currentCompletions(held.view.state);
    const offer = offerAt(held.view.state, cursor(held), false);
    const apply = option?.apply as (v: EditorView, c: unknown, f: number, t: number) => void;
    apply(held.view, option, offer?.from as number, cursor(held));
    expect(tail(held)).toBe('JUNE\n');
    expect(elementAt(held.view.state)?.kind).toBe('dialogue');
  });

  test('a read-only editor accepts nothing', () => {
    const state = onCharacter(['JU']);
    const held = live(state.update({ effects: StateEffect.appendConfig.of(READ_ONLY) }).state);
    expect(acceptOffer(held.view)).toBe(false);
  });

  test('nothing to accept is false', () => {
    expect(acceptOffer(liveAt([]).view)).toBe(false);
  });
});

describe('the list', () => {
  test('a name that breaks a list shows as text', async () => {
    const name = '<img src=x onerror=alert(1)>';
    const held = liveAt(['Tab'], `@${name}\nHi.\n\nGo.\n\n|`);
    startCompletion(held.view);
    await listOpens(held);
    await wait(30);
    const list = document.querySelector('.cm-tooltip-autocomplete');
    expect(list?.textContent).toContain(name);
    expect(list?.querySelector('img')).toBeNull();
  });
});

describe('a screen reader', () => {
  test('hears the list open, and the highlight as it moves', async () => {
    const said: string[] = [];
    const held = liveAt(['Tab'], `${SCRIPT}|`, said);
    startCompletion(held.view);
    await listOpens(held);
    expect(said).toEqual(['2 suggestions: JUNE']);
    await wait(80);
    press(held, 'ArrowDown');
    expect(said).toEqual(['2 suggestions: JUNE', 'DALE']);
  });

  test('hears one suggestion as one', async () => {
    const said: string[] = [];
    const held = liveAt(['Tab'], `${SCRIPT}|`, said);
    typeIn(held, 'JU');
    await listOpens(held);
    expect(said).toEqual(['1 suggestion: JUNE']);
  });

  test('hears what accepting did, in the element’s words', () => {
    const said: string[] = [];
    const held = liveAt(['Tab'], `${SCRIPT}|`, said);
    typeIn(held, 'JU');
    press(held, 'Tab');
    expect(said).toEqual(['JUNE. Dialogue.']);
  });

  test('hears a time go to Action, and a place stay', () => {
    const said: string[] = [];
    const held = liveAt(['INT. KITCHEN - ni'], `${SCRIPT}|`, said);
    press(held, 'Tab');
    expect(said).toEqual(['NIGHT. Action.']);
    const place: string[] = [];
    press(liveAt(['INT. KI'], `${SCRIPT}|`, place), 'Tab');
    expect(place).toEqual(['KITCHEN.']);
  });
});
