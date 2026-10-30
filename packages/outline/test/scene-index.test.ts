import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { lint } from '@drafter/lint';
import { fieldNote, insertNote } from '@drafter/notes';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { type Section, sceneIndex } from '../src';
import { anyScript } from './arbitraries';
import {
  apply,
  headings,
  indexOf,
  SAMPLE_SCREENPLAY,
  SAMPLE_STAGE_PLAY,
  screenplay,
  stagePlay,
} from './helpers';

const THREE = `Title: The Call
Author: A. Writer

[[An opening note.]]

INT. HALL - DAY #12A#

ANN
Hello.

EXT. YARD - NIGHT

BEN
Hi.

CUT TO:

INT. CAR - MOVING

Driving.
`;

describe('sceneIndex', () => {
  test("lists a screenplay's scenes in order with headings, numbers, and spans", () => {
    const { doc, index } = indexOf(THREE);
    expect(headings(index)).toEqual(['INT. HALL - DAY', 'EXT. YARD - NIGHT', 'INT. CAR - MOVING']);
    expect(index.scenes.map((s) => s.ordinal)).toEqual([1, 2, 3]);
    expect(index.scenes.map((s) => s.number)).toEqual(['12A', null, null]);
    const [hall, yard, car] = index.scenes;
    expect(doc.source.slice(hall?.span.from, hall?.span.to)).toBe(
      'INT. HALL - DAY #12A#\n\nANN\nHello.',
    );
    // A transition closing a scene is part of it.
    expect(doc.source.slice(yard?.span.from, yard?.span.to)).toBe(
      'EXT. YARD - NIGHT\n\nBEN\nHi.\n\nCUT TO:',
    );
    expect(doc.source.slice(car?.span.from, car?.span.to)).toBe('INT. CAR - MOVING\n\nDriving.');
    expect(index.items.map((i) => i.kind)).toEqual(['scene', 'scene', 'scene']);
    expect(index.tree.map((n) => n.item.kind)).toEqual(['scene', 'scene', 'scene']);
  });

  test("lists a stage play's ## scenes inside its acts", () => {
    const { index } = indexOf(SAMPLE_STAGE_PLAY);
    expect(headings(index)).toEqual(['Scene 1', 'Scene 2']);
    expect(index.sections.map((s) => s.title)).toEqual(['Act One']);
    const [act] = index.tree;
    expect(act?.item.kind).toBe('section');
    expect(act && 'children' in act ? act.children.map((c) => c.item.kind) : []).toEqual([
      'scene',
      'scene',
    ]);
    const act1 = index.sections[0] as Section;
    expect(index.scenes.every((s) => s.sections.join() === String(act1.block))).toBe(true);
    expect(act1.scenes).toBe(2);
  });

  test('a stage play starts a new act with #, and an INT. line is not a scene there', () => {
    const play = `# One\n\n## First\n\nINT. NOT A SCENE\n\nWords.\n\n# Two\n\n## Second\n\nMore.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n`;
    const { index } = indexOf(play);
    expect(headings(index)).toEqual(['First', 'Second']);
    expect(index.sections.map((s) => [s.title, s.scenes])).toEqual([
      ['One', 1],
      ['Two', 1],
    ]);
  });

  test('nests scenes under the innermost section', () => {
    const source = `# Act One\n\n= The setup.\n\n## Arrival\n\nINT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\n## Trouble\n\nINT. C - DAY\n\nThree.\n\n# Act Two\n\nINT. D - DAY\n\nFour.\n`;
    const { doc, index } = indexOf(source);
    const titles = (nodes: typeof index.tree): unknown[] =>
      nodes.map((n) =>
        'children' in n ? [(n.item as Section).title, titles(n.children)] : n.item.heading,
      );
    expect(titles(index.tree)).toEqual([
      [
        'Act One',
        [
          ['Arrival', ['INT. A - DAY', 'INT. B - DAY']],
          ['Trouble', ['INT. C - DAY']],
        ],
      ],
      ['Act Two', ['INT. D - DAY']],
    ]);
    const [actOne, arrival] = index.sections;
    // A section's intro is its heading and what comes before its first child.
    expect(doc.source.slice(actOne?.span.from, actOne?.introEnd)).toBe('# Act One\n\n= The setup.');
    expect(doc.source.slice(actOne?.span.from, actOne?.span.to)).toMatch(
      /^# Act One[\s\S]*Three\.$/,
    );
    expect(arrival?.parent).toBe(actOne?.block);
    expect(actOne?.scenes).toBe(3);
    expect(index.scenes[2]?.sections).toEqual([actOne?.block, index.sections[2]?.block]);
  });

  test('keeps the title page and an opening note in the preamble', () => {
    const { doc, index } = indexOf(THREE);
    expect(index.preamble).not.toBeNull();
    expect(doc.source.slice(index.preamble?.from, index.preamble?.to)).toBe(
      'Title: The Call\nAuthor: A. Writer\n\n[[An opening note.]]',
    );
    expect(indexOf('INT. A - DAY\n\nOne.\n').index.preamble).toBeNull();
    // A cold open's action before the first heading is preamble too.
    const cold = indexOf('A door slams.\n\nINT. A - DAY\n\nOne.\n');
    expect(cold.doc.source.slice(cold.index.preamble?.from, cold.index.preamble?.to)).toBe(
      'A door slams.',
    );
  });

  test('leaves the metadata block and the beat board out of the last scene', () => {
    const source =
      'INT. A - DAY\n\nOne.\n\n/* beat board\n= An idea.\n*/\n\n/* drafter\n{"v":1}\n*/\n';
    const { doc, index } = indexOf(source);
    const [a] = index.scenes;
    expect(doc.source.slice(a?.span.from, a?.span.to)).toBe('INT. A - DAY\n\nOne.');
  });

  test('reads the first synopsis and every synopsis', () => {
    const { index } = indexOf(
      'INT. A - DAY\n\n= First.\n\nAction.\n\n= Second.\n\nINT. B - DAY\n\nNone.\n',
    );
    expect(index.scenes[0]?.synopses.map((s) => s.text)).toEqual(['First.', 'Second.']);
    expect(index.scenes[1]?.synopses).toEqual([]);
  });

  test('reads [[Color: Blue]] in any case, anywhere in the scene', () => {
    const source =
      'INT. A - DAY\n\n= Syn.\n[[color :  Blue ]]\n\nINT. B - DAY\n\nShe waits. [[COLOR: teal]] [[Color: red]]\n\nINT. C - DAY\n\nNone.\n';
    const { doc, index } = indexOf(source);
    expect(index.scenes.map((s) => s.color?.value ?? null)).toEqual(['blue', 'teal', null]);
    const a = index.scenes[0];
    expect(doc.source.slice(a?.color?.span.from, a?.color?.span.to)).toBe('[[color :  Blue ]]');
  });

  test('reads every field in any case, anywhere in the scene', () => {
    const source =
      'INT. A - DAY\n\n= Syn.\n[[color: Blue]]\n[[GOAL: Win the bet.]]\n\nShe waits. [[conflict :  The clock. ]]\n\n[[Outcome: She loses.]] [[shift: hope → dread]]\n[[Storyline: A]]\n\nINT. B - DAY\n\nNone. [[Goal:]]\n';
    const { doc, index } = indexOf(source);
    const [a, b] = index.scenes;
    const read = Object.fromEntries(
      Object.entries(a?.fields ?? {}).map(([key, field]) => [
        key,
        [field.body, doc.source.slice(field.span.from, field.span.to)],
      ]),
    );
    expect(read).toEqual({
      color: ['Blue', '[[color: Blue]]'],
      goal: ['Win the bet.', '[[GOAL: Win the bet.]]'],
      conflict: ['The clock.', '[[conflict :  The clock. ]]'],
      outcome: ['She loses.', '[[Outcome: She loses.]]'],
      shift: ['hope → dread', '[[shift: hope → dread]]'],
      storyline: ['A', '[[Storyline: A]]'],
    });
    // An empty field is no field, as an empty color is no color.
    expect(b?.fields).toEqual({});
    expect(a?.color?.value).toBe('blue');
  });

  test('the first of two Goals wins', () => {
    const { index } = indexOf(
      'INT. A - DAY\n\nAction. [[Goal: First.]]\n\n[[goal: Second.]]\n\nINT. B - DAY\n\n[[Goal: Third.]]\n',
    );
    expect(index.scenes.map((s) => s.fields.goal?.body)).toEqual(['First.', 'Third.']);
  });

  test('reads storylines from every Storyline note', () => {
    const { index } = indexOf(
      'INT. A - DAY\n\n[[Storyline: A, B]]\n\nAction. [[storyline :  b , C,, ]]\n\n[[Storyline:]]\n\nINT. B - DAY\n\nNone.\n',
    );
    expect(index.scenes.map((s) => s.storylines)).toEqual([['A', 'B', 'C'], []]);
    expect(index.scenes[0]?.fields.storyline?.body).toBe('A, B');
  });

  test('lists setups and payoffs as marks', () => {
    const source =
      'INT. A - DAY\n\nA letter sticks out. [[Setup: the letter]] [[Setup:]]\n\nShe reads it. [[PAYOFF :  The Letter ]]\n\nINT. B - DAY\n\nNone.\n';
    const { doc, index } = indexOf(source);
    const marks = index.scenes[0]?.marks ?? [];
    expect(marks.map((m) => [m.key, m.label, doc.source.slice(m.span.from, m.span.to)])).toEqual([
      ['setup', 'the letter', '[[Setup: the letter]]'],
      ['payoff', 'The Letter', '[[PAYOFF :  The Letter ]]'],
    ]);
    expect(index.scenes[1]?.marks).toEqual([]);
  });

  test('lists who speaks, once each, in order', () => {
    const { index } = indexOf(
      'INT. A - DAY\n\nANN\nHi.\n\nBEN (V.O.)\nYo.\n\nann\n\nANN\nAgain.\n\nINT. B - DAY\n\nQuiet.\n',
    );
    expect(index.scenes[0]?.speakers).toEqual(['ANN', 'BEN']);
    expect(index.scenes[1]?.speakers).toEqual([]);
    expect(index.scenes[0]?.words).toBeGreaterThan(0);
  });

  test('each scene lists its speeches in order', () => {
    const { index } = indexOf(
      'INT. A - DAY\n\nANN\nHi there.\n\nBEN (V.O.)\nYo.\n\n@ann\n(nods)\n\nINT. B - DAY\n\nQuiet.\n',
    );
    expect(index.scenes[0]?.speeches).toEqual([
      { name: 'ANN', block: 1, words: 2 },
      { name: 'BEN', block: 3, words: 1 },
      // As `speakers` gives the name: the scene's first spelling.
      { name: 'ANN', block: 5, words: 0 },
    ]);
    expect(index.scenes[1]?.speeches).toEqual([]);
    expect(index.opening).toBeNull();
  });

  test('speeches before the first scene are the opening', () => {
    const { index } = indexOf(
      'Title: Cold\n\nA phone rings.\n\n@Tess\nWho is this?\n\n@VOICE ^\nYou know who.\n\nINT. A - DAY\n\nTESS\nHello?\n',
    );
    expect(index.opening).toEqual({
      speeches: [
        { name: 'Tess', block: 1, words: 3 },
        { name: 'VOICE', block: 3, words: 3 },
      ],
      spokenBy: { Tess: 3, VOICE: 3 },
      timing: { spoken: 3, actionLines: 1 },
    });
    expect(index.scenes[0]?.speeches).toEqual([{ name: 'TESS', block: 6, words: 1 }]);
    // A section before the first scene is still the opening: a cold open under an act's heading.
    const act = indexOf('# Act One\n\nTESS\nWho is this?\n\nINT. A - DAY\n\nHe waits.\n');
    expect(act.index.opening?.speeches).toEqual([{ name: 'TESS', block: 1, words: 3 }]);
  });

  test('no opening without a speech before the first scene', () => {
    expect(indexOf(THREE).index.opening).toBeNull();
    expect(indexOf('A door slams.\n\nINT. A - DAY\n\nANN\nHi.\n').index.opening).toBeNull();
    expect(indexOf('').index.opening).toBeNull();
    // A script with no scene at all: its speeches are all the opening's.
    expect(indexOf('ANN\nHi.\n').index.opening?.speeches).toEqual([
      { name: 'ANN', block: 0, words: 1 },
    ]);
  });

  test('a forced @McCLANE keeps its name', () => {
    const { index } = indexOf('INT. A - DAY\n\n@McCLANE\nYippee.\n\nMCCLANE\nAgain.\n');
    expect(index.scenes[0]?.speeches).toEqual([
      { name: 'McCLANE', block: 1, words: 1 },
      { name: 'McCLANE', block: 3, words: 1 },
    ]);
    expect(index.scenes[0]?.spokenBy).toEqual({ McCLANE: 2 });
  });

  test('places scenes on pages and counts eighths when the layout matches', () => {
    // The scene-list module's figures for the same sample: page 1, 1 1/8 pages; page 2, 2/8.
    const { index } = indexOf(SAMPLE_SCREENPLAY, { pages: true });
    expect(index.scenes.map((s) => [s.heading, s.pages?.page, s.pages?.eighths])).toEqual([
      ['INT. KITCHEN - NIGHT', 1, 9],
      ['EXT. BACK PORCH - LATER', 2, 2],
    ]);
  });

  test('has no pages when the layout is for other text', () => {
    const other = parse('INT. A - DAY\n\nOne.\n');
    const layout = paginate(other, screenplay);
    const doc = parse(SAMPLE_SCREENPLAY);
    const index = sceneIndex(doc, screenplay, layout);
    expect(index.scenes.every((s) => s.pages === null)).toBe(true);
    expect(index.sections.every((s) => s.eighths === null)).toBe(true);
  });

  test("counts a section's scenes and length", () => {
    const { index } = indexOf(SAMPLE_SCREENPLAY, { pages: true });
    expect(index.sections.map((s) => [s.title, s.scenes, s.eighths])).toEqual([['Act One', 2, 11]]);
  });

  test("each scene's timing sums its blocks, and each section's its scenes", () => {
    const source = [
      '# Act One',
      '',
      '## Arrival',
      '',
      'INT. A - DAY',
      '',
      'He runs.',
      'She follows.',
      '',
      'ANN',
      '(softly)',
      'Not now, not tonight.',
      '',
      'INT. B - DAY',
      '',
      `${'x'.repeat(61)}`,
      '',
      '# Act Two',
      '',
      'INT. C - DAY',
      '',
      'BEN',
      'Hi.',
      '',
    ].join('\n');
    const { index } = indexOf(source);
    expect(index.scenes.map((s) => s.timing)).toEqual([
      { spoken: 4, actionLines: 2 },
      { spoken: 0, actionLines: 2 },
      { spoken: 1, actionLines: 0 },
    ]);
    expect(index.sections.map((s) => [s.title, s.timing])).toEqual([
      ['Act One', { spoken: 4, actionLines: 4 }],
      ['Arrival', { spoken: 4, actionLines: 4 }],
      ['Act Two', { spoken: 1, actionLines: 0 }],
    ]);
    // A section with no scenes takes no time.
    expect(indexOf('# Empty\n\nNothing here yet.\n').index.sections[0]?.timing).toEqual({
      spoken: 0,
      actionLines: 0,
    });
  });

  test('reads a play with its own template', () => {
    // A play read with the screenplay template has no scenes: its ## lines are sections there.
    const play = parse(SAMPLE_STAGE_PLAY);
    expect(sceneIndex(play, screenplay).scenes).toEqual([]);
    expect(sceneIndex(play, stagePlay).scenes).toHaveLength(2);
  });
});

describe('duplicate-field', () => {
  const KEYS = ['goal', 'conflict', 'outcome', 'shift', 'color', 'storyline'] as const;
  const noteArb = fc.tuple(fc.nat(), fc.constantFrom(...KEYS), fc.constantFrom('', 'one', 'two'));

  test('agrees with the scene index on which notes are second', () => {
    fc.assert(
      fc.property(anyScript, fc.array(noteArb, { maxLength: 10 }), (script, picks) => {
        let source = script;
        for (const [at, key, body] of picks) {
          const text =
            body === '' ? `[[${key[0]?.toUpperCase()}${key.slice(1)}:]]` : fieldNote(key, body);
          source = apply(source, insertNote(parse(source), at % (source.length + 1), text).changes);
        }
        const { doc, index, template } = indexOf(source);
        // The second and later field notes of a scene, by the index: every non-empty field note
        // inside a scene that isn't the one it reads (Storyline notes all count, so none is second).
        const expected: number[] = [];
        for (const scene of index.scenes) {
          for (const region of doc.regions) {
            if (region.kind !== 'note' || !region.closed) continue;
            if (region.span.from < scene.span.from || region.span.from >= scene.span.to) continue;
            const key = KEYS.find((k) => {
              const m = new RegExp(`^\\[\\[\\s*${k}\\s*:`, 'i').exec(
                doc.source.slice(region.span.from, region.span.to),
              );
              return m !== null;
            });
            if (!key || key === 'storyline') continue;
            const inner = doc.source.slice(region.span.from + 2, region.span.to - 2);
            if (inner.slice(inner.indexOf(':') + 1).trim() === '') continue;
            if (scene.fields[key]?.span.from !== region.span.from) expected.push(region.span.from);
          }
        }
        const found = lint(doc, template)
          .filter((d) => d.ruleId === 'duplicate-field')
          .map((d) => d.span.from);
        expect(found).toEqual(expected.sort((a, b) => a - b));
      }),
    );
  });
});
