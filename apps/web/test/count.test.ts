import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import sample from '#samples/screenplay.fountain?raw';
import { wordsIn } from '../app/markdown/words';
import { countScript, runningTime } from '../app/stats/count';

const template = builtins['us-screenplay'] as NonNullable<(typeof builtins)['us-screenplay']>;
const count = (source: string) => {
  const doc = parse(source);
  return countScript(doc, paginate(doc, template), template);
};

/**
 * The sample's timing, worked out by hand: its 11 speeches come to 77 words (4, 7, 4, 19, 7, 4, 4,
 * 8, 7, 7, 6; the parenthetical and the cut speech in the boneyard add none), less the 7 of
 * Danny's ^ speech, which is said at the same time as Margaret's 8 and is the shorter, so 70
 * spoken; and its 11
 * action blocks to 20 lines at 60 columns (73, 133, 86, 94, 81, 81, and 103 characters wrap to 2,
 * 3, 2, 2, 2, 2, and 2; "SILENCE." and "Just the clock." are a line each, and four short lines one).
 */
const SAMPLE_TIMING = { spoken: 70, actionLines: 20 };

describe('runningTime', () => {
  test('says it in minutes, and hours past 59', () => {
    expect(runningTime(0)).toBe('Under a minute');
    expect(runningTime(1)).toBe('About 1 min');
    expect(runningTime(59)).toBe('About 59 min');
    expect(runningTime(60)).toBe('About 1 h');
    expect(runningTime(125)).toBe('About 2 h 5 min');
  });
});

describe('countScript', () => {
  test('counts the sample’s pages, scenes, and words', () => {
    // Worked out by hand from samples/screenplay.fountain:
    // - words: the title page's values are 11 (The Call, Written by, A. Writer, October 2026,
    //   A. Writer, writer@example.com), and the 27 blocks that print come to 250, a word being a
    //   run of characters between spaces ("INT. KITCHEN - NIGHT" is 4, "DANNY (O.S.)" is 2); the
    //   notes, the sections and synopsis, the boneyard, and the metadata block add none.
    // - scenes: INT. KITCHEN and EXT. BACK PORCH.
    // - pages: one full page, and a second whose last printed line is its 23rd of 54, which is
    //   0.43 of a page; the title page is left out. 1.43 is 1.4 to one decimal.
    // - minutes: a page a minute, to the whole minute.
    const doc = parse(sample);
    const layout = paginate(doc, template);
    expect(layout.pages.map((page) => page.number)).toEqual([0, 1, 2]);
    expect(countScript(doc, layout, template)).toEqual({
      pages: 1.4,
      scenes: 2,
      words: 261,
      timing: SAMPLE_TIMING,
    });
  });

  test('doesn’t count notes, boneyard, or the metadata block', () => {
    const plain = 'INT. ROOM - DAY\n\nTwo words.\n';
    const marked = [
      'INT. ROOM - DAY',
      '',
      'Two words. [[a long note that does not print at all]]',
      '',
      '[[A whole paragraph that is only a note.]]',
      '',
      '/* a cut paragraph\nof several words */',
      '',
      '# A Section',
      '= A synopsis line',
      '',
      '/* drafter {"v":1,"template":"us-screenplay"} */',
      '',
    ].join('\n');
    expect(count(plain).words).toBe(6);
    expect(count(marked).words).toBe(6);
  });

  test('counts a word the way a Markdown document does', () => {
    expect(wordsIn('four  words\nacross\tlines')).toBe(4);
    expect(wordsIn('  ')).toBe(0);
    expect(wordsIn('')).toBe(0);
  });

  test('takes as a space exactly what /\\s/ does', () => {
    // A reference count with the regular expression, character by character, as it was.
    const byRegExp = (text: string) => {
      let count = 0;
      let inWord = false;
      for (const ch of text.split('')) {
        const space = /\s/.test(ch);
        if (!space && !inWord) count++;
        inWord = !space;
      }
      return count;
    };
    // Every UTF-16 code unit, between two letters: one word if it is a space to /\s/, else two.
    for (let code = 0; code <= 0xffff; code++) {
      const ch = String.fromCharCode(code);
      expect(wordsIn(`a${ch}b`), `U+${code.toString(16).padStart(4, '0')}`).toBe(
        /\s/.test(ch) ? 2 : 1,
      );
    }
    const corpus = [
      'no break space',
      'tab\there\tand\t\tthere',
      'CRLF\r\nline\r\nbreaks\r\n',
      '表意　空白　space',
      '﻿BOM at the start',
      'em space, thin space, hair space, zero​width (not a space)',
      'line and paragraph separators, narrow no-break, math space',
      'surrogates 😀 count 😀😀 as letters',
      sample,
    ];
    for (const text of corpus) expect(wordsIn(text), text.slice(0, 20)).toBe(byRegExp(text));
  });

  test("counts the whole script's timing, the preamble included", () => {
    // A cold open before the first heading counts; the title page takes no time.
    const source = [
      'Title: The Call',
      'Author: A. Writer',
      '',
      'A phone rings in the dark.',
      '',
      'MARGARET (V.O.)',
      'Pick up. Please.',
      '',
      'INT. KITCHEN - NIGHT',
      '',
      `${'x'.repeat(61)}`,
      '',
      '@McCLANE',
      'Yippee ki-yay.',
      '',
    ].join('\n');
    const doc = parse(source);
    expect(countScript(doc, null, template).timing).toEqual({ spoken: 5, actionLines: 3 });
  });

  test('counts dual dialogue once, as the longer speech of the pair', () => {
    const pair = 'INT. HALL - DAY\n\nANN\nOne two three.\n\nBEN ^\nFour five.\n';
    expect(countScript(parse(pair), null, template).timing).toEqual({ spoken: 3, actionLines: 0 });
  });

  test('has no pages without a layout, and leaves a lone title page out', () => {
    const doc = parse('Title: Only\n');
    expect(countScript(doc, null, template)).toEqual({
      pages: 0,
      scenes: 0,
      words: 1,
      timing: { spoken: 0, actionLines: 0 },
    });
    expect(countScript(doc, paginate(doc, template), template).pages).toBe(0);
  });

  test('measures the last page by how far down it runs', () => {
    // A page is 54 lines: 27 lines of one-line action, each followed by a blank, is half a page.
    const line = 'Rain.\n\n';
    const half = count(line.repeat(14)); // 14 lines of text and 13 blanks between: 27 lines
    expect(half.pages).toBe(0.5);
  });

  test('remembers its answer for the same parse and layout', () => {
    const doc = parse(sample);
    const layout = paginate(doc, template);
    expect(countScript(doc, layout, template)).toBe(countScript(doc, layout, template));
    // A newer layout of the same parse is its own answer.
    const lagging: Layout = { ...layout, pages: layout.pages.slice(0, 2) };
    // (With one body page left, that page is the last, and it runs nine tenths of the way down.)
    expect(countScript(doc, lagging, template).pages).toBe(0.9);
    expect(countScript(doc, layout, template).pages).toBe(1.4);
  });

  test('stays cheap on a 120-page script', () => {
    const scene = [
      'INT. HOUSE - DAY',
      '',
      'A long action line that goes on for a while so the page fills up with words and words.',
      '',
      'ANNA',
      'Words said aloud, a few of them, to nobody in particular.',
      '',
    ].join('\n');
    const source = `${scene}\n`.repeat(1200);
    const doc = parse(source);
    const layout = paginate(doc, template);
    expect(layout.pages.length).toBeGreaterThan(100);
    const start = performance.now();
    const first = countScript(doc, layout, template);
    const cold = performance.now() - start;
    const again = performance.now();
    for (let i = 0; i < 1000; i++) countScript(doc, layout, template);
    const warm = performance.now() - again;
    expect(first.scenes).toBe(1200);
    // A generous bound, so a loaded machine doesn't flake: counting is a pass over the blocks.
    expect(cold).toBeLessThan(250);
    expect(warm).toBeLessThan(100);
  });
});
