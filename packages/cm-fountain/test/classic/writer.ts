// The writer of the byte-promise tests (Classic Mode design §15.1): element lists to type, and a
// writer who types them key by key, as one would at the keyboard: Enter, Tab, the chooser's pick,
// letters (sometimes a UTF-16 unit at a time), Escape to send autofill away, and an accepted name.
import type { EditorState, Extension, StateCommand } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import {
  type ClassicKind as CodeKind,
  dismissOffer,
  elementAt,
  elementCommand,
  offerAt,
} from '../../src/classic';
import { apply } from '../helpers';
import { classicEditor, keys, type } from './harness';
import { arriving, type ClassicKind, type OracleTemplate, type Spoken } from './oracle';

// The oracle's kinds are the code's, one for one.
const _same: CodeKind = 'act' as ClassicKind;
void _same;

/** Both templates, by the names the tests give them. */
export const BOTH: readonly { name: string; template: OracleTemplate }[] = [
  { name: 'screenplay', template: 'screenplay' },
  { name: 'stage play', template: 'stage' },
];

export const TEMPLATES: Record<OracleTemplate, Template> = {
  screenplay: builtins['us-screenplay'] as Template,
  stage: builtins['stage-play-standard'] as Template,
};

/**
 * Fixed, so a failure in CI is the same failure on a laptop (fast-check prints the seed and path of
 * any failure). `SEED` and `RUNS` in the environment search further by hand.
 */
export const SEED = Number(process.env.SEED ?? 20261102);
export const RUNS = Number(process.env.RUNS ?? 150);

// ---- Words ------------------------------------------------------------------------------------

/** Letters of every sort: cased, accented, no-case scripts, emoji, and a cased letter outside the BMP. */
const LETTER = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'é',
  'ñ',
  'ü',
  '李',
  '明',
  'م',
  'ح',
  '🙂',
  '👩🏽‍🔧',
  // Deseret: a lower-case letter whose capital is another surrogate pair.
  '𐐨',
);
const INNER = fc.constantFrom(' ', '.', ',', "'", '-', '?', '0', '7');

/** A word: a letter, then letters and the punctuation words have inside them. */
const word = fc
  .tuple(LETTER, fc.array(fc.oneof({ weight: 4, arbitrary: LETTER }, INNER), { maxLength: 6 }))
  .map(([first, rest]) => (first + rest.join('')).replace(/ +/g, ' ').trim());

const plain = fc.array(word, { minLength: 1, maxLength: 3 }).map((w) => w.join(' '));

/** The awkward starts of §15.1, each a writer's words that look like a mark. */
export const AWKWARD = [
  '.45 in the drawer',
  '@home',
  '#1 fan',
  '!Bang',
  'INT. BY THE DOOR',
  'BANG',
  'CUT TO:',
  '~la la',
  '===',
  '= sign',
  '>arrow',
  'SHOUTED WORDS',
  '李明',
  '🙂 smile',
] as const;

const startingWith = (starts: readonly string[]) =>
  fc.oneof(
    { weight: 3, arbitrary: plain },
    {
      weight: 2,
      arbitrary: fc
        .tuple(fc.constantFrom(...starts), fc.option(plain, { nil: '' }))
        .map(([start, rest]) => (rest ? `${start} ${rest}` : start)),
    },
  );

/**
 * The words each element can hold. What an element can't hold is left out, each for a reason of
 * the spec: Fountain has no mark that forces Dialogue, so a speech line starting `~` is a lyric and
 * one all in `( )` a parenthetical (§4.2, "What has no mark"), and one starting `#` or `=` a
 * section, a synopsis, or a page break, which leaves the name above as Action; a name takes no `(` or `^`, which
 * are its extension and dual mark; and the lines no mark can force are the known exceptions below.
 */
const WORDS: Record<ClassicKind, fc.Arbitrary<string>> = {
  action: startingWith(AWKWARD),
  dialogue: startingWith(AWKWARD.filter((start) => !/^[~#=]/.test(start))),
  // A few names come back, so autofill has a name to offer, and one is the start of another.
  character: fc.oneof(
    {
      weight: 3,
      arbitrary: fc.constantFrom('june', 'junebug', 'dale', '李明', '𐐨ara', '🙂 smile'),
    },
    { weight: 2, arbitrary: startingWith(['@june', '!Bang', 'BANG', '李明', '#1 fan', '.45']) },
  ),
  // `.` forces a heading only before a letter or a digit, so one starting with anything else
  // (a mark's character, an emoji) can't be forced: the exceptions below.
  scene_heading: startingWith([
    '.45 in the drawer',
    'INT. BY THE DOOR',
    'FLASHBACK',
    '李明',
  ]).filter((words) => /^[\p{L}\p{N}.]/u.test(words)),
  transition: startingWith(['CUT TO:', 'FADE OUT.', 'BANG', '!Bang', '@home', '#1 fan', '~la']),
  parenthetical: plain,
  centered: startingWith(['BANG', '~la la', '#1 fan', '@home', '!Bang']),
  lyric: startingWith(['BANG', '~la la', '#1 fan', '!Bang']),
  section: startingWith(['BANG', '#1 fan', '!Bang']),
  synopsis: startingWith(['BANG', '= sign', '!Bang']),
  act: plain,
  page_break: fc.constant(''),
};

// ---- Scripts ----------------------------------------------------------------------------------

/** How the writer moves on: the key after an element's words, and whether they pick in the chooser anyway. */
export interface How {
  key: 'Enter' | 'Tab';
  pick: boolean;
  /** Letters typed one UTF-16 unit at a time, as a text diff can hand them over. */
  units: boolean;
  /** A name used before is accepted from autofill, not typed out. */
  accept: boolean;
}

export interface Step extends Spoken {
  how: How;
}

const how: fc.Arbitrary<How> = fc.record({
  key: fc.constantFrom('Enter', 'Tab'),
  pick: fc.boolean(),
  units: fc.boolean(),
  accept: fc.boolean(),
});

const step = (kind: ClassicKind): fc.Arbitrary<Step> =>
  fc.tuple(WORDS[kind], how).map(([words, h]) => ({ kind, words, how: h }));

/**
 * A speech: a name, then what's said, a parenthetical between two lines of it and perhaps before
 * the first. Two lines in a row are one paragraph, which Enter doesn't make (§6.1).
 */
const speech: fc.Arbitrary<Step[]> = fc
  .tuple(
    step('character'),
    fc.option(step('parenthetical'), { nil: null }),
    step('dialogue'),
    fc.array(fc.tuple(step('parenthetical'), step('dialogue')), { maxLength: 2 }),
  )
  .map(([name, first, line, more]) => [name, ...(first ? [first] : []), line, ...more.flat()]);

const ALONE: Record<OracleTemplate, ClassicKind[]> = {
  screenplay: [
    'scene_heading',
    'action',
    'transition',
    'centered',
    'lyric',
    'section',
    'synopsis',
    'page_break',
  ],
  stage: ['act', 'scene_heading', 'action', 'centered', 'lyric', 'synopsis', 'page_break'],
};

/** A script: elements and speeches, and never a page break first (a blank script's own case). */
export const script = (template: OracleTemplate): fc.Arbitrary<Step[]> =>
  fc
    .array(
      fc.oneof(
        {
          weight: 3,
          arbitrary: fc
            .constantFrom(...ALONE[template])
            .chain((kind) => step(kind).map((s) => [s])),
        },
        { weight: 2, arbitrary: speech },
      ),
      { minLength: 1, maxLength: 7 },
    )
    .map((parts) => parts.flat())
    .filter((steps) => steps[0]?.kind !== 'page_break');

// ---- The writer -------------------------------------------------------------------------------

/** A command run in a view, as a key runs it. */
export function inView(state: EditorState, command: (view: EditorView) => boolean): EditorState {
  const view = new EditorView({ state });
  try {
    command(view);
    return view.state;
  } finally {
    view.destroy();
  }
}

const HEADING = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i;

/** A transition's shape: capitals ending `TO:` (§4.2). */
const transitionShape = (typed: string) =>
  typed.endsWith('TO:') && /\p{Lu}/u.test(typed) && !/\p{Ll}/u.test(typed);

/** Whether words typed on a soft line would take a shape there (§4.2): a heading's prefix, a transition's capitals, or a title page on line 1. */
function takesShape(
  words: string,
  firstLine: boolean,
): 'scene_heading' | 'transition' | 'other' | null {
  if (HEADING.test(words)) return 'scene_heading';
  const points = [...words];
  for (let i = 1; i <= points.length; i++) {
    if (transitionShape(points.slice(0, i).join(''))) return 'transition';
  }
  return firstLine && words.includes(':') ? 'other' : null;
}

/** The text of the cursor's line up to the cursor. */
const typedSoFar = (state: EditorState) => {
  const { head } = state.selection.main;
  return state.sliceDoc(state.doc.lineAt(head).from, head);
};

/** Told of each key the writer presses: before it, and the state after it. */
export interface Watch {
  before?: () => void;
  after?: (state: EditorState) => void;
}

/** A writer at the keyboard, each key watched. */
function writer({ before, after }: Watch) {
  const press = (state: EditorState, act: (state: EditorState) => EditorState) => {
    before?.();
    const next = act(state);
    after?.(next);
    return next;
  };
  /** Letters, one key each: a code point, or a UTF-16 unit as a text diff can hand them over. */
  const letters = (state: EditorState, text: string, units: boolean) =>
    (units ? text.split('') : [...text]).reduce(
      (next, piece) => press(next, (s) => type(s, piece, { by: 'whole' })),
      state,
    );
  const key = (state: EditorState, name: string) => press(state, (s) => keys(s, name));
  const pick = (state: EditorState, kind: ClassicKind) =>
    press(state, (s) => apply(s, elementCommand(kind) as StateCommand));
  return { press, letters, key, pick };
}
type Writer = ReturnType<typeof writer>;

/** Types an element's words, or as much of a name as autofill needs, then takes its top offer. */
function typeWords(
  w: Writer,
  state: EditorState,
  s: Step,
  names: ReadonlySet<string>,
): { state: EditorState; moved: boolean } {
  const name = arriving(s);
  if (s.kind === 'character' && s.how.accept && names.has(name)) {
    let next = state;
    for (const point of [...s.words]) {
      next = w.letters(next, point, s.how.units);
      const top = offerAt(next, next.selection.main.head, false)?.options[0]?.label;
      if (top === name && typedSoFar(next) !== name)
        return { state: w.key(next, s.how.key), moved: true };
    }
    return { state: next, moved: false };
  }
  return { state: w.letters(state, s.words, s.how.units), moved: false };
}

/** Leaves an element's line: autofill sent away first where it offers something else, as a writer would. */
function leave(w: Writer, state: EditorState, key: 'Enter' | 'Tab'): EditorState {
  const offered = offerAt(state, state.selection.main.head, false);
  if (!offered) return w.key(state, key);
  // Escape then Tab would leave the editor, so after Escape the writer presses Enter.
  return w.key(inView(state, dismissOffer), 'Enter');
}

/** A blank script with Classic Mode on, in the template's own editor, with `more` extensions. */
export const blank = (template: OracleTemplate, more: Extension[] = [], text = '|') =>
  classicEditor(text, { template: TEMPLATES[template], with: more });

/** Types a script key by key, from a blank one or the state given. */
export function typeScript(
  steps: readonly Step[],
  template: OracleTemplate,
  { start, ...watch }: Watch & { start?: EditorState } = {},
): EditorState {
  const w = writer(watch);
  let state = start ?? blank(template);
  const names = new Set<string>();
  let moved = false;
  steps.forEach((s, i) => {
    const before = steps[i - 1];
    if (before && !moved && before.kind !== 'page_break') {
      // From a line of speech the key is the one that goes where the next element is.
      const key =
        before.kind === 'dialogue'
          ? s.kind === 'parenthetical'
            ? 'Tab'
            : 'Enter'
          : (before.kind === 'character' && s.kind === 'parenthetical') ||
              (before.kind === 'lyric' && s.kind === 'lyric')
            ? 'Enter'
            : s.how.key;
      state = leave(w, state, key);
    }
    moved = false;
    const here = elementAt(state);
    if (s.kind === 'parenthetical') {
      // From a name or a line of speech, Tab on the pending Dialogue writes the `()`.
      if (here?.kind === 'dialogue' && here.pending) state = w.key(state, 'Tab');
    } else if (s.kind === 'page_break') {
      state = w.pick(state, 'page_break');
    } else {
      const shape = here?.soft || here?.kind === 'character' ? takesShape(s.words, i === 0) : null;
      const natural = here?.kind === s.kind && (shape === null || shape === s.kind);
      // A transition's shape lasts only while the line is still one: `CUT TO: a` goes back to Action.
      const shaped =
        here?.soft && shape === s.kind && (shape !== 'transition' || transitionShape(s.words));
      if (!(natural || shaped) || (s.how.pick && here?.kind !== 'dialogue'))
        state = w.pick(state, s.kind);
    }
    if (s.kind !== 'page_break') {
      const typed = typeWords(w, state, s, names);
      state = typed.state;
      moved = typed.moved;
    }
    if (s.kind === 'character') names.add(arriving(s));
  });
  return state;
}

export const shown = (steps: readonly Step[]) =>
  steps
    .map(
      (s) =>
        `${s.kind}${s.how.pick ? '*' : ''}${s.how.units ? 'u' : ''}${s.how.accept ? 'a' : ''}(${s.how.key}): ${JSON.stringify(s.words)}`,
    )
    .join('\n');
