import { parse } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import type { MdNode } from '../app/markdown/render';
import { countScript } from '../app/stats/count';
import {
  characterTable,
  headingCount,
  headingSplit,
  readingMinutes,
} from '../app/stats/script-stats';

describe('the character table', () => {
  test('counts speeches, scenes, and words of dialogue, merging extensions', () => {
    const doc = parse(
      [
        'INT. KITCHEN - NIGHT',
        '',
        'MARGARET',
        '(quietly)',
        'You said you would call.',
        '',
        'DANNY (O.S.)',
        'I lost my phone.',
        '',
        "MARGARET (CONT'D)",
        'Of course.',
        '',
        'EXT. YARD - DAY',
        '',
        'MARGARET',
        'Go home.',
        '',
      ].join('\n'),
    );
    expect(characterTable(doc)).toEqual([
      // Parentheticals aren't dialogue: 5 + 2 + 2 words.
      { name: 'MARGARET', speeches: 3, scenes: 2, words: 9 },
      { name: 'DANNY', speeches: 1, scenes: 1, words: 4 },
    ]);
  });

  test('takes a forced name as typed, and merges it with the same name in capitals', () => {
    const doc = parse(
      ['INT. HALL - DAY', '', '@McCLANE', 'Yippee.', '', 'MCCLANE', 'Again.', ''].join('\n'),
    );
    expect(characterTable(doc)).toEqual([{ name: 'McCLANE', speeches: 2, scenes: 1, words: 2 }]);
  });

  test('counts both speakers of dual dialogue', () => {
    const doc = parse(
      [
        'INT. HALL - DAY',
        '',
        'BRICK',
        'Screw retirement.',
        '',
        'STEEL ^',
        'Screw it all.',
        '',
      ].join('\n'),
    );
    expect(characterTable(doc)).toEqual([
      { name: 'STEEL', speeches: 1, scenes: 1, words: 3 },
      { name: 'BRICK', speeches: 1, scenes: 1, words: 2 },
    ]);
  });

  test('counts a cue with no dialogue as a speech of no words, and no scene before the first heading', () => {
    const doc = parse(['BOB', '(shrugs)', '', 'INT. HALL - DAY', '', 'ANN', 'Hi.', ''].join('\n'));
    expect(characterTable(doc)).toEqual([
      { name: 'ANN', speeches: 1, scenes: 1, words: 1 },
      { name: 'BOB', speeches: 1, scenes: 0, words: 0 },
    ]);
  });

  test('sorts by speeches, then words, then first appearance; notes in dialogue are not words', () => {
    const doc = parse(
      [
        'INT. A - DAY',
        '',
        'ZED',
        'One two [[a note here]] three.',
        '',
        'AMY',
        'One.',
        '',
        'CAL',
        'One.',
        '',
        'AMY',
        'Two.',
        '',
      ].join('\n'),
    );
    expect(characterTable(doc).map((row) => [row.name, row.words])).toEqual([
      ['AMY', 2],
      ['ZED', 3],
      ['CAL', 1],
    ]);
  });

  test('in a stage play, a scene is a ## section, as the stage-play template has it', () => {
    const play = parse(
      [
        'Title: The Call',
        '',
        '# Act One',
        '',
        '## Scene 1',
        '',
        'MARGARET',
        'You said you would call.',
        '',
        '## Scene 2',
        '',
        'MARGARET',
        'Of course.',
        '',
        'DANNY',
        'Look inside.',
        '',
        '/* drafter',
        '{ "v": 1, "template": "stage-play-standard" }',
        '*/',
        '',
      ].join('\n'),
    );
    expect(characterTable(play)).toEqual([
      { name: 'MARGARET', speeches: 2, scenes: 2, words: 7 },
      { name: 'DANNY', speeches: 1, scenes: 1, words: 2 },
    ]);
    // The scene count says the same.
    expect(countScript(play, null, builtins['stage-play-standard'] as Template).scenes).toBe(2);
    // In a screenplay a ## section is only an outline marker.
    const screenplay = parse('## Part\n\nINT. A - DAY\n\nANN\nHi.\n');
    expect(characterTable(screenplay)[0]?.scenes).toBe(1);
    expect(countScript(screenplay, null, builtins['us-screenplay'] as Template).scenes).toBe(1);
    expect(builtins['stage-play-standard']).toBeDefined();
  });

  test('is empty without characters', () => {
    expect(characterTable(parse('INT. A - DAY\n\nNobody talks.\n'))).toEqual([]);
  });
});

describe('the scene heading split', () => {
  test('reads a heading with a very long run of spaces at once', () => {
    // A pattern split there backtracked once per space.
    const doc = parse(`INT. HALL${' '.repeat(100_000)}x - NIGHT\n\nShe waits.\n`);
    const started = performance.now();
    const split = headingSplit(doc);
    expect(performance.now() - started).toBeLessThan(500);
    expect(split.time.night).toBe(1);
  });

  test('sorts headings by place and time of day', () => {
    const doc = parse(
      [
        'INT. KITCHEN - NIGHT',
        '',
        'EXT. YARD - DAY',
        '',
        'INT./EXT. CAR - DAY',
        '',
        'I/E TRUCK - NIGHT',
        '',
        'EST. CITY - DAWN',
        '',
        '.SNIPER SCOPE POV',
        '',
        'int. hall',
        '',
        'EXT. ROOF - NIGHT (1987)',
        '',
      ].join('\n'),
    );
    expect(headingSplit(doc)).toEqual({
      total: 8,
      // EST. is outside; INT./EXT. and I/E are both; a forced heading has no prefix.
      place: { interior: 2, exterior: 3, both: 2, other: 1 },
      // A missing time and DAWN are other; NIGHT (1987) is night.
      time: { day: 2, night: 3, other: 3 },
    });
  });

  test('reads EXT./INT. as both, and the time of day from any part after the place', () => {
    const doc = parse(
      [
        'EXT./INT. CAR - DAY',
        '',
        'INT. HOUSE - NIGHT - CONTINUOUS',
        '',
        'EXT. ROAD - DAY - LATER',
        '',
        'INT. DAY CARE - MOMENTS LATER',
        '',
      ].join('\n'),
    );
    expect(headingSplit(doc)).toEqual({
      total: 4,
      place: { interior: 2, exterior: 1, both: 1, other: 0 },
      // The place's own words (DAY CARE) are not a time.
      time: { day: 2, night: 1, other: 1 },
    });
  });

  test('a forced heading with a prefix is read by it', () => {
    const doc = parse('.INT. HALL - DAY\n\nAction.\n');
    expect(headingSplit(doc)).toEqual({
      total: 1,
      place: { interior: 1, exterior: 0, both: 0, other: 0 },
      time: { day: 1, night: 0, other: 0 },
    });
  });
});

describe('a Markdown document', () => {
  test('counts its headings', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'One' }] },
        { type: 'paragraph', children: [{ type: 'text', value: 'Text' }] },
        {
          type: 'blockquote',
          children: [{ type: 'heading', depth: 2, children: [{ type: 'text', value: 'Two' }] }],
        },
      ],
    } as MdNode;
    expect(headingCount(tree)).toBe(2);
    expect(headingCount(null)).toBe(0);
  });

  test('reads at 230 words a minute', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(114)).toBe(0);
    expect(readingMinutes(115)).toBe(1);
    expect(readingMinutes(2300)).toBe(10);
  });
});
