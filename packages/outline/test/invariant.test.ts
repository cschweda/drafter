import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderText } from '@drafter/render-text';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { SCENE_COLORS, type SceneColor, sceneIndex, setColor, setSynopsis } from '../src';
import { anyScript } from './arbitraries';
import { apply, indexOf, screenplay, stagePlay } from './helpers';

// Phase 2 never changes the printed script (Phase 2 design §1, item 2): for any script, the
// pages with every Phase 2 note in place print the same as without them. Plan A writes scene
// colors (`[[Color: …]]` header lines) and synopses; later plans add their notes and the Beat
// Board block to this file.
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

describe('the printed script', () => {
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
