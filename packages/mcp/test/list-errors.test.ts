// An importer that fails in a way it doesn't name (a plain Error, a RangeError) never fails the
// whole list_scripts call: the file is listed, refused in a fixed phrase, never the error's text.
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Connected, connect } from './connect';
import { put, tempFolder } from './temp';

vi.mock('@drafter/fdx', async (original) => {
  const real = await original<typeof import('@drafter/fdx')>();
  return {
    ...real,
    fromFdx: (text: string) => {
      if (text.includes('BOOM')) throw new RangeError('/secret/path/BOOM went wrong');
      return real.fromFdx(text);
    },
  };
});

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe('list_scripts and an importer that fails unexpectedly', () => {
  it('the call answers, and that file is listed as refused in a fixed phrase', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'a.fountain'), 'INT. HALL - DAY\n');
    put(join(dir, 'Lib', 'b.fdx'), '<?xml version="1.0"?>\n<FinalDraft>BOOM</FinalDraft>\n');
    open = await connect({ folders: [join(dir, 'Lib')] });
    const result = await open.call('list_scripts', {});
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toContain('secret');
    expect(text).not.toContain('BOOM');
    const listing = result.structuredContent as {
      files: Array<{ path: string; content: string; refused: string | null }>;
      manifest: { refused: number };
    };
    expect(listing.files.map((f) => [f.path, f.content, f.refused])).toEqual([
      ['Lib/a.fountain', 'fountain', null],
      ['Lib/b.fdx', 'not a script', 'Drafter can’t open that file.'],
    ]);
    expect(listing.manifest.refused).toBe(1);
  });
});

// A file of 540,000 one-line scenes and actions outgrew the reader's heap, and the reader stopping failed
// the whole folder's listing (red/blue audit, 2026-11-03). Now that file alone is refused.
describe('list_scripts and a file with too many paragraphs', () => {
  it('lists the folder, with that file refused as too long', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'a.fountain'), 'INT. HALL - DAY\n\nA line.\n');
    put(join(dir, 'Lib', 'huge.fountain'), 'INT. A\n\nB\n\n'.repeat(270_000));
    open = await connect({ folders: [join(dir, 'Lib')] });
    const result = await open.call('list_scripts', {});
    expect(result.isError).toBeFalsy();
    const listing = result.structuredContent as {
      files: Array<{ path: string; content: string; refused: string | null }>;
    };
    expect(listing.files.map((f) => [f.path, f.content])).toEqual([
      ['Lib/a.fountain', 'fountain'],
      ['Lib/huge.fountain', 'not a script'],
    ]);
    expect(listing.files[1]?.refused).toContain('more than 300,000 paragraphs');
  });
});

describe('the paragraph count', () => {
  it('reads LF, CR, and CRLF line endings alike, so none slips past the cap', async () => {
    const { moreParagraphsThan } = await import('../src/inside');
    for (const end of ['\n', '\r', '\r\n']) {
      const text = `A${end}${end}`.repeat(11);
      expect(moreParagraphsThan(text, 10), JSON.stringify(end)).toBe(true);
      expect(moreParagraphsThan(text, 11), JSON.stringify(end)).toBe(false);
    }
    // Lines of one paragraph, whatever ends them, are one paragraph.
    expect(moreParagraphsThan('A\r\nB\rC\nD', 1)).toBe(false);
  });
});
