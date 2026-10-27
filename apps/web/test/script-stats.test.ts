import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import type { MdNode } from '../app/markdown/render';
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
      ['INT. HALL - DAY', '', 'BRICK', 'Screw retirement.', '', 'STEEL ^', 'Screw it all.', ''].join(
        '\n',
      ),
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

  test('is empty without characters', () => {
    expect(characterTable(parse('INT. A - DAY\n\nNobody talks.\n'))).toEqual([]);
  });
});

describe('the scene heading split', () => {
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
