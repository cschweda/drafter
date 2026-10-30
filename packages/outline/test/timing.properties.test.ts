import { type Block, parse } from '@drafter/fountain';
import { bodyEnd } from '@drafter/notes';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  addTiming,
  blockTiming,
  DEFAULT_WORDS_PER_MINUTE,
  estimateSeconds,
  sceneIndex,
  startsScene,
  type Timing,
  TimingTally,
} from '../src';
import { anyScript, screenplayScript } from './arbitraries';
import { screenplay, stagePlay } from './helpers';
import { ReferenceTally } from './timing-reference';

/** Speeches with lyrics, and quiet blocks inside and after them, the case `spokenBy` must get right. */
const lyricWord = fc.constantFrom('la', 'happy', 'birthday', 'oh');
const lyric = fc.array(lyricWord, { minLength: 1, maxLength: 4 }).map((w) => `~${w.join(' ')}`);
const speaker = fc.constantFrom('ANN', 'BEN', '@McCLANE');
const quiet = fc.constantFrom(
  '= A synopsis.',
  '\n[[A note.]]',
  '\n/* Cut. */',
  '[[An inline note.]]',
);
const speechPart = fc.oneof(lyric, fc.constantFrom('One two three.', '(beat)', 'Four.'), quiet);
const speech = fc
  .tuple(speaker, fc.boolean(), fc.array(speechPart, { minLength: 1, maxLength: 4 }))
  .map(([name, dual, parts]) => `${name}${dual ? ' ^' : ''}\n${parts.join('\n')}`);
const lyricScene = fc
  .array(fc.oneof(speech, lyric, fc.constant('He runs.')), { minLength: 1, maxLength: 5 })
  .map((parts) => ['INT. HALL - DAY', ...parts].join('\n\n'));
const lyricScript = fc.oneof(
  screenplayScript,
  fc.array(lyricScene, { minLength: 1, maxLength: 3 }).map((scenes) => `${scenes.join('\n\n')}\n`),
);
/** Speeches before the first scene, under an act's heading or not, then scenes or none. */
const coldOpen = fc
  .tuple(
    fc.boolean(),
    fc.array(fc.oneof(speech, fc.constant('A door slams.')), { minLength: 1, maxLength: 4 }),
    fc.array(lyricScene, { maxLength: 3 }),
  )
  .map(
    ([act, open, scenes]) =>
      `${[...(act ? ['# Act One'] : []), ...open, ...scenes].join('\n\n')}\n`,
  );
const speechScript = fc.oneof(anyScript, lyricScript, coldOpen);

const SPEECH_PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);

/** Words spoken outside any speech, as the layout groups speeches: a cue, then the parts right after it. */
function unattributed(blocks: readonly Block[], template: typeof screenplay): number {
  let inSpeech = false;
  let words = 0;
  for (const block of blocks) {
    if (block.kind === 'character') {
      inSpeech = true;
      continue;
    }
    inSpeech = inSpeech && SPEECH_PARTS.has(block.kind) && block.leading.split('\n').length === 2;
    if (!inSpeech) words += blockTiming(block, template).spoken;
  }
  return words;
}

const sound = (t: Timing) => {
  for (const n of [t.spoken, t.actionLines]) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
  const seconds = estimateSeconds(t, DEFAULT_WORDS_PER_MINUTE);
  expect(Number.isFinite(seconds)).toBe(true);
  expect(seconds).toBeGreaterThanOrEqual(0);
};

describe('timing properties', () => {
  test("timing is finite, non-negative, and sums over scenes to at most the script's", () => {
    fc.assert(
      fc.property(anyScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        const script = doc.blocks
          .map((block) => blockTiming(block, template))
          .reduce(addTiming, { spoken: 0, actionLines: 0 });
        sound(script);
        let scenes: Timing = { spoken: 0, actionLines: 0 };
        for (const scene of index.scenes) {
          sound(scene.timing);
          scenes = addTiming(scenes, scene.timing);
        }
        expect(scenes.spoken).toBeLessThanOrEqual(script.spoken);
        expect(scenes.actionLines).toBeLessThanOrEqual(script.actionLines);
        for (const section of index.sections) {
          sound(section.timing);
          // A section is the sum of the scenes inside it.
          const inside = index.scenes
            .filter((s) => s.sections.includes(section.block))
            .reduce((sum, s) => addTiming(sum, s.timing), { spoken: 0, actionLines: 0 });
          expect(section.timing).toEqual(inside);
        }
      }),
    );
  });

  test("the preamble, the scenes, and the sections' openings add up to the script's timing exactly", () => {
    fc.assert(
      fc.property(anyScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        const whole = new TimingTally(template);
        for (const block of doc.blocks) whole.add(block);
        /** The tally of blocks `from` up to `to`, on their own. */
        const part = (from: number, to: number) => {
          const t = new TimingTally(template);
          for (let i = from; i < to; i++) t.add(doc.blocks[i] as never);
          return t.timing();
        };
        // What isn't in a scene: the preamble, each section's opening up to what comes next
        // inside it, and the metadata block at the end.
        const end = bodyEnd(doc);
        const starts = [...index.scenes.map((s) => s.block), ...index.sections.map((s) => s.block)];
        const next = (after: number) => Math.min(end, ...starts.filter((b) => b > after));
        let sum = part(0, Math.min(end, ...starts));
        for (const section of index.sections) {
          if (startsScene(template, doc.blocks[section.block] as never)) continue;
          sum = addTiming(sum, part(section.block, next(section.block)));
        }
        for (const scene of index.scenes) sum = addTiming(sum, scene.timing);
        sum = addTiming(sum, part(end, doc.blocks.length));
        expect(sum).toEqual(whole.timing());
      }),
    );
  });

  test("in each scene, the speakers' words and the words no one says add up to every word spoken", () => {
    fc.assert(
      fc.property(lyricScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        // A scene's blocks run to the next scene or section, or the end of the body.
        const starts = [...index.scenes, ...index.sections].map((u) => u.block);
        for (const scene of index.scenes) {
          const to = Math.min(bodyEnd(doc), ...starts.filter((b) => b > scene.block));
          const blocks = doc.blocks.slice(scene.block, to);
          const spoken = blocks.reduce((sum, b) => sum + blockTiming(b, template).spoken, 0);
          const credited = Object.values(scene.spokenBy).reduce((sum, n) => sum + n, 0);
          expect(credited + unattributed(blocks, template)).toBe(spoken);
        }
      }),
    );
  });

  test('speeches add up to spokenBy for every scene and the opening', () => {
    fc.assert(
      fc.property(speechScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        const units = [...(index.opening ? [index.opening] : []), ...index.scenes];
        for (const unit of units) {
          const sums: Record<string, number> = {};
          for (const s of unit.speeches) sums[s.name] = (sums[s.name] ?? 0) + s.words;
          expect(sums).toEqual(unit.spokenBy);
          for (const s of unit.speeches) expect(doc.blocks[s.block]?.kind).toBe('character');
        }
        // Every cue is one speech, in the opening or a scene, once (these scripts put no speech
        // in a section's opening after the first scene).
        const cues = doc.blocks.flatMap((b, i) =>
          b.kind === 'character' && i < bodyEnd(doc) ? [i] : [],
        );
        expect(units.flatMap((u) => u.speeches.map((s) => s.block))).toEqual(cues);
        expect(index.opening === null).toBe(
          !cues.some((i) => i < (index.scenes[0]?.block ?? Number.POSITIVE_INFINITY)),
        );
      }),
    );
  });

  test('timing is unchanged by recording speeches', () => {
    fc.assert(
      fc.property(speechScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        /** v0.19.0's tally of blocks `from` up to `to`. */
        const reference = (from: number, to: number) => {
          const t = new ReferenceTally(template);
          for (let i = from; i < to; i++) t.add(doc.blocks[i] as never);
          return t;
        };
        const end = bodyEnd(doc);
        const starts = [...index.scenes, ...index.sections].map((u) => u.block);
        for (const scene of index.scenes) {
          const to = Math.min(end, ...starts.filter((b) => b > scene.block));
          const old = reference(scene.block, to);
          expect(scene.timing).toEqual(old.timing());
          const byKey = Object.fromEntries(old.spokenBy());
          for (const [name, words] of Object.entries(scene.spokenBy)) {
            expect(words).toBe(byKey[name.toUpperCase()]);
          }
        }
        if (index.opening) {
          const old = reference(0, Math.min(end, index.scenes[0]?.block ?? end));
          expect(index.opening.timing).toEqual(old.timing());
        }
        const whole = new TimingTally(template);
        doc.blocks.forEach((b, i) => {
          whole.add(b, i);
        });
        expect(whole.timing()).toEqual(reference(0, doc.blocks.length).timing());
        expect(new Map(whole.spokenBy())).toEqual(
          new Map(reference(0, doc.blocks.length).spokenBy()),
        );
      }),
    );
  });
});
