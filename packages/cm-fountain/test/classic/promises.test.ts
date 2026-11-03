// The promises of Classic Mode design §4.1 and §15.1, each held by property or over every script
// the repository has: Classic Mode only adds what §4.1's table lets it; moving and switching write
// nothing; a letter and its mark are one undo step; Action stays Action; the metadata block stays;
// marks it didn't write are kept; and CRLF and a byte-order mark stay. Each property runs from a
// fixed seed, so CI sees the same runs as a laptop.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cursorCharLeft,
  cursorCharRight,
  cursorDocEnd,
  cursorDocStart,
  cursorPageDown,
  cursorPageUp,
  history,
  redo,
  selectAll,
  undo,
  undoDepth,
} from '@codemirror/commands';
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  findClusterBreak,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  elementStructure,
  elementTemplate,
  fountainInput,
  parsedDoc,
  structureOf,
} from '@drafter/cm-fountain';
import { metadataSpan, parse } from '@drafter/fountain';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fountainScript } from '../../../../fixtures/generators/fountain';
import { buildScript } from '../../../../fixtures/generators/script';
import {
  classic,
  classicArrows,
  classicEnd,
  classicHome,
  dismissOffer,
  elementAt,
  elementCommand,
  hiddenSpans,
  offerAt,
  savedText,
  visibleEnd,
  visibleStart,
} from '../../src/classic';
import { apply, BOM } from '../helpers';
import { classicEditor, keys, render, type } from './harness';
import { fountainOf, type OracleTemplate } from './oracle';
import { BOTH, blank, inView, RUNS, SEED, script, shown, TEMPLATES, typeScript } from './writer';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

// ---- Every script the repository has ----------------------------------------------------------

interface Script {
  name: string;
  text: string;
  template: 'screenplay' | 'stage';
}

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const isPlay = (text: string) => /"template"\s*:\s*"stage-play/.test(text);

/** The classification fixtures, the samples, Signal Hill, and the generators' scripts. */
const CORPUS: Script[] = [
  ...readdirSync(join(ROOT, 'fixtures/classification'))
    .filter((name) => name.endsWith('.fountain'))
    .map((name) => ({ name, text: read(`fixtures/classification/${name}`) })),
  ...readdirSync(join(ROOT, 'apps/web/app/editor/sample-scripts'))
    .filter((name) => name.endsWith('.fountain'))
    .map((name) => ({ name, text: read(`apps/web/app/editor/sample-scripts/${name}`) })),
  { name: 'Signal Hill', text: read('apps/web/scripts/ui-shots-script.fountain') },
  { name: 'buildScript(40 KB)', text: buildScript(40_000) },
  ...fc
    .sample(fountainScript, { numRuns: 12, seed: SEED })
    .map((text, i) => ({ name: `fountainScript #${i}`, text })),
].map((one): Script => ({ ...one, template: isPlay(one.text) ? 'stage' : 'screenplay' }));

/** The scripts small enough to edit at random many times over, by name, so a failure names its script. */
const SMALL = CORPUS.filter(({ text }) => text.length < 6_000);
const byName = new Map(CORPUS.map((one) => [one.name, one]));
const small = fc
  .constantFrom(...SMALL.map(({ name }) => name))
  .map((name) => byName.get(name) as Script);

/** Classic Mode's editor on a script, as the app builds it, with a history and the cursor at `at`. */
function opened(
  { text, template }: Pick<Script, 'text' | 'template'>,
  at = 0,
  more: Extension[] = [],
): EditorState {
  const kind = TEMPLATES[template];
  const state = EditorState.create({
    doc: text,
    extensions: [
      // Ahead of Fountain's input filters, as the app's compartment is: filters run last to first.
      classic(),
      parsedDoc,
      fountainInput(),
      elementStructure.of(() => structureOf(kind)),
      elementTemplate.of(() => kind),
      history(),
      ...more,
    ],
  });
  return state.update({ selection: { anchor: Math.min(at, state.doc.length) } }).state;
}

// ---- Keys -------------------------------------------------------------------------------------

type Motion = (view: EditorView) => boolean;

/** The last place at or before `column` that isn't inside a character, as a measured move lands. */
function clusterAt(text: string, column: number): number {
  let at = 0;
  for (;;) {
    const next = findClusterBreak(text, at);
    if (next > Math.min(column, text.length) || next === at) return at;
    at = next;
  }
}

/**
 * Runs `motion` in a view. jsdom has no layout, so Up and Down go to the same column a line away
 * (the goal column kept, as `moveVertically` does), and a page is twenty lines.
 */
function inLayoutless(view: EditorView, motion: Motion) {
  view.moveVertically = (range, down = false, distance) => {
    const line = view.state.doc.lineAt(range.head);
    const goal = range.goalColumn ?? range.head - line.from;
    const step = distance === undefined ? 1 : 20;
    const number = Math.max(1, Math.min(view.state.doc.lines, line.number + (down ? step : -step)));
    const target = view.state.doc.line(number);
    return EditorSelection.cursor(
      target.from + clusterAt(target.text, goal),
      undefined,
      undefined,
      goal,
    );
  };
  motion(view);
}

const MOTIONS: Record<string, Motion> = {
  left: cursorCharLeft,
  right: cursorCharRight,
  up: classicArrows[0] as Motion,
  down: classicArrows[1] as Motion,
  home: classicHome as unknown as Motion,
  end: classicEnd as unknown as Motion,
  'mod-end': cursorDocEnd,
  'mod-home': cursorDocStart,
  'page-down': cursorPageDown,
  'page-up': cursorPageUp,
};

/** A motion or a click, in a view: the cursor sent to a share of the way through the script. */
type Move = { motion: keyof typeof MOTIONS } | { click: number };

const move: fc.Arbitrary<Move> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...Object.keys(MOTIONS)).map((motion) => ({ motion })) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }).map((click) => ({ click })) },
);

function moveIn(view: EditorView, m: Move) {
  if ('click' in m) {
    const pos = Math.floor(m.click * view.state.doc.length);
    view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' });
  } else inLayoutless(view, MOTIONS[m.motion] as Motion);
}

/** A writer's key: words typed, a key pressed, an element picked, autofill sent away, or a move. */
type Key =
  | { words: string }
  | { key: 'Enter' | 'Tab' | 'Shift-Tab' | 'Shift-Enter' }
  | { pick: 'action' | 'character' | 'scene_heading' | 'transition' | 'lyric' | 'centered' }
  | { dismiss: true }
  | { move: Move };

const WORD_POOL = [
  'int.',
  'int. diner',
  'june',
  'Hello.',
  '.45',
  '@home',
  'BANG',
  'cut to:',
  '李明',
  '🙂',
  '𐐨',
  ' ',
  '(',
  ')',
  '!',
  '~',
  '#1',
  '=',
  '>',
  '<',
];

const writerKey: fc.Arbitrary<Key> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...WORD_POOL).map((words) => ({ words })) },
  {
    weight: 4,
    arbitrary: fc
      .constantFrom('Enter', 'Tab', 'Shift-Tab', 'Shift-Enter')
      .map((key) => ({ key }) as Key),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom('action', 'character', 'scene_heading', 'transition', 'lyric', 'centered')
      .map((pick) => ({ pick }) as Key),
  },
  { weight: 1, arbitrary: fc.constant({ dismiss: true } as Key) },
  { weight: 2, arbitrary: move.map((m) => ({ move: m })) },
);

/** The state after one of the writer's keys. Each key is its own undo step (`now` moves on). */
function pressKey(state: EditorState, k: Key): EditorState {
  if ('words' in k) return type(state, k.words);
  if ('key' in k) return keys(state, k.key);
  // The chooser's pick is for an empty line; on a line with text the bar is Fountain's own command.
  if ('pick' in k) {
    return elementAt(state)?.pending ? apply(state, elementCommand(k.pick) as StateCommand) : state;
  }
  if ('dismiss' in k) return inView(state, dismissOffer);
  const view = new EditorView({ state });
  try {
    moveIn(view, k.move);
    return view.state;
  } finally {
    view.destroy();
  }
}

/**
 * What a key may write as the writer's own: the words typed, or for Enter and Tab the words of a
 * suggestion they accept (§4.1), with the ` - ` a time comes with.
 */
function typedBy(state: EditorState, k: Key): string {
  if ('words' in k) return k.words;
  if (!('key' in k) || (k.key !== 'Enter' && k.key !== 'Tab')) return '';
  const { head } = state.selection.main;
  const labels = [false, true].flatMap(
    (explicit) =>
      offerAt(state, head, explicit)
        ?.options.slice(0, 1)
        .map(({ label }) => label) ?? [],
  );
  return labels.map((label) => ` - ${label}`).join('');
}

/**
 * Keys the property leaves out. §6.2: Shift+Tab on a pending Dialogue takes its empty line, as
 * Backspace would, which is a delete, not an addition. And the open case below: where Classic's
 * Tab and Shift+Tab stand back (a blocked place), Fountain's own Tab and Shift+Tab run.
 */
function leftOut(state: EditorState, k: Key): boolean {
  if (!('key' in k) || (k.key !== 'Tab' && k.key !== 'Shift-Tab')) return false;
  const element = elementAt(state);
  if (!element || element.tab === null) return true;
  return k.key === 'Shift-Tab' && element.kind === 'dialogue' && element.pending;
}

const showKeys = (ks: readonly Key[]) => ks.map((k) => JSON.stringify(k)).join(' ');

// ---- §4.1's table, as a diff -----------------------------------------------------------------

/** What §4.1 lets Classic Mode write beside the writer's own characters: its marks, `()`, and spaces. */
const MARKS = new Set(['!', '@', '.', '>', '<', '~', '#', '=', ' ', '(', ')']);

/** The most of §4.1's own characters one key writes: `!!`, `()`, a mark and its space, or a `!` above as well. */
const MOST_PER_KEY = 3;

/** Characters, as a count of each. */
function counted(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return counts;
}

/**
 * Why `after` isn't `before` plus only what §4.1 allows, or null. Every character of `before` must
 * still be there, in order and in its case (no change to existing text). What's new must be the
 * writer's own characters (in either case, as a heading, a name, and a transition arrive in
 * capitals), line breaks, and at most a few of §4.1's characters for each key. A line of spaces
 * alone counts as empty, as the first letter on a speech's two spaces takes them.
 */
function notAllowed(was: string, now: string, typed: string, presses: number): string | null {
  // A line of only spaces (a speech's two) gives them up to the first letter typed on it (§6.4).
  const unspaced = (text: string) => text.replace(/^[ \t]+$/gm, '');
  const before = unspaced(was);
  const after = unspaced(now);
  let at = 0;
  for (const ch of before) {
    const found = after.indexOf(ch, at);
    if (found === -1) return `existing text changed: ${JSON.stringify(ch)} is gone`;
    at = found + ch.length;
  }
  const extra = counted(after);
  for (const [ch, n] of counted(before)) extra.set(ch, (extra.get(ch) ?? 0) - n);
  const mine = counted(typed);
  let own = 0;
  for (const [ch, n] of extra) {
    if (n <= 0 || ch === '\n') continue;
    const asTyped =
      (mine.get(ch) ?? 0) + (mine.get(ch.toLowerCase()) ?? 0) * (ch.toLowerCase() === ch ? 0 : 1);
    const left = n - Math.min(n, asTyped);
    if (left === 0) continue;
    if (!MARKS.has(ch)) return `wrote ${JSON.stringify(ch)}, which isn't §4.1's`;
    own += left;
  }
  return own > MOST_PER_KEY * presses
    ? `wrote ${own} of its own characters in ${presses} keys`
    : null;
}

// ---- The properties ---------------------------------------------------------------------------

describe('Classic only adds what it may', () => {
  test('any keys on any script: its text, its marks, and its case kept, and only §4.1’s additions', () => {
    fc.assert(
      fc.property(
        small,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(writerKey, { minLength: 1, maxLength: 14 }),
        (one, where, ks) => {
          const start = opened(one, Math.floor(where * one.text.length));
          const before = start.doc.toString();
          let state = start;
          let typed = '';
          for (const k of ks) {
            if (leftOut(state, k)) continue;
            typed += typedBy(state, k);
            state = pressKey(state, k);
          }
          const why = notAllowed(before, state.doc.toString(), typed, ks.length);
          expect(why, `${one.name}: ${showKeys(ks)}`).toBeNull();
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  // Open (found by the property above, and left out of it): where Classic's Tab stands back, on a
  // line that starts inside a boneyard, it gives the key back for the browser to move focus (§6),
  // but Fountain's own Tab is next in line and takes it, and makes the line a cue: capitals and
  // `@` on text the writer typed. Shift+Tab the same, the other way. Stopping Fountain's key there
  // while still letting focus move wants a ruling. This test passes once it's fixed: drop `.fails`.
  test.fails('Tab on a line that starts in a boneyard leaves the line as it is', () => {
    const text = 'A door.\n\n/* cut\n\nknows the. */ more';
    const state = keys(classicEditor(`${text}|`), 'Tab');
    expect(state.doc.toString()).toBe(text);
  });

  // The known exceptions, held as they are (the ledger's rulings), not changed.
  test('a line Enter makes inside a speech, while the cursor is on it, is §4.2’s one exception, and a save leaves it out', () => {
    const state = keys(classicEditor('JUNE\nOne.|\nTwo.'), 'Enter');
    expect(render(state)).toBe('JUNE\nOne.\n|\nTwo.');
    expect(savedText(state).toString()).toBe('JUNE\nOne.\nTwo.');
  });

  test('a space typed against a mark leaves the mark to be seen, and the bytes as typed (Call 23)', () => {
    const state = type(classicEditor('a **b|** c'), ' ');
    expect(state.doc.toString()).toBe('a **b ** c');
    expect(hiddenSpans(state, state.doc.line(1)).filter((span) => span.kind === 'pair')).toEqual(
      [],
    );
  });

  test('the diff checker finds a change to existing text, and a character §4.1 doesn’t list', () => {
    expect(notAllowed('int. a', 'INT. a', '', 1)).toMatch(/existing text changed/);
    expect(notAllowed('a', 'a\n\nX', '', 1)).toMatch(/isn't §4.1's/);
    expect(notAllowed('a', 'a\n\n!!!!', '', 1)).toMatch(/of its own characters/);
    expect(notAllowed('a', 'a\n\n.FLASHBACK', 'flashback', 2)).toBeNull();
  });
});

describe('moving writes nothing', () => {
  test.each(CORPUS.map((one) => [one.name, one] as const))('%s', (_name, one) => {
    const view = new EditorView({ state: opened(one) });
    try {
      const moves = fc.sample(fc.array(move, { minLength: 80, maxLength: 80 }), {
        numRuns: 1,
        seed: SEED,
      })[0] as Move[];
      let changed = false;
      const original = view.state.doc;
      for (const m of moves) {
        const was = view.state.doc;
        moveIn(view, m);
        if (!view.state.doc.eq(was)) changed = true;
      }
      expect(changed, `${one.name}: a move wrote`).toBe(false);
      expect(view.state.doc.eq(original)).toBe(true);
    } finally {
      view.destroy();
    }
  });

  test('tidying only takes back what the writer made: Enter, then moving away', () => {
    fc.assert(
      fc.property(
        small,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(move, { minLength: 1, maxLength: 6 }),
        (one, where, moves) => {
          const start = opened(one, Math.floor(where * one.text.length));
          const made = keys(start, 'Enter');
          const view = new EditorView({ state: made });
          try {
            for (const m of moves) moveIn(view, m);
            const after = view.state.doc.toString();
            const why = notAllowed(start.doc.toString(), after, '', 1);
            expect(why, `${one.name}: ${JSON.stringify(moves)}`).toBeNull();
          } finally {
            view.destroy();
          }
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe('switching writes nothing', () => {
  test('any state, any number of switches: the same text, selection, and history', () => {
    const mode = new Compartment();
    fc.assert(
      fc.property(
        small,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(writerKey, { maxLength: 8 }),
        fc.integer({ min: 1, max: 5 }),
        (one, where, ks, switches) => {
          const base = EditorState.create({
            doc: one.text,
            extensions: [
              mode.of(classic()),
              parsedDoc,
              fountainInput(),
              elementStructure.of(() => structureOf(TEMPLATES[one.template])),
              elementTemplate.of(() => TEMPLATES[one.template]),
              history(),
            ],
          });
          let state = base.update({
            selection: { anchor: Math.floor(where * base.doc.length) },
          }).state;
          for (const k of ks) state = pressKey(state, k);
          let on = true;
          for (let i = 0; i < switches; i++) {
            on = !on;
            const tr: Transaction = state.update({
              effects: mode.reconfigure(on ? classic() : []),
            });
            expect(tr.docChanged).toBe(false);
            expect(tr.state.doc.eq(state.doc)).toBe(true);
            expect(tr.state.selection.eq(state.selection)).toBe(true);
            expect(undoDepth(tr.state)).toBe(undoDepth(state));
            state = tr.state;
          }
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe('a letter and its mark are never split', () => {
  let now = 1_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  test.each(BOTH)(
    'in a $name typed with time between each key, undo and redo go one key at a time',
    ({ template }) => {
      fc.assert(
        fc.property(script(template), (steps) => {
          const seen: string[] = [];
          // Deep enough to hold every key of the longest script.
          const start = blank(template, [history({ minDepth: 10_000 })]);
          seen.push(start.doc.toString());
          const end = typeScript(steps, template, {
            start,
            // More than history's group delay, so each key is its own step.
            before: () => {
              now += 1_000;
              vi.setSystemTime(now);
            },
            after: (state) => {
              if (state.doc.toString() !== seen.at(-1)) seen.push(state.doc.toString());
            },
          });
          // Back through every key, each undo the state before that key.
          let state = end;
          const back = [state.doc.toString()];
          while (undoDepth(state) > 0) {
            state = apply(state, undo);
            back.push(state.doc.toString());
          }
          expect(back.reverse(), shown(steps)).toEqual(seen);
          // And forward again, each redo the state after it.
          const forward = [state.doc.toString()];
          for (;;) {
            const next = apply(state, redo);
            if (next === state) break;
            state = next;
            forward.push(state.doc.toString());
          }
          expect(forward, shown(steps)).toEqual(seen);
        }),
        { numRuns: Math.ceil(RUNS / 3), seed: SEED },
      );
    },
  );
});

/** An empty line under a line of capitals the parser reads as Action: the open case below. */
function underLoneCapitals(state: EditorState): boolean {
  const line = state.doc.lineAt(state.selection.main.head);
  if (line.text.trim() || line.number < 2) return false;
  const above = state.doc.line(line.number - 1);
  const block = state.field(parsedDoc).blocks.find((one) => one.span.from === above.from);
  return block?.kind === 'action';
}

describe('Action stays Action', () => {
  const NAMES = ['JUNE', 'DALE'];
  const LOUD = ['BANG', 'THUD', 'CRASH', 'SILENCE.'];
  const actionKey = fc.oneof(
    { weight: 3, arbitrary: fc.nat(3).map((i) => ({ words: i })) },
    {
      weight: 3,
      arbitrary: fc
        .constantFrom('Enter', 'Tab', 'Shift-Tab', 'Shift-Enter', 'ArrowUp', 'ArrowDown')
        .map((key) => ({ key })),
    },
  );

  test('capitals typed on Action never make a cue, by any key sequence', () => {
    fc.assert(
      fc.property(
        fc.array(actionKey, { minLength: 1, maxLength: 16 }),
        fc.constantFrom('', 'INT. HALL - DAY\n\nA door.\n\n'),
        (ks, text) => {
          let state = classicEditor(`${text}|`, { with: [history()] });
          for (const k of ks) {
            // The open case below, left out: anything that writes a speech on the line under lone capitals.
            const writes = !('key' in k) || k.key === 'Shift-Enter' || k.key === 'Tab';
            if (writes && underLoneCapitals(state)) continue;
            if ('key' in k) {
              state = k.key.startsWith('Arrow')
                ? (() => {
                    const view = new EditorView({ state });
                    try {
                      inLayoutless(view, MOTIONS[k.key === 'ArrowUp' ? 'up' : 'down'] as Motion);
                      return view.state;
                    } finally {
                      view.destroy();
                    }
                  })()
                : keys(state, k.key);
              continue;
            }
            // A name where the writer is in Character; capitals of Action's own anywhere else.
            const element = elementAt(state);
            const pool = element?.kind === 'character' ? NAMES : LOUD;
            state = type(state, pool[k.words % pool.length] as string);
          }
          for (const block of state.field(parsedDoc).blocks) {
            if (block.kind !== 'character') continue;
            const name = block.sem.name;
            expect(
              LOUD.includes(name),
              `${name} became a cue: ${JSON.stringify(ks)}\n${render(state)}`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  // Open (found by the property above, and left out of it): a line of capitals on Action, left and
  // come back to, reads to the parser as Action, but the empty line under it is pending Dialogue, as
  // under a name, so Shift+Enter there (a speech's two spaces), Tab (its `()`), or a letter makes
  // the capitals a cue on a line the cursor isn't on. Today's tests pin the same for a name opened in a file
  // (`JUNE\n|`), so the fix wants a ruling. This test passes once it's fixed: then drop `.fails`.
  test.fails('capitals left and come back to stay Action under Shift+Enter on the line below', () => {
    let state = keys(classicEditor('|'), 'BANG', 'Enter');
    const view = new EditorView({ state });
    try {
      inLayoutless(view, MOTIONS.up as Motion);
      state = view.state;
    } finally {
      view.destroy();
    }
    expect(render(state)).toBe('BANG\n|\n');
    state = keys(state, 'Shift-Enter');
    expect(parse(state.doc.toString()).blocks[0]?.kind).toBe('action');
  });

  test('a line that reads as a cue only for the line under it has its `!`', () => {
    const state = keys(classicEditor('A door.\n\n|'), 'BANG', 'Shift-Enter', 'It echoes.');
    expect(state.doc.toString()).toBe('A door.\n\n!BANG\nIt echoes.');
    expect(parse(state.doc.toString()).blocks.map((block) => block.kind)).toEqual([
      'action',
      'action',
    ]);
  });
});

describe('the metadata block stays', () => {
  let now = 2_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  const BLOCK = '/* drafter\n{"v":1,"template":"stage-play"}\n*/';
  const PLAYS = [
    `INT. HALL - DAY\n\nA door.\n\nJUNE\nHello.\n\n${BLOCK}\n`,
    `# ACT ONE\n\n## THE ATTIC\n\nDust.\n\n${BLOCK}`,
    `\n\n${BLOCK}\n`,
  ];

  /** Select All, as the key does, which stops above the block. */
  const all = (state: EditorState) => inView(state, selectAll);
  const write = (state: EditorState, insert: string, userEvent: string) => {
    const { from, to } = state.selection.main;
    return state.update({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent,
    }).state;
  };
  type BlockKey =
    | Key
    | { all: 'Backspace' | 'Delete' | 'cut' | 'paste' | 'type' }
    | { backspace: true };
  const blockKey: fc.Arbitrary<BlockKey> = fc.oneof(
    { weight: 3, arbitrary: writerKey },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom('Backspace', 'Delete', 'cut', 'paste', 'type')
        .map((how) => ({ all: how }) as BlockKey),
    },
    { weight: 1, arbitrary: fc.constant({ backspace: true } as BlockKey) },
  );

  function pressBlock(state: EditorState, k: BlockKey): EditorState {
    if ('all' in k) {
      const whole = state;
      if (k.all === 'Backspace' || k.all === 'Delete') return keys(whole, k.all);
      if (k.all === 'cut') return write(whole, '', 'delete.cut');
      if (k.all === 'paste') return write(whole, 'INT. ELSEWHERE - NIGHT\n\nRain.', 'input.paste');
      return type(whole, 'x');
    }
    if ('backspace' in k) return keys(state, 'Backspace');
    return pressKey(state, k);
  }

  test('any keys, Select All with Delete, Cut, paste, and typing: the block’s bytes, last, and `doc.meta`', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PLAYS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(blockKey, { minLength: 1, maxLength: 10 }),
        (text, where, ks) => {
          let state = opened({ text, template: 'stage' });
          state = state.update({
            selection: { anchor: Math.floor(where * text.indexOf('/*')) },
          }).state;
          const meta = parse(text).meta;
          for (const k of ks) {
            const later = () => {
              now += 1_000;
              vi.setSystemTime(now);
            };
            later();
            // Select All is a move of its own, which may tidy; the key's edit comes after it.
            if ('all' in k) {
              state = all(state);
              later();
            }
            const before = state;
            state = pressBlock(state, k);
            const doc = state.doc.toString();
            const parsed = parse(doc);
            expect(parsed.meta, `${JSON.stringify(k)} in ${JSON.stringify(ks)}`).toEqual(meta);
            const span = metadataSpan(parsed);
            expect(span && doc.slice(span.from, span.to), JSON.stringify(ks)).toBe(BLOCK);
            expect(doc.slice(span?.to).trim(), JSON.stringify(ks)).toBe('');
            // Undo after each key gives back the text before it. A move that tidies isn't a step.
            if (!('move' in k) && !before.doc.eq(state.doc)) {
              expect(apply(state, undo).doc.toString(), JSON.stringify(ks)).toBe(
                before.doc.toString(),
              );
            }
          }
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe('marks kept', () => {
  const MARKED = [
    '.FLASHBACK',
    '!INT. BY THE DOOR',
    '@mcGRAW',
    'Hello there.',
    '(softly)',
    '~La la la',
    '>THE END<',
    '>FADE OUT.',
    '# Part one',
    '= She runs.',
    '!BANG',
    '===',
  ];
  const SCRIPT = [
    '.FLASHBACK',
    '',
    '!INT. BY THE DOOR',
    '',
    '@mcGRAW',
    '(softly)',
    'Hello there.',
    '~La la la',
    '',
    '>THE END<',
    '',
    '>FADE OUT.',
    '',
    '# Part one',
    '',
    '= She runs.',
    '',
    '!BANG',
    '',
    '===',
  ].join('\n');

  test('a script with a mark on every line, edited on one line, keeps every other line’s bytes', () => {
    expect(SCRIPT.split('\n').filter(Boolean).sort()).toEqual([...MARKED].sort());
    const lines = SCRIPT.split('\n');
    // A letter on a page break goes on to the Action under it (the ruling on Task 9), off the line.
    const filled = lines.flatMap((line, i) => (line && line !== '===' ? [i] : []));
    fc.assert(
      fc.property(
        fc.constantFrom(...filled),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(
          fc.oneof(
            fc.constantFrom('a', 'Z', ' ', '!', '@', '李', '🙂').map((words) => ({ words })),
            fc.constantFrom('Backspace', 'Delete').map((key) => ({ key })),
          ),
          { minLength: 1, maxLength: 6 },
        ),
        (index, where, ks) => {
          let state = opened({ text: SCRIPT, template: 'screenplay' });
          const line = state.doc.line(index + 1);
          state = state.update({
            selection: { anchor: line.from + Math.ceil(where * line.length) },
          }).state;
          for (const k of ks) {
            const here = state.doc.lineAt(state.selection.main.head);
            const { head } = state.selection.main;
            // Keys that stay on the line: no Backspace at its visible start (a join), no Delete at its end.
            if ('key' in k && k.key === 'Backspace' && head <= visibleStart(state, here)) continue;
            if ('key' in k && k.key === 'Delete' && head >= visibleEnd(state, here)) continue;
            state = 'words' in k ? type(state, k.words) : keys(state, k.key);
          }
          const after = state.doc.toString().split('\n');
          expect(after.length, JSON.stringify(ks)).toBe(lines.length);
          after.forEach((text, i) => {
            if (i !== index)
              expect(text, `line ${i + 1} after ${JSON.stringify(ks)}`).toBe(lines[i]);
          });
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe('the file’s own form', () => {
  test.each(BOTH)('CRLF stays CRLF, in a $name', ({ template }) => {
    fc.assert(
      fc.property(script(template), (steps) => {
        const start = blank(template, [EditorState.lineSeparator.of('\r\n')]);
        const state = typeScript(steps, template, { start });
        expect(state.lineBreak).toBe('\r\n');
        const lines = state.doc.toJSON();
        expect(lines.some((line) => line.includes('\r') || line.includes('\n'))).toBe(false);
        expect(state.doc.sliceString(0, state.doc.length, '\r\n'), shown(steps)).toBe(
          fountainOf(steps, template).replace(/\n/g, '\r\n'),
        );
      }),
      { numRuns: Math.ceil(RUNS / 3), seed: SEED },
    );
  });

  test('a CRLF file opened, moved through, and typed in keeps CRLF on every line', () => {
    const text = 'INT. HALL - DAY\r\n\r\nA door.\r\n\r\nJUNE\r\nHello.\r\n';
    let state = opened({ text, template: 'screenplay' }, 0, [EditorState.lineSeparator.of('\r\n')]);
    state = keys(
      state.update({ selection: { anchor: state.doc.line(3).to } }).state,
      'Enter',
      'BANG',
      'Tab',
      'dale',
      'Enter',
      'Hi.',
    );
    const written = state.doc.sliceString(0, state.doc.length, state.lineBreak);
    expect(written).toBe(
      'INT. HALL - DAY\r\n\r\nA door.\r\n\r\nBANG\r\n\r\nDALE\r\nHi.\r\n\r\nJUNE\r\nHello.\r\n',
    );
    expect(written.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  test.each(BOTH)('a byte-order mark stays, in a $name', ({ template }) => {
    fc.assert(
      fc.property(script(template), (steps) => {
        const start = blank(template, [], `${BOM}|`);
        const state = typeScript(steps, template, { start });
        expect(state.doc.toString(), shown(steps)).toBe(BOM + fountainOf(steps, template));
      }),
      { numRuns: Math.ceil(RUNS / 3), seed: SEED },
    );
  });
});
