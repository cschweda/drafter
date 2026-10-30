// Highland archives built by makeZip, shaped as the app maker's public description gives the file
// (docs/DECISIONS.md): a zip of a TextBundle, with `text.fountain`, `info.json` and other JSON the
// app keeps, and an `assets/` folder. The description doesn't say whether the bundle's folder is
// inside the zip, so both shapes are built. Every text and name past those is the tests' own.
import { parse } from '@drafter/fountain';
import { describe, expect, it, vi } from 'vitest';
import { ArchiveError, type ArchiveReason } from '../src/errors';
import { fromHighland, HIGHLAND_METADATA } from '../src/highland';
import * as zip from '../src/zip';
import { type MakeEntry, makeZip } from './make-zip';

vi.mock('../src/zip', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/zip')>();
  return { ...original, readEntry: vi.fn(original.readEntry) };
});

const SCRIPT = `Title: The Lamp
Author: Ilse Varga

INT. LIGHTHOUSE - NIGHT

The lamp turns. MARGARET climbs the last stairs, a thermos under her arm.

MARGARET
Ninety-one steps. Every night, ninety-one.
`;

const BUNDLE = 'The Lamp.textbundle/';

const highland = (entries: MakeEntry[]) => makeZip(entries);

/** A package as the description gives it: the script, the app's JSON, and nothing else. */
const plain = (prefix = '', data: string | Uint8Array = SCRIPT) =>
  highland([
    { name: `${prefix}text.fountain`, data },
    { name: `${prefix}info.json`, data: '{"version":2}' },
  ]);

async function refusal(bytes: Uint8Array): Promise<ArchiveError> {
  try {
    await fromHighland(bytes);
  } catch (error) {
    if (error instanceof ArchiveError) return error;
    throw error;
  }
  throw new Error('expected an ArchiveError');
}

const reasonOf = async (bytes: Uint8Array): Promise<ArchiveReason> => (await refusal(bytes)).reason;

describe('fromHighland: finding and reading the script', () => {
  it('reads the Fountain script out of a Highland archive', async () => {
    for (const prefix of ['', BUNDLE]) {
      const result = await fromHighland(plain(prefix));
      expect(result).toEqual({
        text: SCRIPT,
        title: null,
        mapped: [],
        ignored: [],
        ignoredCount: 0,
      });
      expect(parse(result.text).blocks.some((b) => b.kind === 'scene_heading')).toBe(true);
    }
  });

  it('reads it stored or deflated', async () => {
    for (const method of [0, 8]) {
      const bytes = highland([{ name: 'text.fountain', data: SCRIPT, method }]);
      expect((await fromHighland(bytes)).text).toBe(SCRIPT);
    }
  });

  it('takes off a BOM and turns CRLF into LF', async () => {
    const crlf = `﻿${SCRIPT.replace(/\n/g, '\r\n')}`;
    expect((await fromHighland(plain('', crlf))).text).toBe(SCRIPT);
    expect((await fromHighland(plain('', 'One.\rTwo.\r'))).text).toBe('One.\nTwo.\n');
  });

  it('ignores __MACOSX and dot-files when finding the script', async () => {
    const bytes = highland([
      { name: '__MACOSX/._text.fountain', data: 'resource fork' },
      { name: '.text.fountain', data: 'hidden' },
      { name: '.Trash/old.fountain', data: 'old' },
      { name: 'text.fountain', data: SCRIPT },
    ]);
    expect((await fromHighland(bytes)).text).toBe(SCRIPT);
  });

  it('takes the shallowest script when one sits deeper too', async () => {
    const bytes = highland([
      { name: `${BUNDLE}drafts/draft one.fountain`, data: 'An older draft.\n' },
      { name: `${BUNDLE}The Lamp.fountain`, data: SCRIPT },
    ]);
    const result = await fromHighland(bytes);
    expect(result.text.startsWith(SCRIPT)).toBe(true);
    expect(result.text).toContain('drafts/draft one.fountain');
  });

  it('prefers text.fountain, the TextBundle name, over another script beside it', async () => {
    const bytes = highland([
      { name: 'copy.fountain', data: 'A copy.\n' },
      { name: 'text.fountain', data: SCRIPT },
    ]);
    expect((await fromHighland(bytes)).text.startsWith(SCRIPT)).toBe(true);
  });

  it('reads the script from an archive whose other entries are 20 MiB stored', async () => {
    const big = new Uint8Array(20 * 1024 * 1024);
    const bytes = highland([
      { name: 'assets/reel.mov', data: big, method: 0 },
      { name: 'text.fountain', data: SCRIPT },
    ]);
    const result = await fromHighland(bytes);
    expect(result.text).toBe(
      `${SCRIPT}\n[[highland: Also in the file, not brought in: assets/reel.mov]]\n`,
    );
  });

  it('never reads an entry but the script', async () => {
    const readEntry = vi.mocked(zip.readEntry);
    readEntry.mockClear();
    const bytes = highland([
      { name: `${BUNDLE}info.json`, data: '{}' },
      { name: `${BUNDLE}assets/cover.png`, data: 'not really a png' },
      { name: `${BUNDLE}notes.txt`, data: 'Call the harbour master.' },
      { name: `${BUNDLE}text.fountain`, data: SCRIPT },
    ]);
    await fromHighland(bytes);
    expect(readEntry).toHaveBeenCalledTimes(1);
    expect(readEntry.mock.calls[0]?.[1].name).toBe(`${BUNDLE}text.fountain`);
  });
});

describe('fromHighland: the closing note', () => {
  it('names the other entries in one closing note, and counts it', async () => {
    const bytes = highland([
      { name: `${BUNDLE}text.fountain`, data: SCRIPT.trimEnd() },
      { name: `${BUNDLE}info.json`, data: '{}' },
      { name: `${BUNDLE}notes.txt`, data: 'Call the harbour master.' },
      { name: `${BUNDLE}assets/`, data: '', method: 0 },
      { name: `${BUNDLE}assets/cover.png`, data: 'png' },
    ]);
    const result = await fromHighland(bytes);
    expect(result.text).toBe(
      `${SCRIPT}\n[[highland: Also in the file, not brought in: notes.txt, assets/cover.png]]\n`,
    );
    expect(result.mapped).toEqual([{ type: 'Also in the file', count: 1 }]);
    const notes = parse(result.text).regions.filter((r) => r.kind === 'note' && r.closed);
    expect(notes).toHaveLength(1);
  });

  it('names an entry outside the script’s folder by its whole name', async () => {
    const bytes = highland([
      { name: `${BUNDLE}text.fountain`, data: SCRIPT },
      { name: 'README.txt', data: 'Read me.' },
    ]);
    expect((await fromHighland(bytes)).text).toContain('not brought in: README.txt]]');
  });

  it('names no metadata, __MACOSX, or dot-file in the note, and writes no note when nothing is left', async () => {
    const bytes = highland([
      { name: `${BUNDLE}text.fountain`, data: SCRIPT },
      { name: `${BUNDLE}info.json`, data: '{}' },
      { name: `${BUNDLE}sprints.json`, data: '[]' },
      { name: `${BUNDLE}Characters.JSON`, data: '[]' },
      { name: `${BUNDLE}.DS_Store`, data: 'x' },
      { name: `__MACOSX/${BUNDLE}._text.fountain`, data: 'x' },
      { name: `${BUNDLE}assets/`, data: '', method: 0 },
    ]);
    const result = await fromHighland(bytes);
    expect(result).toEqual({ text: SCRIPT, title: null, mapped: [], ignored: [], ignoredCount: 0 });
  });

  it('counts JSON under assets/ as the writer’s, not the app’s', () => {
    expect(HIGHLAND_METADATA.test('info.json')).toBe(true);
    expect(HIGHLAND_METADATA.test(`${BUNDLE}info.json`)).toBe(true);
    expect(HIGHLAND_METADATA.test('assets/map.json')).toBe(false);
    expect(HIGHLAND_METADATA.test(`${BUNDLE}assets/data/map.json`)).toBe(false);
    expect(HIGHLAND_METADATA.test('notes.txt')).toBe(false);
  });

  it('names at most 50 entries, then how many more', async () => {
    const extra = Array.from({ length: 53 }, (_, i) => ({ name: `assets/${i}.png`, data: 'p' }));
    const result = await fromHighland(
      highland([{ name: 'text.fountain', data: SCRIPT }, ...extra]),
    );
    const named = Array.from({ length: 50 }, (_, i) => `assets/${i}.png`).join(', ');
    expect(result.text).toBe(
      `${SCRIPT}\n[[highland: Also in the file, not brought in: ${named}, and 3 more]]\n`,
    );
    expect(result.mapped).toEqual([{ type: 'Also in the file', count: 1 }]);
  });

  it('writes a name so it can neither close nor open a note or a boneyard', async () => {
    const names = ['a]]b.png', 'c[[d.png', 'e/*f.png', 'g*/h.png', 'last]'];
    const bytes = highland([
      { name: 'text.fountain', data: SCRIPT },
      ...names.map((name) => ({ name, data: 'x' })),
    ]);
    const { text } = await fromHighland(bytes);
    const note = text.slice(SCRIPT.length + 1);
    expect(note).toBe(
      '[[highland: Also in the file, not brought in: a] ]b.png, c[ [d.png, e/ *f.png, g* /h.png, last] ]]\n',
    );
    const doc = parse(text);
    const regions = doc.regions.map((r) => [r.kind, r.closed]);
    expect(regions).toEqual([['note', true]]);
    expect(doc.source.slice(doc.regions[0]?.span.from, doc.regions[0]?.span.to)).toBe(
      note.trimEnd(),
    );
  });

  it('writes the note alone when the script is empty', async () => {
    const bytes = highland([
      { name: 'text.fountain', data: '' },
      { name: 'notes.txt', data: 'x' },
    ]);
    expect((await fromHighland(bytes)).text).toBe(
      '[[highland: Also in the file, not brought in: notes.txt]]\n',
    );
  });
});

describe('fromHighland: refusals', () => {
  it("refuses a script that isn't UTF-8", async () => {
    const error = await refusal(plain('', Uint8Array.of(0x49, 0x4e, 0x54, 0xff, 0x0a)));
    expect(error.reason).toBe('not-utf8');
    expect(error.format).toBe('Highland');
    expect(error.message).toBe(
      'This isn’t a Highland file Drafter can read: its script isn’t UTF-8 text.',
    );
  });

  it('refuses an archive with no script', async () => {
    const markdown = highland([
      { name: 'text.markdown', data: '# Notes' },
      { name: '__MACOSX/._x.fountain', data: 'x' },
      { name: 'folder.fountain/', data: '', method: 0 },
    ]);
    expect(await reasonOf(markdown)).toBe('no-script');
    expect((await refusal(markdown)).message).toBe(
      'This isn’t a Highland file Drafter can read: it holds no script.',
    );
  });

  it('refuses two scripts at the same depth', async () => {
    const bytes = highland([
      { name: 'one.fountain', data: SCRIPT },
      { name: 'two.FOUNTAIN', data: SCRIPT },
    ]);
    expect(await reasonOf(bytes)).toBe('many-scripts');
    const named = highland([
      { name: 'a/text.fountain', data: SCRIPT },
      { name: 'b/text.fountain', data: SCRIPT },
    ]);
    expect(await reasonOf(named)).toBe('many-scripts');
  });

  it('wraps a ZipError as an ArchiveError naming Highland, with the zip reason', async () => {
    const encrypted = highland([{ name: 'text.fountain', data: SCRIPT, flags: 0x1 }]);
    const error = await refusal(encrypted);
    expect(error.reason).toBe('encrypted');
    expect(error.format).toBe('Highland');
    expect(error.cause).toBeInstanceOf(zip.ZipError);
    expect(error.message).toBe('This isn’t a Highland file Drafter can read: it is encrypted.');
    expect(await reasonOf(new TextEncoder().encode(SCRIPT))).toBe('not-zip');
  });
});
