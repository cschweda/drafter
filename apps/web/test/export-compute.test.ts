import { readFile } from 'node:fs/promises';
import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { FONT_FILES, type FontSet } from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import { builtins } from '@drafter/templates';
import { describe, expect, test, vi } from 'vitest';
import { createExporter, fetchFonts } from '../app/workers/export-compute';

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

describe('the export worker', () => {
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
