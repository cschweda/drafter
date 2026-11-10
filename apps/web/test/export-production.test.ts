import { readFile } from 'node:fs/promises';
import { parse, type TextChange } from '@drafter/fountain';
import { paginate, titlePageFor } from '@drafter/layout';
import { lock, productionLayout, readProduction } from '@drafter/production';
import { FONT_FILES, type FontSet, renderPdf } from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { extract } from '../../../packages/render-pdf/test/helpers';
import {
  createExporter,
  type ExportOptions,
  type ExportReply,
} from '../app/workers/export-compute';

// A locked script's exports (production design §8, rulings 2b, 3b, F1, F4): the PDF, the HTML
// file's pages, and plain text print the locked labels (12A) and a new scene's A-number; the PDF
// prints the open set's asterisks and its revision header unless Revision marks is None. Fountain,
// Final Draft, and Markdown are as before. Pages that can't be placed refuse the revised pages, the
// breakdown, and the sides.

// Ruling F4: a switch that makes productionLayout report its locked pages couldn't be placed.
const degrade = vi.hoisted(() => ({ on: false }));
vi.mock('@drafter/production', async (original) => {
  const real = await original<typeof import('@drafter/production')>();
  return {
    ...real,
    productionLayout: async (...args: Parameters<typeof real.productionLayout>) => {
      const result = await real.productionLayout(...args);
      return degrade.on ? { ...result, locked: false, degraded: true } : result;
    },
  };
});
afterEach(() => {
  degrade.on = false;
});

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

  test('plain text prints the locked pages, at their labels (ruling F1)', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      kind: 'txt',
      source,
      template,
      options: OPTIONS,
    });
    const { layout } = await productionLayout(source, template, {
      sceneNumbers: 'none',
      titlePage: 'full',
      marks: 'none',
    });
    const text = textOfReply(reply);
    expect(text).toBe(renderText(layout, template));
    // Page 1 prints no number; then 2., 2A., 3., as the PDF; no asterisk, no header.
    const numbers = text.split('\f').map((page) => /\S+\.$/m.exec(page.split('\n')[3] ?? '')?.[0]);
    expect(numbers.slice(2, 5)).toEqual(['2.', '2A.', '3.']);
    expect(text).not.toContain('*');
    expect(text).not.toContain('Revision');
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

describe('pages that can’t be placed (ruling F4)', () => {
  const REFUSED = {
    error: "The locked pages couldn't be placed, so nothing was exported.",
    refused: true,
  };

  test('revised pages, the breakdown, and the sides refuse, and make no file', async () => {
    const source = await lockedEdited();
    degrade.on = true;
    const exporter = createExporter(realFonts);
    const revised = await exporter({
      kind: 'revised-pdf',
      source,
      template,
      options: OPTIONS,
      which: { kind: 'all' },
      marks: 'open',
      header: HEADER,
      tint: false,
    });
    expect(revised).toEqual(REFUSED);
    for (const kind of ['breakdown-csv', 'breakdown-pdf'] as const) {
      expect(
        await exporter({ kind, source, template, title: 'The Hall', today: '2026-11-09' }),
      ).toEqual(REFUSED);
    }
    const sides = await exporter({
      kind: 'sides-pdf',
      source,
      template,
      options: OPTIONS,
      names: ['NOBODY'],
      scenes: [1],
      today: '2026-11-09',
    });
    expect(sides).toEqual(REFUSED);
  });

  test('the full PDF, the HTML file, and plain text still export, unlocked', async () => {
    const source = await lockedEdited();
    degrade.on = true;
    const exporter = createExporter(realFonts);
    expect(
      bytesOf(await exporter({ kind: 'pdf', source, template, options: OPTIONS })).length,
    ).toBeGreaterThan(0);
    expect(textOfReply(await exporter({ ...HTML, source, template, options: OPTIONS }))).toContain(
      '<html',
    );
    expect(
      textOfReply(await exporter({ kind: 'txt', source, template, options: OPTIONS })),
    ).toContain('Line 1 of');
  });
});

/**
 * A locked script with every kind of locked page and number (ruling F1): rooms 1 to 8 locked as
 * scenes 1 to 8; room 2 grows by pages (A-pages); rooms 4 to 7 go whole, so their pages fold into
 * the one before (a range); and a new scene with no number written goes in before room 8 (3A).
 */
async function everyKind(): Promise<string> {
  const filler = (n: number, word: string) =>
    Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1} of the scene goes on.`).join(
      '\n\n',
    );
  const scene = (n: number) => `INT. ROOM ${n} - DAY\n\n${filler(30, `Room${n}`)}\n\n`;
  const base = `Title: The Hall\nAuthor: Wren Okafor\n\n${[1, 2, 3, 4, 5, 6, 7, 8].map(scene).join('')}`;
  const locked = apply(
    base,
    await lock(base, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
  );
  const grown = locked.replace('INT. ROOM 3 - DAY', `${filler(20, 'Extra')}\n\nINT. ROOM 3 - DAY`);
  const lines = grown.split('\n');
  const start = lines.findIndex((l) => l.startsWith('INT. ROOM 4'));
  const end = lines.findIndex((l) => l.startsWith('INT. ROOM 8'));
  return [
    ...lines.slice(0, start),
    'INT. STAIRS - NIGHT',
    '',
    'MARGARET',
    'New.',
    '',
    ...lines.slice(end),
  ].join('\n');
}

describe('every export of a locked script agrees (ruling F1)', () => {
  const ALL: ExportOptions = { ...OPTIONS, sceneNumbers: 'all' };
  const strip = (label: string) => label.replace(/\.$/, '');

  test('page labels and scene numbers match across PDF, HTML, text, revised pages, breakdown, and sides', async () => {
    const source = await everyKind();
    const exporter = createExporter(realFonts);
    const SCENES = ['1', '2', '3', '3A', '8'];

    // The PDF: each body page's label, and the scene numbers in its margins.
    const pdf = await extract(
      bytesOf(await exporter({ kind: 'pdf', source, template, options: ALL })),
    );
    const pdfPages = pdf.slice(1).map((page) => page.items.map((i) => i.str));
    const labelOf = (strs: string[]) => strs.find((s) => /^\d+[A-Z]*(-\d+[A-Z]*)?\.$/.test(s));
    const pdfLabels = pdfPages.map((strs, i) => (i === 0 ? '1' : strip(labelOf(strs) ?? '?')));
    expect(pdfLabels.some((l) => /^\d+[A-Z]+$/.test(l))).toBe(true);
    expect(pdfLabels.some((l) => l.includes('-'))).toBe(true);
    const marginNumbers = pdf.flatMap((page) =>
      page.items.filter((i) => i.x < 72 && /^[A-Z]*\d+[A-Z]*$/.test(i.str)).map((i) => i.str),
    );
    expect(marginNumbers).toEqual(SCENES);

    // The HTML file's pages.
    const html = textOfReply(await exporter({ ...HTML, source, template, options: ALL }));
    const furniture = (kind: string) =>
      [...html.matchAll(new RegExp(`data-furniture="${kind}"[^>]*>([^<]*)<`, 'g'))].map(
        (m) => m[1] as string,
      );
    expect(['1', ...furniture('number').map(strip)]).toEqual(pdfLabels);
    expect(furniture('scene').filter((_, i) => i % 2 === 0)).toEqual(SCENES);

    // Plain text: the same pages, labels, and numbers.
    const txt = textOfReply(await exporter({ kind: 'txt', source, template, options: ALL }));
    const txtPages = txt.split('\f').slice(1);
    expect(txtPages).toHaveLength(pdfLabels.length);
    const txtLabels = txtPages.map((page, i) =>
      i === 0 ? '1' : strip((page.split('\n')[template.page.numbering.line] ?? '').trim()),
    );
    expect(txtLabels).toEqual(pdfLabels);
    const txtNumbers = txtPages.flatMap((page) =>
      page
        .split('\n')
        .map((line) => /^\s*([A-Z]*\d+[A-Z]*)\s{2,}/.exec(line)?.[1])
        .filter((n): n is string => n !== undefined),
    );
    expect(txtNumbers).toEqual(SCENES);

    // Revised pages, a range from the A-page to the folded page: the same labels, in order.
    const a = pdfLabels.findIndex((l) => /^\d+[A-Z]+$/.test(l));
    const folded = pdfLabels.findIndex((l) => l.includes('-'));
    const revised = await extract(
      bytesOf(
        await exporter({
          kind: 'revised-pdf',
          source,
          template,
          options: ALL,
          which: { kind: 'range', from: pdfLabels[a] as string, to: pdfLabels[folded] as string },
          marks: 'open',
          header: HEADER,
          tint: false,
        }),
      ),
    );
    expect(revised.map((page) => strip(labelOf(page.items.map((i) => i.str)) ?? '?'))).toEqual(
      pdfLabels.slice(a, folded + 1),
    );

    // The breakdown: each scene's number, and the label of the page it starts on.
    const csv = textOfReply(
      await exporter({
        kind: 'breakdown-csv',
        source,
        template,
        title: 'The Hall',
        today: '2026-11-09',
      }),
    );
    const rows = csv
      .trim()
      .split('\r\n')
      .slice(1)
      .map((row) => row.split(','));
    expect(rows.map((row) => row[0])).toEqual(SCENES);
    const startsOn = SCENES.map((n) => pdfLabels[pdfPages.findIndex((strs) => strs.includes(n))]);
    expect(rows.map((row) => row[5])).toEqual(startsOn);

    // The sides: the dialog's scene list, the header, and the labels of the pages printed.
    const info = JSON.parse(
      textOfReply(await exporter({ kind: 'sides-info', source, template })),
    ) as { scenes: Array<{ ordinal: number; label: string }> };
    expect(info.scenes.map((s) => s.label)).toEqual(SCENES);
    const sides = await extract(
      bytesOf(
        await exporter({
          kind: 'sides-pdf',
          source,
          template,
          options: ALL,
          names: ['MARGARET'],
          scenes: [4],
          today: '2026-11-09',
        }),
      ),
    );
    const sidesText = sides.map((page) => page.items.map((i) => i.str));
    for (const page of sidesText)
      expect(page).toContain('SIDES — MARGARET — Scene 3A — 9 November 2026');
    const newScenePage = pdfLabels[pdfPages.findIndex((strs) => strs.includes('3A'))];
    expect(sidesText.map((strs) => strip(labelOf(strs) ?? '?'))).toContain(newScenePage);
  });
});
