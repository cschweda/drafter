import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import {
  DOCUMENT_FONT_FILES,
  type DocumentFontSet,
  FONT_FILES,
  type FontSet,
  renderPdf,
} from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import { builtins } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import sampleScreenplay from '#samples/screenplay.fountain?raw';
import * as compute from '../app/workers/export-compute';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportReply,
  fetchDocumentFonts,
  fetchFonts,
} from '../app/workers/export-compute';

// pdf-lib is render-pdf's, so it is found from there.
const { PDFDocument } = createRequire(
  new URL('../../../packages/render-pdf/package.json', import.meta.url),
)('pdf-lib') as typeof import('pdf-lib');

const template = builtins['us-screenplay'];
const SOURCE = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n\nMARGARET\nHello?\n';

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

async function realDocumentFonts(): Promise<DocumentFontSet> {
  const entries = await Promise.all(
    Object.entries(DOCUMENT_FONT_FILES).map(
      async ([face, file]) =>
        [face, new Uint8Array(await readFile(new URL(file, FOLDER)))] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as DocumentFontSet;
}

const DOCUMENT = '# Harbour Notes\n\nThe keeper climbs the stair at *dusk*, and the lamp turns.\n';
const markdownPdf = (source = DOCUMENT, paper: 'letter' | 'a4' = 'letter') =>
  ({ kind: 'markdown-pdf', source, paper, title: 'Harbour Notes', lang: 'en-GB' }) as const;

function bytesOf(reply: ExportReply): Uint8Array {
  if (!('data' in reply) || typeof reply.data === 'string') {
    throw new Error(`no bytes: ${JSON.stringify(reply)}`);
  }
  return reply.data;
}

describe('the export worker', () => {
  const { createExporter } = compute;
  test('writes the same text as the command line does', async () => {
    const exporter = createExporter(realFonts);
    const reply = await exporter({ kind: 'txt', source: SOURCE, template });
    expect(reply).toEqual({ data: renderText(paginate(parse(SOURCE), template), template) });
  });

  test('writes a PDF', async () => {
    const reply = await createExporter(realFonts)({ kind: 'pdf', source: SOURCE, template });
    if (!('data' in reply) || typeof reply.data === 'string') throw new Error('no bytes');
    expect(new TextDecoder().decode(reply.data.slice(0, 5))).toBe('%PDF-');
  });

  test('writes a Final Draft file, as toFdx does, without the fonts', async () => {
    const load = vi.fn(realFonts);
    const reply = await createExporter(load)({ kind: 'fdx', source: SOURCE, template });
    expect(reply).toEqual({ data: toFdx(parse(SOURCE), template) });
    expect(load).not.toHaveBeenCalled();
  });

  test('loads the fonts once, however many exports', async () => {
    const load = vi.fn(realFonts);
    const exporter = createExporter(load);
    await Promise.all([
      exporter({ kind: 'pdf', source: SOURCE, template }),
      exporter({ kind: 'pdf', source: SOURCE, template }),
    ]);
    await exporter({ kind: 'pdf', source: SOURCE, template });
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('plain text never loads the fonts', async () => {
    const load = vi.fn(realFonts);
    await createExporter(load)({ kind: 'txt', source: SOURCE, template });
    expect(load).not.toHaveBeenCalled();
  });

  test('answers a failure with an error, and tries the fonts again next time', async () => {
    const load = vi
      .fn<() => Promise<FontSet>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(realFonts);
    const exporter = createExporter(load);
    expect(await exporter({ kind: 'pdf', source: SOURCE, template })).toEqual({
      error: 'offline',
    });
    const again = await exporter({ kind: 'pdf', source: SOURCE, template });
    expect('data' in again).toBe(true);
  });

  test('answers a template that cannot be used with an error, and never throws', async () => {
    const reply = await createExporter(realFonts)({
      kind: 'txt',
      source: SOURCE,
      template: undefined as never,
    });
    expect('error' in reply).toBe(true);
  });
});

describe('the export worker’s options', () => {
  const { createExporter } = compute;
  const LOCKED = [
    'Title: The Call',
    'Author: A. Writer',
    'Contact: A. Writer',
    '    555-0100',
    '',
    'INT. A - DAY',
    '',
    'One.',
    '',
    'INT. B - DAY #12A#',
    '',
    'Two.',
    '',
    'INT. C - DAY',
    '',
    'Three.',
    '',
  ].join('\n');
  const textOf = (reply: ExportReply): string => {
    if (!('data' in reply) || typeof reply.data !== 'string') {
      throw new Error(`no text: ${JSON.stringify(reply)}`);
    }
    return reply.data;
  };

  test('the defaults print no scene numbers and the whole title page', () => {
    expect(DEFAULT_EXPORT_OPTIONS).toEqual({ sceneNumbers: 'none', titlePage: 'full' });
  });

  test('a PDF with no title page has one page fewer', async () => {
    const exporter = createExporter(realFonts);
    const count = async (reply: ExportReply) =>
      (await PDFDocument.load(bytesOf(reply))).getPageCount();
    const full = await exporter({ kind: 'pdf', source: SOURCE, template });
    const none = await exporter({
      kind: 'pdf',
      source: SOURCE,
      template,
      options: { sceneNumbers: 'none', titlePage: 'none' },
    });
    expect(await count(full)).toBe(2);
    expect(await count(none)).toBe(1);
  });

  test('plain text with scene numbers as written prints the locked number at the template’s columns', async () => {
    const reply = await createExporter(realFonts)({
      kind: 'txt',
      source: LOCKED,
      template,
      options: { sceneNumbers: 'written', titlePage: 'full' },
    });
    const lines = textOf(reply).split('\n');
    const left = template.page.margin.left;
    const heading = lines.find((line) => line.includes('INT. B - DAY')) as string;
    expect(heading.indexOf('12A')).toBe(left + template.sceneNumbers.left);
    expect(heading.lastIndexOf('12A')).toBe(left + template.sceneNumbers.right);
    for (const other of ['INT. A - DAY', 'INT. C - DAY']) {
      const line = lines.find((l) => l.includes(other)) as string;
      expect(line.trim()).toBe(other);
    }
  });

  test('a Final Draft file with title and author only has no Contact paragraph', async () => {
    const exporter = createExporter(realFonts);
    const full = textOf(await exporter({ kind: 'fdx', source: LOCKED, template }));
    const kept = textOf(
      await exporter({
        kind: 'fdx',
        source: LOCKED,
        template,
        options: { sceneNumbers: 'none', titlePage: 'title-author' },
      }),
    );
    expect(full).toContain('DrafterKey="Contact"');
    expect(kept).not.toContain('DrafterKey="Contact"');
    expect(kept).not.toContain('555-0100');
    expect(kept).toContain('DrafterKey="Title"');
    expect(kept).toContain('DrafterKey="Author"');
  });

  test('a Final Draft file keeps its locked numbers whatever the scene-number option', async () => {
    const exporter = createExporter(realFonts);
    const expected = toFdx(parse(LOCKED), template);
    expect(expected).toContain('Number="12A"');
    for (const sceneNumbers of ['none', 'written', 'all'] as const) {
      const reply = await exporter({
        kind: 'fdx',
        source: LOCKED,
        template,
        options: { sceneNumbers, titlePage: 'full' },
      });
      expect(textOf(reply), sceneNumbers).toBe(expected);
    }
  });

  test('a request with no options exports as before', async () => {
    const exporter = createExporter(realFonts);
    const layout = paginate(parse(sampleScreenplay), template);
    const pdf = await renderPdf(layout, template, { fonts: await realFonts() });
    // The sample's plain text and Final Draft file as they were before there were options,
    // written from the release before them (v0.16.0's layout) and kept: a change to the default
    // export shows here, not only as two of today's renders agreeing.
    const before = {
      txt: await readFile(
        new URL('./fixtures/sample-screenplay.export.txt', import.meta.url),
        'utf8',
      ),
      fdx: await readFile(
        new URL('./fixtures/sample-screenplay.export.fdx', import.meta.url),
        'utf8',
      ),
    };
    // Still the engine's own output today, with nothing asked of it.
    expect(renderText(layout, template)).toBe(before.txt);
    expect(toFdx(parse(sampleScreenplay), template)).toBe(before.fdx);
    for (const options of [undefined, DEFAULT_EXPORT_OPTIONS]) {
      const request = { source: sampleScreenplay, template, ...(options ? { options } : {}) };
      expect(bytesOf(await exporter({ kind: 'pdf', ...request }))).toEqual(pdf);
      expect(textOf(await exporter({ kind: 'txt', ...request }))).toBe(before.txt);
      expect(textOf(await exporter({ kind: 'fdx', ...request }))).toBe(before.fdx);
    }
  });
});

describe('the export worker’s progress', () => {
  const { createExporter } = compute;
  /** Every fraction the export sent, and its reply. */
  async function watch(request: Parameters<ReturnType<typeof createExporter>>[0]) {
    const exporter = createExporter(realFonts, realDocumentFonts);
    const sent: Array<number | null> = [];
    const reply = await exporter(request, (fraction) => sent.push(fraction));
    return { sent, reply };
  }
  /** Rising: each known fraction at least the one before it. */
  const rising = (sent: Array<number | null>) => {
    const known = sent.filter((f): f is number => f !== null);
    return known.every((f, i) => i === 0 || f >= (known[i - 1] as number));
  };
  const LONG_SCRIPT = `Title: The Long Night\n\n${Array.from(
    { length: 400 },
    (_, i) =>
      `INT. ROOM ${i} - NIGHT\n\nThe lamp gutters and the keeper waits.\n\nMARA\nStill here.\n`,
  ).join('\n')}`;
  const LONG_DOCUMENT = Array.from(
    { length: 200 },
    (_, i) => `## Part ${i}\n\nThe keeper climbs the stair and counts the lamps, one by one.`,
  ).join('\n\n');

  test('a script’s PDF starts unknown, rises as it draws, and ends at 1', async () => {
    const { sent, reply } = await watch({ kind: 'pdf', source: LONG_SCRIPT, template });
    expect(bytesOf(reply).length).toBeGreaterThan(0);
    expect(sent[0]).toBeNull();
    expect(sent.at(-1)).toBe(1);
    expect(sent.some((f) => f !== null && f > 0 && f < 1)).toBe(true);
    expect(rising(sent)).toBe(true);
  });

  test('a Markdown document’s PDF starts unknown, rises, and ends at 1', async () => {
    const { sent, reply } = await watch(markdownPdf(LONG_DOCUMENT));
    expect(bytesOf(reply).length).toBeGreaterThan(0);
    expect(sent[0]).toBeNull();
    expect(sent.at(-1)).toBe(1);
    expect(sent.some((f) => f !== null && f > 0 && f < 1)).toBe(true);
    expect(rising(sent)).toBe(true);
  });

  test('plain text and Final Draft say they are under way, and end at 1', async () => {
    for (const kind of ['txt', 'fdx'] as const) {
      const { sent } = await watch({ kind, source: SOURCE, template });
      expect(sent, kind).toEqual([null, 1]);
    }
  });

  test('a failed export sends no 1', async () => {
    const exporter = createExporter(async () => {
      throw new Error('no fonts');
    });
    const sent: Array<number | null> = [];
    const reply = await exporter({ kind: 'pdf', source: SOURCE, template }, (f) => sent.push(f));
    expect(reply).toEqual({ error: 'no fonts' });
    expect(sent).not.toContain(1);
  });
});

describe('the export worker, for a Markdown document', () => {
  // A fresh worker module each time, so each test sees whether it imports the parser.
  // It counts the worker's loads of the Markdown parser, which it imports on the first Markdown PDF.
  let createExporter: typeof import('../app/workers/export-compute').createExporter;
  const parser = { loads: 0 };
  beforeEach(async () => {
    vi.resetModules();
    parser.loads = 0;
    vi.doMock('../app/markdown/parse', async (original) => {
      parser.loads += 1;
      return await original();
    });
    ({ createExporter } = await import('../app/workers/export-compute'));
  });
  afterEach(() => {
    vi.doUnmock('../app/markdown/parse');
  });

  test('writes a Markdown document’s PDF on the paper asked for', async () => {
    const exporter = createExporter(realFonts, realDocumentFonts);
    for (const [paper, size] of [
      ['letter', [612, 792]],
      ['a4', [595.28, 841.89]],
    ] as const) {
      const reply = await exporter(markdownPdf(DOCUMENT, paper));
      expect(reply).toMatchObject({ missing: [] });
      const pdf = await PDFDocument.load(bytesOf(reply));
      expect(pdf.getPageCount()).toBe(1);
      const { width, height } = pdf.getPage(0).getSize();
      expect([width, height]).toEqual(size);
      expect(pdf.getTitle()).toBe('Harbour Notes');
    }
  });

  test('loads the document fonts once, and not for a script', async () => {
    const scriptFonts = vi.fn(realFonts);
    const documentFonts = vi.fn(realDocumentFonts);
    const exporter = createExporter(scriptFonts, documentFonts);
    await Promise.all([exporter(markdownPdf()), exporter(markdownPdf())]);
    await exporter(markdownPdf());
    expect(documentFonts).toHaveBeenCalledTimes(1);
    expect(scriptFonts).not.toHaveBeenCalled();
    expect(parser.loads).toBe(1);
  });

  test('a script’s PDF never loads the document fonts or the Markdown parser', async () => {
    const documentFonts = vi.fn(realDocumentFonts);
    const exporter = createExporter(realFonts, documentFonts);
    bytesOf(await exporter({ kind: 'pdf', source: SOURCE, template }));
    await exporter({ kind: 'txt', source: SOURCE, template });
    expect(documentFonts).not.toHaveBeenCalled();
    expect(parser.loads).toBe(0);
  });

  test('answers the characters the fonts lack', async () => {
    const reply = await createExporter(
      realFonts,
      realDocumentFonts,
    )(markdownPdf('# 港 notes\n\nThe sign reads 漢字, and a gull 🐦 sits on it.\n'));
    bytesOf(reply);
    expect(reply).toMatchObject({ missing: ['港', '漢', '字', '🐦'] });
  });

  test('answers a failed font load with an error, and tries the fonts again next time', async () => {
    const load = vi
      .fn<() => Promise<DocumentFontSet>>()
      .mockRejectedValueOnce(new Error('Couldn’t load the font InterTight-Italic.ttf.'))
      .mockImplementation(realDocumentFonts);
    const exporter = createExporter(realFonts, load);
    expect(await exporter(markdownPdf())).toEqual({
      error: 'Couldn’t load the font InterTight-Italic.ttf.',
    });
    bytesOf(await exporter(markdownPdf()));
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('fetching the document fonts', () => {
  const body = (n: number) => new Response(new Uint8Array([n]));

  test('asks the app’s own folders for the five document fonts', async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      return body(urls.length);
    });
    const fonts = await fetchDocumentFonts(fetcher);
    expect(urls.sort()).toEqual([
      '/fonts/courier-prime/CourierPrime-Regular.ttf',
      '/fonts/inter-tight/InterTight-Italic.ttf',
      '/fonts/inter-tight/InterTight-Regular.ttf',
      '/fonts/inter-tight/InterTight-SemiBold.ttf',
      '/fonts/inter-tight/InterTight-SemiBoldItalic.ttf',
    ]);
    expect(Object.keys(fonts).sort()).toEqual(Object.keys(DOCUMENT_FONT_FILES).sort());
    expect(Object.values(fonts).every((bytes) => bytes instanceof Uint8Array)).toBe(true);
  });

  test('fails with the file’s name when a document font is missing', async () => {
    const fetcher = async (url: string) =>
      url.endsWith('/InterTight-SemiBoldItalic.ttf')
        ? new Response('no', { status: 404 })
        : body(1);
    await expect(fetchDocumentFonts(fetcher)).rejects.toThrow(
      'Couldn’t load the font InterTight-SemiBoldItalic.ttf.',
    );
  });
});

describe('fetching the fonts', () => {
  const body = (n: number) => new Response(new Uint8Array([n]));

  test('asks the app’s own folder for the four files', async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      return body(urls.length);
    });
    const fonts = await fetchFonts(fetcher);
    expect(urls.sort()).toEqual(
      Object.values(FONT_FILES)
        .map((file) => `/fonts/courier-prime/${file}`)
        .sort(),
    );
    expect(Object.keys(fonts).sort()).toEqual(['bold', 'boldItalic', 'italic', 'regular']);
  });

  test('fails with the file’s name when one is missing', async () => {
    const fetcher = async (url: string) =>
      url.endsWith('Italic.ttf') && !url.includes('Bold')
        ? new Response('no', { status: 404 })
        : body(1);
    await expect(fetchFonts(fetcher)).rejects.toThrow('CourierPrime-Italic.ttf');
  });
});
