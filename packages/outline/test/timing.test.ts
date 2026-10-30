import { type Block, parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  ACTION_SECONDS_PER_LINE,
  addTiming,
  blockTiming,
  DEFAULT_WORDS_PER_MINUTE,
  estimateSeconds,
  sceneIndex,
  type Timing,
  TimingTally,
} from '../src';
import { screenplay, stagePlay } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

const PLAY_META = '\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';

/** The timing of each block of `source`, by kind. */
function timed(source: string, template = screenplay): Array<[Block['kind'], Timing]> {
  return parse(source).blocks.map((block) => [block.kind, blockTiming(block, template)]);
}

/** The sum over every block of `source`. */
function total(source: string, template = screenplay): Timing {
  return parse(source)
    .blocks.map((block) => blockTiming(block, template))
    .reduce(addTiming, { spoken: 0, actionLines: 0 });
}

const NONE: Timing = { spoken: 0, actionLines: 0 };

describe('blockTiming', () => {
  test('dialogue and lyrics are spoken words', () => {
    expect(timed('MARGARET\nYou said you would call.\n')).toEqual([
      ['character', NONE],
      ['dialogue', { spoken: 5, actionLines: 0 }],
    ]);
    expect(timed('~Happy birthday to you\n~And many more\n')).toEqual([
      ['lyric', { spoken: 7, actionLines: 0 }],
    ]);
    // A note inside a speech is not spoken; a line of only a note is no line.
    expect(total('DANNY\nI lost [[a beat]] my phone.\n[[only a note]]\nSorry.\n')).toEqual({
      spoken: 5,
      actionLines: 0,
    });
  });

  test('parentheticals, cues, headings, transitions, centered text, notes, and the boneyard take no time', () => {
    const source = [
      'INT. KITCHEN - NIGHT',
      '',
      'MARGARET',
      '(quietly)',
      'Hi.',
      '',
      'CUT TO:',
      '',
      '> THE END <',
      '',
      '[[A note on its own.]]',
      '',
      '/* Cut: a whole scene. */',
      '',
      '= A synopsis.',
      '',
      '# A section',
      '',
      '===',
      '',
    ].join('\n');
    const rows = timed(source);
    expect(rows.map(([kind]) => kind)).toEqual([
      'scene_heading',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
      'centered',
      'note',
      'boneyard',
      'synopsis',
      'section',
      'page_break',
    ]);
    for (const [kind, timing] of rows) {
      expect(timing).toEqual(kind === 'dialogue' ? { spoken: 1, actionLines: 0 } : NONE);
    }
  });

  test("an action line counts its wrapped lines at the role's width", () => {
    // A screenplay's action is 60 columns wide: 60 fit one line, 61 take two.
    expect(total(`${'a'.repeat(60)}\n`)).toEqual({ spoken: 0, actionLines: 1 });
    expect(total(`${'a'.repeat(61)}\n`)).toEqual({ spoken: 0, actionLines: 2 });
    // Each source line is at least one; a paragraph of three short lines is three.
    expect(total('He runs.\nShe follows.\nThe door slams.\n')).toEqual({
      spoken: 0,
      actionLines: 3,
    });
    // A play's stage directions are 50 wide.
    expect(total(`${'b'.repeat(50)}\n${PLAY_META}`, stagePlay)).toEqual({
      spoken: 0,
      actionLines: 1,
    });
    expect(total(`${'b'.repeat(51)}\n${PLAY_META}`, stagePlay)).toEqual({
      spoken: 0,
      actionLines: 2,
    });
    // Emphasis marks and notes don't print, so they take no room.
    expect(total(`**${'c'.repeat(60)}**[[a note]]\n`)).toEqual({ spoken: 0, actionLines: 1 });
  });

  test("a forced name's speech is spoken", () => {
    expect(timed('@McCLANE\nYippee ki-yay.\n')).toEqual([
      ['character', NONE],
      ['dialogue', { spoken: 2, actionLines: 0 }],
    ]);
  });

  test('a heading alone is no time', () => {
    expect(total('INT. HALL - DAY\n')).toEqual(NONE);
    const index = sceneIndex(parse('INT. HALL - DAY\n\nEXT. YARD - NIGHT\n'), screenplay);
    expect(index.scenes.map((s) => s.timing)).toEqual([NONE, NONE]);
    expect(estimateSeconds(NONE, DEFAULT_WORDS_PER_MINUTE)).toBe(0);
  });
});

/** The tally of every block of `source`: dual dialogue counted once. */
function tally(source: string, template = screenplay): TimingTally {
  const t = new TimingTally(template);
  for (const block of parse(source).blocks) t.add(block);
  return t;
}

describe('dual dialogue', () => {
  test('a pair of speeches side by side takes as long as the longer one', () => {
    const pair = 'ANN\nOne two three.\n\nBEN ^\nFour five.\n';
    // Both are spoken, at the same time: the pair is the longer speech, not both.
    expect(total(pair).spoken).toBe(5);
    expect(tally(pair).timing()).toEqual({ spoken: 3, actionLines: 0 });
    // Either side may be the longer.
    expect(tally('ANN\nOne.\n\nBEN ^\nTwo three four five.\n').timing().spoken).toBe(4);
    // A parenthetical and a second dialogue block are part of the speech.
    expect(
      tally('ANN\n(low)\nOne two.\n\nBEN ^\nThree.\n(beat)\nFour five six.\n').timing().spoken,
    ).toBe(4);
  });

  test('a ^ with no speech free to pair with counts in full, as it prints on its own', () => {
    // After action, at the top, and after a pair (a third ^ can't join it).
    expect(tally('He runs.\n\nBEN ^\nFour five.\n').timing()).toEqual({
      spoken: 2,
      actionLines: 1,
    });
    expect(tally('BEN ^\nFour five.\n').timing().spoken).toBe(2);
    expect(
      tally('ANN\nOne two three.\n\nBEN ^\nFour five.\n\nCAL ^\nSix seven.\n').timing().spoken,
    ).toBe(3 + 2);
    // A note between them prints nothing, so they still pair; a page break or a section parts them.
    expect(tally('ANN\nOne two three.\n\n[[a note]]\n\nBEN ^\nFour.\n').timing().spoken).toBe(3);
    expect(tally('ANN\nOne two three.\n\n===\n\nBEN ^\nFour.\n').timing().spoken).toBe(4);
    expect(tally('ANN\nOne two three.\n\n# Two\n\nBEN ^\nFour.\n').timing().spoken).toBe(4);
  });

  test('each speaker is credited with their own words, a pair included', () => {
    const t = tally(
      'ANN\nOne two three.\n\nBEN ^\nFour five.\n\nAnn sits.\n\n@Ann\nSix.\n\n@McCLANE\n(dry)\n',
    );
    // By the cue's name in capitals; a speaker with only a parenthetical has spoken nothing.
    expect(Object.fromEntries(t.spokenBy())).toEqual({ ANN: 4, BEN: 2, MCCLANE: 0 });
    expect(t.timing().spoken).toBe(4);
    // A lyric with no cue before it is spoken, by no one.
    const lyric = tally('~Happy birthday to you\n');
    expect(lyric.timing().spoken).toBe(4);
    expect(lyric.spokenBy().size).toBe(0);
  });

  test("the scene index counts a pair once, and keeps each speaker's words", () => {
    const source = [
      'INT. A - DAY',
      '',
      'ANN',
      'One two three.',
      '',
      '@Ben ^',
      'Four five.',
      '',
      'INT. B - DAY',
      '',
      'He runs.',
      '',
    ].join('\n');
    const index = sceneIndex(parse(source), screenplay);
    expect(index.scenes.map((s) => s.timing)).toEqual([
      { spoken: 3, actionLines: 0 },
      { spoken: 0, actionLines: 1 },
    ]);
    // Keyed by each speaker's name as `speakers` gives it.
    expect(index.scenes.map((s) => s.spokenBy)).toEqual([{ ANN: 3, Ben: 2 }, {}]);
    expect(index.scenes[0]?.speakers).toEqual(['ANN', 'Ben']);
  });
});

describe('estimateSeconds', () => {
  test('estimateSeconds adds speech at the pace and 1.5 s a line', () => {
    expect(ACTION_SECONDS_PER_LINE).toBe(1.5);
    expect(DEFAULT_WORDS_PER_MINUTE).toBe(150);
    expect(estimateSeconds({ spoken: 150, actionLines: 0 }, 150)).toBe(60);
    expect(estimateSeconds({ spoken: 0, actionLines: 40 }, 150)).toBe(60);
    expect(estimateSeconds({ spoken: 100, actionLines: 10 }, 200)).toBe(30 + 15);
  });

  test('addTiming adds each part', () => {
    expect(addTiming({ spoken: 3, actionLines: 2 }, { spoken: 4, actionLines: 5 })).toEqual({
      spoken: 7,
      actionLines: 7,
    });
  });
});

describe('timing in the scene index', () => {
  test(
    'the scene index with timing stays linear in the length of the script',
    () => {
      const scene = (n: number) =>
        `INT. ROOM ${n} - DAY\n\nMara crosses to the window and looks down at the street, where the rain has not stopped since morning.\n\nMARA\nIf he comes back, tell him I waited.\n\n`;
      const make = (n: number) => {
        let text = '';
        for (let i = 0; i < n; i++) text += scene(i);
        const doc = parse(text);
        for (const block of doc.blocks) for (const line of block.lines) void line.inline;
        return doc;
      };
      const { growth } = scaling(make, (doc) => sceneIndex(doc, screenplay), 500);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
