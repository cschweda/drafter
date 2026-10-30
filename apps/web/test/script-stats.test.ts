import { parse } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import type { MdNode } from '../app/markdown/render';
import { countScript } from '../app/stats/count';
import { headingCount, headingSplit, readingMinutes } from '../app/stats/script-stats';

// Who speaks, and how much, is the cast's now (stats-characters.test.ts); the window's own pass
// over the speeches is gone.
describe('the scene count', () => {
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
        '/* drafter',
        '{ "v": 1, "template": "stage-play-standard" }',
        '*/',
        '',
      ].join('\n'),
    );
    expect(countScript(play, null, builtins['stage-play-standard'] as Template).scenes).toBe(2);
    // In a screenplay a ## section is only an outline marker.
    const screenplay = parse('## Part\n\nINT. A - DAY\n\nANN\nHi.\n');
    expect(countScript(screenplay, null, builtins['us-screenplay'] as Template).scenes).toBe(1);
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
