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
  return countScript(doc, paginate(doc, template));
};

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
    expect(countScript(doc, layout)).toEqual({ pages: 1.4, scenes: 2, words: 261, minutes: 1 });
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

  test('has no pages without a layout, and leaves a lone title page out', () => {
    const doc = parse('Title: Only\n');
    expect(countScript(doc, null)).toEqual({ pages: 0, scenes: 0, words: 1, minutes: 0 });
    expect(countScript(doc, paginate(doc, template)).pages).toBe(0);
  });

  test('measures the last page by how far down it runs', () => {
    // A page is 54 lines: 27 lines of one-line action, each followed by a blank, is half a page.
    const line = 'Rain.\n\n';
    const half = count(line.repeat(14)); // 14 lines of text and 13 blanks between: 27 lines
    expect(half.pages).toBe(0.5);
    expect(half.minutes).toBe(1);
  });

  test('remembers its answer for the same parse and layout', () => {
    const doc = parse(sample);
    const layout = paginate(doc, template);
    expect(countScript(doc, layout)).toBe(countScript(doc, layout));
    // A newer layout of the same parse is its own answer.
    const lagging: Layout = { ...layout, pages: layout.pages.slice(0, 2) };
    // (With one body page left, that page is the last, and it runs nine tenths of the way down.)
    expect(countScript(doc, lagging).pages).toBe(0.9);
    expect(countScript(doc, layout).pages).toBe(1.4);
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
    const first = countScript(doc, layout);
    const cold = performance.now() - start;
    const again = performance.now();
    for (let i = 0; i < 1000; i++) countScript(doc, layout);
    const warm = performance.now() - again;
    expect(first.scenes).toBe(1200);
    // A generous bound, so a loaded machine doesn't flake: counting is a pass over the blocks.
    expect(cold).toBeLessThan(250);
    expect(warm).toBeLessThan(100);
  });
});
