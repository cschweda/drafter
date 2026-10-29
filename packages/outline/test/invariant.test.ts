import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import {
  FIELD_ORDER,
  insertNote,
  noteEntries,
  resolveAll,
  safeBody,
  writeNote,
} from '@drafter/notes';
import { renderText } from '@drafter/render-text';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import {
  SCENE_COLORS,
  type SceneColor,
  type SceneDetails,
  sceneIndex,
  setColor,
  setSceneDetails,
  setSynopsis,
} from '../src';
import { anyScript } from './arbitraries';
import { apply, indexOf, screenplay, stagePlay } from './helpers';

// Phase 2 never changes the printed script (Phase 2 design §1, item 2): for any script, the
// pages with every Phase 2 note in place print the same as without them. Plan A writes scene
// colors (`[[Color: …]]` header lines) and synopses; Plan B writes whole scene headers, inline
// Setup and Payoff marks, and the writer's and readers' notes with their categories and status.
// Later plans add their notes and the Beat Board block to this file.
//
// A color note typed by hand inside a line (`waits [[Color: red]] by`) is taken out alone: the
// spaces around it stay (`waits  by`), because a note prints nothing and they print. Closing them up
// would change the line's spacing on the page.

const templateOf = (source: string) =>
  parse(source).meta?.template === 'stage-play-standard' ? stagePlay : screenplay;

/** The script as it prints, as fixed-width text. */
function printed(source: string): string {
  const doc = parse(source);
  const template = templateOf(source);
  return renderText(paginate(doc, template), template);
}

/** `source` with `edit` made to every scene, from the last to the first so the offsets hold. */
function everyScene(
  source: string,
  edit: (doc: ReturnType<typeof parse>, n: number) => ReturnType<typeof setColor>,
): string {
  let out = source;
  const count = indexOf(source).index.scenes.length;
  for (let n = count - 1; n >= 0; n--) out = apply(out, edit(parse(out), n));
  return out;
}

const scripts = fc.oneof(anyScript, fountainScript);
const colors = fc.array(fc.constantFrom<SceneColor | null>(...SCENE_COLORS, null), {
  minLength: 30,
  maxLength: 30,
});

/** A field's value: words, the empty string or null (cleared), or left alone. */
const value = fc.option(
  fc.oneof(
    fc.string({ maxLength: 20 }),
    fc.constantFrom(
      'Two\nlines',
      'a ]] b',
      '/* not a boneyard */',
      '[[nested]]',
      'hope → dread',
      '#x',
    ),
  ),
  { nil: undefined },
);
const detailsArb: fc.Arbitrary<SceneDetails> = fc.record({
  synopsis: value,
  color: fc.option(fc.constantFrom<SceneColor | null>(...SCENE_COLORS, null), { nil: undefined }),
  storyline: value,
  goal: value,
  conflict: value,
  outcome: value,
  shift: value,
});
/** Every field written, for a full header. */
const fullDetails = fc.record({
  synopsis: fc.string({ minLength: 1, maxLength: 20 }),
  color: fc.constantFrom(...SCENE_COLORS),
  storyline: fc.constantFrom('A', 'A, B', 'C'),
  goal: fc.string({ minLength: 1, maxLength: 20 }),
  conflict: fc.string({ minLength: 1, maxLength: 20 }),
  outcome: fc.string({ minLength: 1, maxLength: 20 }),
  shift: fc.constantFrom('hope → dread', '+ → −', 'up'),
});

/** Every kind of keyed note Plan B writes inline: marks, categories, people, tags, status. */
const NOTES = [
  writeNote('Setup', 'the letter'),
  writeNote('Payoff', 'the letter'),
  writeNote('TODO', 'tighten this #pacing'),
  writeNote('Sam', 'cut the joke'),
  writeNote('Sam on “the words”', 'too long #dialogue'),
  writeNote('Ann re Sam', 'agreed #resolved'),
  writeNote(null, 'my own note #story'),
  writeNote(null, 'done #continuity #resolved'),
  writeNote('Card', 'An idea for later.'),
];
const inlineNotes = fc.array(fc.tuple(fc.nat(), fc.constantFrom(...NOTES)), { maxLength: 8 });

/** `source` with each note put in at the end of the line holding its offset, as the views do. */
function withNotes(source: string, notes: Array<[number, string]>): string {
  let out = source;
  for (const [at, note] of notes) {
    out = apply(out, insertNote(parse(out), at % (out.length + 1), note).changes);
  }
  return out;
}

describe('the printed script', () => {
  test('the layout is unchanged by scene details', () => {
    fc.assert(
      fc.property(
        scripts,
        fc.array(detailsArb, { minLength: 1, maxLength: 5 }),
        (source, picks) => {
          const edited = everyScene(source, (doc, n) => {
            const scene = sceneIndex(doc, templateOf(source)).scenes[n];
            return scene ? setSceneDetails(doc, scene, picks[n % picks.length] ?? {}) : [];
          });
          expect(printed(edited)).toBe(printed(source));
          // Every field set reads back as written.
          const after = indexOf(edited).index.scenes;
          after.forEach((scene, n) => {
            const pick = picks[n % picks.length] ?? {};
            for (const key of FIELD_ORDER) {
              const v = pick[key];
              if (v && safeBody(v) !== '') expect(scene.fields[key]?.body).toBe(safeBody(v));
            }
          });
          // And clearing every field prints the same too.
          const cleared = everyScene(edited, (doc, n) => {
            const scene = sceneIndex(doc, templateOf(source)).scenes[n];
            return scene
              ? setSceneDetails(doc, scene, {
                  color: null,
                  storyline: '',
                  goal: '',
                  conflict: '',
                  outcome: '',
                  shift: '',
                })
              : [];
          });
          expect(printed(cleared)).toBe(printed(source));
        },
      ),
      { numRuns: 200 },
    );
  });

  test('the layout is unchanged by every kind of keyed note', () => {
    fc.assert(
      fc.property(scripts, fullDetails, inlineNotes, (source, full, notes) => {
        const headed = everyScene(source, (doc, n) => {
          const scene = sceneIndex(doc, templateOf(source)).scenes[n];
          return scene ? setSceneDetails(doc, scene, full) : [];
        });
        const noted = withNotes(headed, notes);
        expect(printed(noted)).toBe(printed(source));
        // Resolved, they still print nothing.
        const doc = parse(noted);
        const resolved = apply(noted, resolveAll(doc, noteEntries(doc)));
        expect(printed(resolved)).toBe(printed(source));
      }),
      { numRuns: 200 },
    );
  });

  test('the layout is unchanged by colors', () => {
    fc.assert(
      fc.property(scripts, colors, (source, picks) => {
        const colored = everyScene(source, (doc, n) => {
          const scene = sceneIndex(doc, templateOf(source)).scenes[n];
          return scene ? setColor(doc, scene, picks[n % picks.length] ?? 'blue') : [];
        });
        expect(printed(colored)).toBe(printed(source));
        // And taking them all out again prints the same too.
        const plain = everyScene(colored, (doc, n) => {
          const scene = sceneIndex(doc, templateOf(source)).scenes[n];
          return scene ? setColor(doc, scene, null) : [];
        });
        expect(printed(plain)).toBe(printed(source));
      }),
      { numRuns: 200 },
    );
  });

  test('the layout is unchanged by synopsis edits', () => {
    fc.assert(
      fc.property(scripts, fc.string({ maxLength: 20 }), (source, text) => {
        const edited = everyScene(source, (doc, n) => {
          const scene = sceneIndex(doc, templateOf(source)).scenes[n];
          return scene ? setSynopsis(doc, scene, text) : [];
        });
        expect(printed(edited)).toBe(printed(source));
      }),
      { numRuns: 200 },
    );
  });
});

test('taking out a color typed inside a line keeps the line as it prints', () => {
  const source = 'INT. A - DAY\n\nShe waits [[Color: red]] by the door.\n';
  const scene = indexOf(source).index.scenes[0];
  if (!scene) throw new Error('no scene');
  const plain = apply(source, setColor(parse(source), scene, null));
  expect(plain).toBe('INT. A - DAY\n\nShe waits  by the door.\n');
  expect(printed(plain)).toBe(printed(source));
});
