import { readFileSync } from 'node:fs';
import { listZip, readEntry } from '@drafter/archive';
import { parseMarkdown } from '@drafter/markdown';
import { manuscriptOf, resolveDetails } from '@drafter/novel';
import { renderManuscriptDocx } from '@drafter/render-docx';
import { layoutManuscript } from '@drafter/render-pdf';
import { describe, expect, test } from 'vitest';

// The PDF and the Word file are drawn from one description (manuscript design, Goal 4), so they
// must agree on its landmarks: as many chapter titles, scene breaks, and ENDs. This test lives in
// the web app because it is the one package that has both renderers.

const book = readFileSync(
  new URL('../../../packages/novel/test/fixtures/manuscript-book.md', import.meta.url),
  'utf8',
);
const ms = manuscriptOf(
  book,
  parseMarkdown(book),
  resolveDetails(book, 'File', { byline: 'R. Vale' }),
);

/** Every character 6 pt wide, as the layout tests measure. */
const measure = (text: string) => [...text].length * 6;

async function documentXml(): Promise<string> {
  const bytes = renderManuscriptDocx(ms, { paper: 'letter', lang: 'en-US' });
  const entry = listZip(bytes).find((e) => e.name === 'word/document.xml');
  if (!entry) throw new Error('no word/document.xml');
  return new TextDecoder().decode(await readEntry(bytes, entry));
}

/** How many paragraphs in the Word file have this style. */
const styled = (xml: string, style: string) => xml.split(`<w:pStyle w:val="${style}"/>`).length - 1;

describe('the manuscript PDF and Word file agree', () => {
  test('on the chapter titles, the scene breaks, and END, for the fixture book', async () => {
    const chapters = ms.blocks.flatMap((b) => (b.kind === 'chapter' ? [b.title] : []));
    const breaks = ms.blocks.filter((b) => b.kind === 'break').length;
    expect(chapters.length).toBeGreaterThan(1);
    expect(breaks).toBeGreaterThan(1);

    // The title page (page 1) prints the book's title, which may be a chapter's too: skip it.
    const lines = layoutManuscript(ms, { paper: 'letter', measure })
      .slice(1)
      .flatMap((page) => page.lines.map((line) => line.runs.map((r) => r.text).join('')));
    const pdf = {
      chapters: lines.filter((t) => chapters.includes(t)).length,
      breaks: lines.filter((t) => t === '#').length,
      ends: lines.filter((t) => t === 'END').length,
    };

    const xml = await documentXml();
    const docx = {
      chapters: styled(xml, 'ChapterTitle'),
      breaks: styled(xml, 'SceneBreak'),
      ends: styled(xml, 'End'),
    };

    expect(pdf).toEqual({ chapters: chapters.length, breaks, ends: 1 });
    expect(docx).toEqual(pdf);
  });
});
