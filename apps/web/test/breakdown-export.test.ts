import { readFile } from 'node:fs/promises';
import { DOCUMENT_FONT_FILES, type DocumentFontSet } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { extract } from '../../../packages/render-pdf/test/helpers';
import { createExporter, longDate } from '../app/workers/export-compute';

// The breakdown report's two exports (production design §9): a CSV as text, and a table PDF.

const template = builtins['us-screenplay'] as Template;
const FOLDER = new URL('../../../packages/render-pdf/fonts/', import.meta.url);
async function realDocumentFonts(): Promise<DocumentFontSet> {
  const entries = await Promise.all(
    Object.entries(DOCUMENT_FONT_FILES).map(
      async ([face, file]) =>
        [face, new Uint8Array(await readFile(new URL(file, FOLDER)))] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as DocumentFontSet;
}
const SOURCE = `Title: The Hall

INT. HALL - DAY

= Wren arrives.

WREN walks in, "quietly".

WREN
Hello, hall.

EXT. YARD - NIGHT

Wind.
`;
const request = (kind: 'breakdown-csv' | 'breakdown-pdf') =>
  ({ kind, source: SOURCE, template, title: 'The Hall', today: '2026-11-09' }) as const;
const exporter = () =>
  createExporter(async () => {
    throw new Error('no script fonts needed');
  }, realDocumentFonts);

describe('the breakdown exports', () => {
  test('the CSV is a header row and a row per scene, as text', async () => {
    const reply = await exporter()(request('breakdown-csv'));
    if (!('data' in reply) || typeof reply.data !== 'string') throw new Error('no text');
    const lines = reply.data.split('\r\n');
    expect(lines[0]).toBe('Scene,INT/EXT,Location,Time,Pages,Page,Cast,Synopsis');
    expect(lines[1]).toMatch(/^1,INT,HALL,DAY,\d.*,1,WREN,Wren arrives\.$/);
    expect(lines[2]).toMatch(/^2,EXT,YARD,NIGHT,/);
    expect(lines[3]).toBe('');
    expect(reply.data.charCodeAt(0)).not.toBe(0xfeff);
  });

  test('the PDF holds every row’s text, titled and dated', async () => {
    const reply = await exporter()(request('breakdown-pdf'));
    if (!('data' in reply) || typeof reply.data === 'string') throw new Error('no bytes');
    const [page] = await extract(reply.data);
    const text = page?.items.map((i) => i.str).join(' ') ?? '';
    for (const cell of [
      'Scene',
      'INT/EXT',
      'Synopsis',
      'HALL',
      'YARD',
      'NIGHT',
      'WREN',
      'Wren arrives.',
    ]) {
      expect(text).toContain(cell);
    }
    expect(text).toContain('The Hall — 9 November 2026');
    expect([page?.width, page?.height]).toEqual([792, 612]);
  });

  test('longDate says the day, month, and year', () => {
    expect(longDate('2026-11-09')).toBe('9 November 2026');
    expect(longDate('nonsense')).toBe('nonsense');
  });
});
