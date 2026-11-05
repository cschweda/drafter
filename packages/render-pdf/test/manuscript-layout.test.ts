import { readFileSync } from 'node:fs';
import { parseMarkdown } from '@drafter/markdown';
import {
  type Manuscript,
  type ManuscriptBlock,
  manuscriptOf,
  type Run,
  resolveDetails,
  wordsLabel,
} from '@drafter/novel';
import { layoutManuscript, type ManuscriptPage } from '@drafter/render-pdf';
import type { Paper } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

const book = readFileSync(
  new URL('../../novel/test/fixtures/manuscript-book.md', import.meta.url),
  'utf8',
);

/** Every character is 6 pt wide, in every face: 72 to a body paragraph's first line, 78 to the rest. */
const measure = (text: string) => [...text].length * 6;

const KEPT = {
  byline: 'R. Vale',
  legalName: 'Rosa Vale',
  contact: ['1 Quay Lane', 'Harbourside', 'rosa@vale.example'],
};

const fixture = (kept: object = KEPT) =>
  manuscriptOf(book, parseMarkdown(book), resolveDetails(book, 'File', kept));

/** A manuscript of just these blocks, with the fixture's details. */
const of = (blocks: ManuscriptBlock[], more: Partial<Manuscript> = {}): Manuscript => ({
  ...resolveDetails(book, 'File', KEPT),
  words: 1234,
  wordsLabel: wordsLabel(1234),
  blocks,
  notes: [],
  ...more,
});

const layout = (ms: Manuscript, paper: Paper = 'letter') =>
  layoutManuscript(ms, { paper, measure });

const para = (
  text: string,
  style: 'body' | 'quote' | 'list' | 'code' = 'body',
): ManuscriptBlock => ({
  kind: 'paragraph',
  style,
  runs: [{ text }],
});

/** `n` words of four letters and a space: five characters a word. */
const words = (n: number, word = 'tide') => Array.from({ length: n }, () => word).join(' ');

type Line = ManuscriptPage['lines'][number];
const textOf = (line: Line | undefined) => (line?.runs ?? []).map((r) => r.text).join('');
const widthOf = (line: Line) => line.runs.reduce((sum, r) => sum + measure(r.text), 0);
const find = (pages: ManuscriptPage[], text: string) =>
  pages
    .flatMap((page) => page.lines.map((line) => ({ page, line })))
    .find(({ line }) => textOf(line) === text);
const centre = (line: Line) => line.x + widthOf(line) / 2;

describe('layoutManuscript: the title page', () => {
  it('names the writer top left, the word count top right, and centres the title and byline', () => {
    const pages = layout(fixture());
    const [first] = pages;
    expect(first?.number).toBe(1);
    expect(first?.header).toBeNull();
    const legal = first?.lines.find((l) => textOf(l) === 'Rosa Vale');
    expect(legal).toMatchObject({ x: 72, y: 72 });
    const count = first?.lines.find((l) => textOf(l).endsWith('words'));
    expect(count?.y).toBe(72);
    expect((count?.x ?? 0) + widthOf(count as Line)).toBeCloseTo(540, 6);
    expect(textOf(count)).toBe(fixture().wordsLabel);
    // The contact lines under the legal name, at the left margin, in order.
    const contact = first?.lines.filter((l) => l.x === 72 && l.y > 72 && l.y < 396) ?? [];
    expect(contact.map(textOf)).toEqual(KEPT.contact);
    const title = first?.lines.find((l) => textOf(l) === 'The Salt Road') as Line;
    expect(title.y).toBe(396);
    expect(centre(title)).toBeCloseTo(306, 6);
    const by = first?.lines.find((l) => textOf(l) === 'by R. Vale') as Line;
    expect(by.y).toBe(420);
    expect(centre(by)).toBeCloseTo(306, 6);
  });

  it('leaves blank details off', () => {
    const blank = of([para('Words.')], {
      legalName: '',
      contact: [],
      byline: '',
      words: 0,
      wordsLabel: wordsLabel(0),
    });
    const [first] = layout(blank);
    expect(first?.lines.filter((l) => l.x === 72 && l.y < 396)).toEqual([]);
    expect(first?.lines.map(textOf)).toEqual(['0 words', 'The Salt Road']);
    expect(JSON.stringify(first)).not.toMatch(/undefined|by $/);
  });
});

describe('layoutManuscript: the running header', () => {
  it('reads Surname / SHORT TITLE / N on every page after the title page', () => {
    const pages = layout(fixture());
    expect(pages[1]?.header).toBe('Vale / THE SALT ROAD / 2');
    pages.forEach((page, i) => {
      expect(page.number).toBe(i + 1);
      if (i > 0) expect(page.header).toBe(`Vale / THE SALT ROAD / ${i + 1}`);
    });
  });

  it('leaves out an empty part, never a stray slash', () => {
    const noSurname = layout(of([para('Words.')], { surname: '' }));
    expect(noSurname[1]?.header).toBe('THE SALT ROAD / 2');
    const neither = layout(of([para('Words.')], { surname: '', shortTitle: '' }));
    expect(neither[1]?.header).toBe('2');
    const onlySurname = layout(of([para('Words.')], { shortTitle: '  ' }));
    expect(onlySurname[1]?.header).toBe('Vale / 2');
  });
});

describe('layoutManuscript: parts and chapters', () => {
  it('starts the first block on page 2', () => {
    const pages = layout(fixture());
    // The fixture opens with a part.
    expect(textOf(pages[1]?.lines[0])).toBe('Part One: The Tide');
    const prose = layout(of([para('The causeway appeared at low water.')]));
    expect(prose[1]?.lines[0]).toMatchObject({ x: 108, y: 72 });
  });

  it('gives a part a page of its own, its title halfway down', () => {
    const pages = layout(fixture());
    const part = pages[1] as ManuscriptPage;
    expect(part.lines).toHaveLength(1);
    expect(part.lines[0]?.y).toBe(396);
    expect(centre(part.lines[0] as Line)).toBeCloseTo(306, 6);
    // The next chapter starts on the next page.
    expect(textOf(pages[2]?.lines[0])).toBe('The Salt Road');
  });

  it('starts each chapter on a new page, a third of the way down, its text two lines below', () => {
    const pages = layout(fixture());
    for (const title of ['The Salt Road', 'Chapter 2', 'The Night Watch']) {
      const found = find(pages.slice(1), title);
      expect(found, title).toBeDefined();
      const { page, line } = found as { page: ManuscriptPage; line: Line };
      expect(page.lines[0], title).toBe(line);
      expect(line.y, title).toBe(264);
      expect(centre(line), title).toBeCloseTo(306, 6);
      expect(page.lines[1]?.y, title).toBe(312);
      expect(page.lines[1]?.x, title).toBe(108);
    }
  });

  it('a part followed by prose starts the prose on the next page', () => {
    const pages = layout(of([{ kind: 'part', title: 'Part One' }, para('After.')]));
    expect(pages.map((p) => p.lines.map(textOf))).toEqual([
      expect.anything(),
      ['Part One'],
      ['After.'],
    ]);
  });
});

describe('layoutManuscript: paragraphs', () => {
  it('indents each first line half an inch, wraps at the right margin, 24 pt apart', () => {
    const pages = layout(of([para(words(59)), para(words(29, 'gull'))]));
    const lines = pages[1]?.lines ?? [];
    // 72 characters to the first line (14 words, 69 characters), then 78 (15 words, 74).
    expect(lines.map((l) => [l.x, l.y])).toEqual([
      [108, 72],
      [72, 96],
      [72, 120],
      [72, 144],
      [108, 168],
      [72, 192],
    ]);
    for (const line of lines) expect(line.x + widthOf(line)).toBeLessThanOrEqual(540);
    expect(textOf(lines[0])).toBe(words(14));
    expect(textOf(lines[1])).toBe(words(15));
    // No space is left at either end of a wrapped line.
    for (const line of lines) expect(textOf(line)).toBe(textOf(line).trim());
  });

  it('indents a quote half an inch on both sides', () => {
    const pages = layout(of([para(words(40), 'quote')]));
    const lines = pages[1]?.lines ?? [];
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.x).toBe(108);
      expect(line.x + widthOf(line)).toBeLessThanOrEqual(504);
    }
    // 396 pt: 66 characters, 13 words.
    expect(textOf(lines[0])).toBe(words(13));
  });

  it('prints a list item with its marker, indented', () => {
    const pages = layout(
      of([{ kind: 'paragraph', style: 'list', runs: [{ text: 'two candles' }], marker: '•' }]),
    );
    expect(pages[1]?.lines[0]).toMatchObject({ x: 108, y: 72 });
    expect(textOf(pages[1]?.lines[0])).toBe('• two candles');
  });

  it('prints a code line flush left, its spaces kept', () => {
    const pages = layout(of([para('  tide: low at six', 'code'), para('', 'code')]));
    const [line, blank] = pages[1]?.lines ?? [];
    expect(line).toMatchObject({ x: 72, y: 72 });
    expect(textOf(line)).toBe('  tide: low at six');
    expect(blank?.y).toBe(96);
  });

  it('keeps marks as faces, joining a word across runs', () => {
    const runs: Run[] = [
      { text: 'She had ' },
      { text: 'promised', italic: true },
      { text: ', and ' },
      { text: 'nearly', bold: true },
      { text: ' ' },
      { text: 'gone', bold: true, italic: true },
      { text: ' with ' },
      { text: 'lamp.oil', code: true },
    ];
    const pages = layout(of([{ kind: 'paragraph', style: 'body', runs }]));
    const line = pages[1]?.lines[0] as Line;
    expect(line.runs.map((r) => [r.text, r.face])).toEqual([
      ['She had ', 'regular'],
      ['promised', 'italic'],
      [', and ', 'regular'],
      ['nearly', 'bold'],
      [' ', 'regular'],
      ['gone', 'boldItalic'],
      [' with ', 'regular'],
      ['lamp.oil', 'regular'],
    ]);
    expect(line.runs[1]?.italic).toBe(true);
  });

  it('wraps a word longer than the line by character', () => {
    const pages = layout(of([para('x'.repeat(200))]));
    const lines = pages[1]?.lines ?? [];
    expect(lines.map((l) => textOf(l).length)).toEqual([72, 78, 50]);
  });

  it('prints a line break in a run as a space', () => {
    const pages = layout(of([para('the lamp\nwas lit')]));
    expect(textOf(pages[1]?.lines[0])).toBe('the lamp was lit');
  });

  it('keeps every line above the bottom margin', () => {
    const pages = layout(of(Array.from({ length: 40 }, () => para(words(30)))));
    expect(pages.length).toBeGreaterThan(4);
    for (const page of pages.slice(1)) {
      for (const line of page.lines) {
        expect(line.y).toBeGreaterThanOrEqual(72);
        expect(line.y).toBeLessThan(720);
      }
      for (const [i, line] of page.lines.entries()) {
        if (i > 0) expect(line.y - (page.lines[i - 1] as Line).y).toBe(24);
      }
    }
    // Twenty-seven lines a full Letter page: nine paragraphs of three lines.
    expect(pages[1]?.lines).toHaveLength(27);
    expect(pages[1]?.lines.at(-1)?.y).toBe(696);
  });
});

describe('layoutManuscript: breaks and the end', () => {
  it('a break is a centred # on its own line, and END follows the text after a blank line', () => {
    const pages = layout(of([para('Before.'), { kind: 'break' }, para('After.'), { kind: 'end' }]));
    const lines = pages[1]?.lines ?? [];
    expect(lines.map((l) => [textOf(l), l.y])).toEqual([
      ['Before.', 72],
      ['#', 96],
      ['After.', 120],
      ['END', 168],
    ]);
    expect(centre(lines[1] as Line)).toBeCloseTo(306, 6);
    expect(centre(lines[3] as Line)).toBeCloseTo(306, 6);
  });

  it('the fixture ends with END, then a page of Notes', () => {
    const ms = fixture();
    const pages = layout(ms);
    const end = find(pages, 'END');
    expect(end).toBeDefined();
    const notes = pages.at(-1) as ManuscriptPage;
    expect(notes).not.toBe(end?.page);
    expect(notes.lines[0]?.y).toBe(72);
    expect(textOf(notes.lines[0])).toBe('Notes');
    expect(centre(notes.lines[0] as Line)).toBeCloseTo(306, 6);
    expect(notes.lines[1]).toMatchObject({ x: 108, y: 120 });
    expect(textOf(notes.lines[1])).toMatch(/^1\. Built in 1871/);
  });

  it('numbers each note', () => {
    const pages = layout(
      of([para('Text.'), { kind: 'end' }], {
        notes: [[{ text: 'First.' }], [{ text: 'Second, ' }, { text: 'marked', italic: true }]],
      }),
    );
    const notes = pages.at(-1) as ManuscriptPage;
    expect(notes.lines.map(textOf)).toEqual(['Notes', '1. First.', '2. Second, marked']);
    expect(notes.lines[2]?.y).toBe(144);
  });

  it('no notes, no Notes page', () => {
    const pages = layout(of([para('Text.'), { kind: 'end' }]));
    expect(pages).toHaveLength(2);
    expect(find(pages, 'Notes')).toBeUndefined();
  });
});

describe('layoutManuscript: widows and orphans', () => {
  /** Where each paragraph's lines fall: the page index of each line, by the paragraph's word. */
  const placed = (pages: ManuscriptPage[]) => {
    const at = new Map<string, number[]>();
    pages.forEach((page, p) => {
      for (const line of page.lines) {
        const word = textOf(line).split(' ')[0] as string;
        at.set(word, [...(at.get(word) ?? []), p]);
      }
    });
    return at;
  };

  it('never leaves one line of a paragraph alone at the foot or the head of a page', () => {
    // Paragraphs of 1 to 7 lines, each its own word, in many orders: no split leaves fewer than 2.
    for (let shift = 0; shift < 12; shift++) {
      const blocks = Array.from({ length: 30 }, (_, i) => {
        const lines = ((i + shift) % 7) + 1;
        return para(words(lines * 14, `w${String(i).padStart(2, '0')}`));
      });
      const pages = layout(of(blocks));
      for (const [word, onPages] of placed(pages)) {
        const counts = new Map<number, number>();
        for (const p of onPages) counts.set(p, (counts.get(p) ?? 0) + 1);
        if (counts.size > 1) {
          for (const n of counts.values()) expect(n, `${word}, shift ${shift}`).toBeGreaterThan(1);
        }
      }
      for (const page of pages.slice(1)) {
        for (const line of page.lines) expect(line.y).toBeLessThan(720);
      }
    }
  });

  it('a chapter title is never the last line of a page', () => {
    const pages = layout(
      of([para(words(26 * 15)), { kind: 'chapter', title: 'Two' }, para(words(40))]),
    );
    for (const page of pages) {
      expect(textOf(page.lines.at(-1))).not.toBe('Two');
    }
    expect(find(pages, 'Two')?.line.y).toBe(264);
  });
});

describe('layoutManuscript: A4', () => {
  it('measures its positions from A4’s height', () => {
    const pages = layout(fixture(), 'a4');
    const title = pages[0]?.lines.find((l) => textOf(l) === 'The Salt Road') as Line;
    expect(title.y).toBeCloseTo(420.95, 1);
    expect(centre(title)).toBeCloseTo(297.64, 6);
    const count = pages[0]?.lines.find((l) => textOf(l).endsWith('words')) as Line;
    expect(count.x + widthOf(count)).toBeCloseTo(523.28, 6);
    const chapter = find(pages.slice(1), 'The Salt Road')?.line as Line;
    expect(chapter.y).toBeCloseTo(280.63, 2);
    expect(find(pages, 'Part One: The Tide')?.line.y).toBeCloseTo(420.95, 1);
  });
});
