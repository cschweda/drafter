import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { filler, isBlank, style, text } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const lay = (source: string, template = screenplay) => paginate(parse(source), template);

/** Words of nine letters, numbered from `from`: six fill a line of action, with or without a stop. */
const word = (i: number) => `w${String(i).padStart(3, '0')}xxxxx`;
/** A sentence of `n` words, the first numbered `from`: `W001xxxxx w002xxxxx.` */
const sentence = (from: number, n: number, stop = '.') =>
  Array.from({ length: n }, (_, k) => word(from + k))
    .join(' ')
    .replace(/^w/, 'W') + stop;
/** Sentences of the given lengths, one after another, as one paragraph. */
function paragraph(...lengths: number[]): string {
  let at = 1;
  return lengths
    .map((n) => {
      const s = sentence(at, n);
      at += n;
      return s;
    })
    .join(' ');
}
/** The paragraph's printed lines on each page. */
const pagesOf = (layout: Layout) =>
  layout.pages.map((p) =>
    p.lines.map((line) => text(line)).filter((t) => /^w\d\d\dx/i.test(t.trim())),
  );
/** How many words of the paragraph each of a page's lines holds. */
const counts = (lines: string[]) => lines.map((t) => t.trim().split(/\s+/).length);
/** `room` lines are left on page 1 when the paragraph starts. */
const withRoom = (room: number, para: string, template = screenplay) =>
  lay(`${filler(53 - room)}\n\n${para}\n`, template);

describe('the test paragraph', () => {
  it('fills a line of action with six words', () => {
    expect(screenplay.roles.action?.width).toBe(60);
    expect(counts(pagesOf(lay(`${paragraph(15, 25)}\n`))[0] as string[])).toEqual([
      6, 6, 6, 6, 6, 6, 4,
    ]);
  });
});

describe('action across a page, cut at a sentence', () => {
  it('ends the page at the last sentence that fits, and wraps the rest afresh', () => {
    // Seven lines for five lines of room. The first sentence ends three words into line 3.
    const [first, second] = pagesOf(withRoom(5, paragraph(15, 25)));
    expect(counts(first as string[])).toEqual([6, 6, 3]);
    expect((first as string[])[2]).toBe(`${word(13)} ${word(14)} ${word(15)}.`);
    expect(counts(second as string[])).toEqual([6, 6, 6, 6, 1]);
    expect((second as string[])[0]?.startsWith('W016xxxxx w017xxxxx')).toBe(true);
  });

  it('prints every word once, in order', () => {
    const para = paragraph(4, 11, 9, 16, 7, 20, 3, 14);
    for (let room = 1; room <= 12; room++) {
      const printed = pagesOf(withRoom(room, para)).flat().join(' ');
      expect(printed.replace(/\s+/g, ' '), `room ${room}`).toBe(para);
    }
  });

  it('takes the last of several sentences that fit', () => {
    const [first] = pagesOf(withRoom(5, paragraph(8, 9, 8, 15)));
    // Sentences end at words 8, 17 and 25; line 5 ends at word 30.
    expect(counts(first as string[])).toEqual([6, 6, 6, 6, 1]);
  });

  it('stops at the end of a line when the sentence ends there', () => {
    const [first, second] = pagesOf(withRoom(5, paragraph(12, 28)));
    expect(counts(first as string[])).toEqual([6, 6]);
    expect(counts(second as string[])).toEqual([6, 6, 6, 6, 4]);
  });

  it('keeps two lines at the foot: a sentence that ends in the first line is passed over', () => {
    const [first, second] = pagesOf(withRoom(5, paragraph(3, 37)));
    expect(counts(first as string[])).toEqual([6, 6, 6, 6, 6]);
    expect(counts(second as string[])).toEqual([6, 4]);
  });

  it('sends two lines over: a sentence that leaves one line is passed over', () => {
    // Eight lines for seven of room; after the sentence that ends at word 40, four words are left.
    const [first, second] = pagesOf(withRoom(7, paragraph(40, 4)));
    expect(counts(first as string[])).toEqual([6, 6, 6, 6, 6, 6]);
    expect(counts(second as string[])).toEqual([6, 2]);
  });

  it('takes an earlier sentence when the last one leaves one line', () => {
    const [first, second] = pagesOf(withRoom(7, paragraph(15, 25, 4)));
    expect(counts(first as string[])).toEqual([6, 6, 3]);
    expect(counts(second as string[])).toEqual([6, 6, 6, 6, 5]);
  });

  it('breaks at a line, as before, when the paragraph is one sentence', () => {
    const [first, second] = pagesOf(withRoom(5, paragraph(40)));
    expect(counts(first as string[])).toEqual([6, 6, 6, 6, 6]);
    expect(counts(second as string[])).toEqual([6, 4]);
  });

  it('starts a paragraph that a break at a line could not', () => {
    // Three lines for two of room: no line break leaves two lines on each side, a sentence does.
    const [first, second] = pagesOf(withRoom(2, paragraph(9, 9)));
    expect(counts(first as string[])).toEqual([6, 3]);
    expect(counts(second as string[])).toEqual([6, 3]);
  });

  it('keeps a heading with a paragraph cut at a sentence', () => {
    // Two blank lines, the heading, a blank line: two lines of room are left for the paragraph.
    const layout = lay(`${filler(48)}\n\nINT. HALL - DAY\n\n${paragraph(9, 9)}\n`);
    const first = (layout.pages[0] as Layout['pages'][number]).lines.map((line) => text(line));
    expect(first).toContain('INT. HALL - DAY');
    expect(counts(pagesOf(layout)[0] as string[])).toEqual([6, 3]);
  });

  it('does not end a page at a title or an initial', () => {
    const para = `${sentence(1, 14, '')} Dr. ${sentence(15, 25)}`;
    const [first] = pagesOf(withRoom(5, para));
    expect(first).toHaveLength(5);
  });

  it('counts a line the writer ended as the end of a sentence', () => {
    const para = `${sentence(1, 9, ',')}\n${sentence(10, 31, ',')}`;
    const [first, second] = pagesOf(withRoom(5, para));
    expect(counts(first as string[])).toEqual([6, 3]);
    expect(counts(second as string[])).toEqual([6, 6, 6, 6, 6, 1]);
  });

  it('carries bold and italic over the cut', () => {
    const para = `${sentence(1, 15)} **${sentence(16, 25)}**`;
    const layout = withRoom(5, para);
    const top = (layout.pages[1] as Layout['pages'][number]).lines[0];
    expect(top?.runs.map((run) => style(run))).toEqual(['b']);
    const foot = (layout.pages[0] as Layout['pages'][number]).lines.findLast((l) => !isBlank(l));
    expect(foot?.runs.map((run) => style(run))).toEqual(['']);
  });

  it('gives each piece the part of the source it prints', () => {
    const para = paragraph(15, 25);
    const source = `${filler(48)}\n\n${para}\n`;
    const layout = lay(source);
    const foot = (layout.pages[0] as Layout['pages'][number]).lines.findLast((l) => !isBlank(l));
    const top = (layout.pages[1] as Layout['pages'][number]).lines[0];
    expect(source.slice(foot?.span.from, foot?.span.to)).toBe(text(foot));
    expect(source.slice(top?.span.from, top?.span.to)).toBe(text(top));
    expect(top?.span.from).toBeGreaterThan(foot?.span.to as number);
  });

  it('cuts a paragraph taller than a page at a sentence on every page', () => {
    const lengths = Array.from({ length: 95 }, (_, i) => 5 + ((i * 7) % 11));
    const para = paragraph(...lengths);
    const pages = pagesOf(lay(`${para}\n`));
    expect(pages.length).toBeGreaterThan(2);
    for (const lines of pages.slice(0, -1)) expect(lines.at(-1)?.endsWith('.')).toBe(true);
    for (const lines of pages) expect(lines[0]?.startsWith('W')).toBe(true);
    expect(pages.flat().join(' ').replace(/\s+/g, ' ')).toBe(para);
  });

  it('keeps the blank lines of double-spaced action on both sides of the cut', () => {
    const double = loadTemplate({
      id: 'test',
      name: 'Test',
      extends: 'us-screenplay',
      roles: { action: { lineSpacing: 2 } },
    });
    // Seven printed lines take thirteen rows; nine rows of room.
    const para = paragraph(15, 25);
    const layout = lay(`${filler(22)}\n\n${para}\n`, double);
    const [first, second] = pagesOf(layout);
    expect(counts(first as string[])).toEqual([6, 6, 3]);
    expect(counts(second as string[])).toEqual([6, 6, 6, 6, 1]);
    const rows = (layout.pages[1] as Layout['pages'][number]).lines.slice(0, 9);
    expect(rows.map((line) => isBlank(line))).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('leaves a heading alone: only action is cut inside a line', () => {
    const heading = `.${sentence(1, 15)} ${sentence(16, 25)}`;
    const layout = lay(`${filler(48)}\n\n${heading}\n`);
    const foot = (layout.pages[0] as Layout['pages'][number]).lines.findLast((l) => !isBlank(l));
    expect(text(foot).endsWith('.')).toBe(false);
  });

  it('gives the same pages every time', () => {
    const source = `${filler(48)}\n\n${paragraph(15, 25)}\n`;
    expect(lay(source)).toEqual(lay(source));
  });
});
