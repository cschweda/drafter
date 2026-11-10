import { readFile } from 'node:fs/promises';
import { parse, type TextChange } from '@drafter/fountain';
import { paginate, titlePageFor } from '@drafter/layout';
import { lock, readProduction } from '@drafter/production';
import { FONT_FILES, type FontSet, renderPdf } from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { extract } from '../../../packages/render-pdf/test/helpers';
import {
  createExporter,
  type ExportOptions,
  type ExportReply,
} from '../app/workers/export-compute';

// A locked script's exports (production design §8, rulings 2b and 3b): the PDF and the HTML file's
// pages print the locked labels (12A); the PDF prints the open set's asterisks and its revision
// header unless Revision marks is None. Plain text, Fountain, Final Draft, and Markdown are as
// before.

const template = builtins['us-screenplay'] as Template;
const HEADER = 'Blue Revision — 9 November 2026';

const FOLDER = new URL('../../../packages/render-pdf/fonts/', import.meta.url);
async function realFonts(): Promise<FontSet> {
  const bytes = async (style: keyof FontSet) =>
    new Uint8Array(await readFile(new URL(FONT_FILES[style], FOLDER)));
  return {
    regular: await bytes('regular'),
    bold: await bytes('bold'),
    italic: await bytes('italic'),
    boldItalic: await bytes('boldItalic'),
  };
}

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const paragraphs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `Line ${from + i} of the hall.\n`).join('\n');
const UNLOCKED = `Title: The Hall\nAuthor: Wren Okafor\n\nINT. HALL - DAY\n\n${paragraphs(1, 120)}`;

/** The script locked on 9 November 2026, then 15 new paragraphs on page 2: its end goes to 2A. */
async function lockedEdited(): Promise<string> {
  const text = apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
  );
  const at = text.indexOf('Line 40 of');
  return `${text.slice(0, at)}${paragraphs(1000, 15)}\n${text.slice(at)}`;
}

const bytesOf = (reply: ExportReply): Uint8Array => {
  if (!('data' in reply) || typeof reply.data === 'string') throw new Error(JSON.stringify(reply));
  return reply.data;
};
const textOfReply = (reply: ExportReply): string => {
  if (!('data' in reply) || typeof reply.data !== 'string') throw new Error(JSON.stringify(reply));
  return reply.data;
};

const OPTIONS: ExportOptions = { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' };
const HTML = {
  kind: 'html',
  title: 'The Hall',
  lang: 'en',
  generator: 'Drafter',
  minutesPerPage: 1,
} as const;

describe('a locked script’s exports', () => {
  test('a locked script’s PDF prints 2A and the open set’s asterisks', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      kind: 'pdf',
      source,
      template,
      options: OPTIONS,
    });
    const pages = await extract(bytesOf(reply));
    const all = pages.map((p) => p.items.map((i) => i.str));
    // Page 1 prints no number; then 2., 2A., 3.
    expect(all[2]).toContain('2.');
    expect(all[3]).toContain('2A.');
    expect(all[4]).toContain('3.');
    // One asterisk per new paragraph, each at the margin column.
    const stars = pages.flatMap((p) => p.items.filter((i) => i.str === '*'));
    expect(stars).toHaveLength(15);
    expect(stars.every((s) => Math.abs(s.x - (template.page.width - 5) * 7.2) < 0.5)).toBe(true);
    // The header on every body page, never the title page.
    expect(all[0]?.join(' ')).not.toContain('Revision');
    for (const page of all.slice(1)) expect(page).toContain(HEADER);
  });

  test('Revision marks: None prints labels without asterisks or header', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      kind: 'pdf',
      source,
      template,
      options: { ...OPTIONS, revisionMarks: 'none' },
    });
    const pages = await extract(bytesOf(reply));
    const all = pages.flatMap((p) => p.items.map((i) => i.str));
    expect(all).toContain('2A.');
    expect(all).not.toContain('*');
    expect(all.join(' ')).not.toContain('Revision');
  });

  test('the title page option still applies to a locked script', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      kind: 'pdf',
      source,
      template,
      options: { ...OPTIONS, titlePage: 'none' },
    });
    const pages = await extract(bytesOf(reply));
    expect(pages[0]?.items.map((i) => i.str).join(' ')).not.toContain('The Hall');
    expect(pages[2]?.items.map((i) => i.str)).toContain('2A.');
  });

  test('an unlocked script’s PDF is unchanged', async () => {
    const fonts = await realFonts();
    const reply = await createExporter(async () => fonts)({
      kind: 'pdf',
      source: UNLOCKED,
      template,
      options: OPTIONS,
    });
    const parsed = parse(UNLOCKED);
    const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, 'full') };
    const expected = await renderPdf(paginate(doc, template, { sceneNumbers: 'none' }), template, {
      fonts,
    });
    expect(bytesOf(reply)).toEqual(expected);
  });

  test('the HTML file’s pages carry the labels, the asterisks, and the header', async () => {
    const source = await lockedEdited();
    const html = textOfReply(
      await createExporter(realFonts)({ ...HTML, source, template, options: OPTIONS }),
    );
    const furniture = (kind: string) =>
      [...html.matchAll(new RegExp(`data-furniture="${kind}"[^>]*>([^<]*)<`, 'g'))].map(
        (m) => m[1],
      );
    expect(furniture('number').slice(0, 3)).toEqual(['2.', '2A.', '3.']);
    expect(furniture('mark')).toHaveLength(15);
    const headers = furniture('revision');
    expect(headers.length).toBeGreaterThan(3);
    expect(headers.every((text) => text === HEADER)).toBe(true);

    const none = textOfReply(
      await createExporter(realFonts)({
        ...HTML,
        source,
        template,
        options: { ...OPTIONS, revisionMarks: 'none' },
      }),
    );
    expect(none).toContain('2A.');
    expect(none).not.toContain('data-furniture="mark"');
    expect(none).not.toContain('data-furniture="revision"');
  });

  test('plain text is as before (ruling 2b)', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      kind: 'txt',
      source,
      template,
      options: OPTIONS,
    });
    const parsed = parse(source);
    const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, 'full') };
    expect(textOfReply(reply)).toBe(
      renderText(paginate(doc, template, { sceneNumbers: 'none' }), template),
    );
  });

  test('a label with markup in it makes the block unreadable: the export is unlocked and clean', async () => {
    const source = (await lockedEdited()).replace('["2",', '["1<img src=x onerror=alert(1)>",');
    expect(source).toContain('<img src=x');
    expect(readProduction(parse(source).meta)).toBeNull();
    const html = textOfReply(
      await createExporter(realFonts)({ ...HTML, source, template, options: OPTIONS }),
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('data-furniture="mark"');
    expect(html).not.toContain('2A.');
  });
});
