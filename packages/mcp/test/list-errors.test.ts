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
