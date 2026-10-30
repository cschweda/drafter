import { afterEach, describe, expect, test, vi } from 'vitest';
import { listZip, readEntry, ZIP_LIMITS, ZipError, type ZipReason } from '../src/zip';
import { makeZip, zeroBomb } from './make-zip';

const SCENE = `INT. LIGHTHOUSE - NIGHT

The lamp turns. MARGARET climbs the last of the stairs with a thermos.

MARGARET
Ninety-one steps. Every night, ninety-one.
`;

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function reason(run: () => unknown): ZipReason | 'no error' {
  try {
    run();
  } catch (error) {
    if (error instanceof ZipError) return error.reason;
    throw error;
  }
  return 'no error';
}

async function readReason(run: () => Promise<unknown>): Promise<ZipReason | 'no error'> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ZipError) return error.reason;
    throw error;
  }
  return 'no error';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading', () => {
  test('lists a stored and a deflated entry with their names and sizes', () => {
    const zip = makeZip([
      { name: 'notes.txt', data: 'Bring the spare bulb.', method: 0 },
      { name: 'scene.fountain', data: SCENE, method: 8 },
    ]);
    const entries = listZip(zip);
    expect(entries.map((e) => [e.name, e.method, e.size, e.directory])).toEqual([
      ['notes.txt', 0, 21, false],
      ['scene.fountain', 8, new TextEncoder().encode(SCENE).length, false],
    ]);
    expect(entries[1]?.compressedSize).toBeLessThan(entries[1]?.size ?? 0);
  });

  test('reads a stored entry and a deflated one back exactly', async () => {
    const zip = makeZip([
      { name: 'notes.txt', data: 'Bring the spare bulb.', method: 0 },
      { name: 'scene.fountain', data: SCENE, method: 8 },
    ]);
    const [stored, deflated] = listZip(zip);
    if (!stored || !deflated) throw new Error('two entries');
    expect(text(await readEntry(zip, stored))).toBe('Bring the spare bulb.');
    expect(text(await readEntry(zip, deflated))).toBe(SCENE);
  });

  test('reads a UTF-8 name when flag bit 11 is set, and a Latin-1 one when not', () => {
    const zip = makeZip([
      { name: 'café/scène.txt', data: 'x', flags: 0x800 },
      { name: 'café.txt', data: 'y' },
    ]);
    // The second name is the single byte 0xE9, read as one Latin-1 character.
    expect(listZip(zip).map((e) => e.name)).toEqual(['café/scène.txt', 'café.txt']);
    const wrongWay = makeZip([{ name: 'cafÃ©.txt', data: 'z' }]);
    expect(listZip(wrongWay)[0]?.name).toBe('cafÃ©.txt');
  });

  test('lists folders as directory entries', () => {
    const zip = makeZip([
      { name: 'Assets/', data: '', method: 0 },
      { name: 'Assets/text.md', data: SCENE },
    ]);
    expect(listZip(zip).map((e) => [e.name, e.directory])).toEqual([
      ['Assets/', true],
      ['Assets/text.md', false],
    ]);
  });

  test('finds the end record past a comment, and not one inside the comment', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'one' }], { comment: 'Packed by hand.' });
    expect(listZip(zip).map((e) => e.name)).toEqual(['a.txt']);
    // A comment holding an end record of its own, whose comment length doesn't reach the end.
    const fake = `\x50\x4b\x05\x06${'\0'.repeat(16)}\x05\0 and then some more words`;
    const tricky = makeZip([{ name: 'b.txt', data: 'two' }], { comment: fake });
    expect(listZip(tricky).map((e) => e.name)).toEqual(['b.txt']);
  });
});

describe('refusing the archive', () => {
  test("refuses bytes that aren't a zip archive", () => {
    const enc = new TextEncoder();
    expect(reason(() => listZip(enc.encode(SCENE)))).toBe('not-zip');
    const fdx =
      '<?xml version="1.0"?>\n<FinalDraft DocumentType="Script"><Content/></FinalDraft>\n';
    expect(reason(() => listZip(enc.encode(fdx)))).toBe('not-zip');
    expect(reason(() => listZip(new Uint8Array(0)))).toBe('not-zip');
    expect(reason(() => listZip(new Uint8Array(21)))).toBe('not-zip');
  });

  test('refuses an archive over 32 MiB without reading it', () => {
    const big = new Uint8Array(32 * 1024 * 1024 + 1);
    expect(ZIP_LIMITS.maxArchiveBytes).toBe(32 * 1024 * 1024);
    expect(reason(() => listZip(big))).toBe('too-big');
  });

  test('refuses more than 1,000 entries', () => {
    const make = (n: number) =>
      makeZip(Array.from({ length: n }, (_, i) => ({ name: `f${i}`, data: '', method: 0 })));
    expect(listZip(make(1000))).toHaveLength(1000);
    expect(reason(() => listZip(make(1001)))).toBe('too-many-entries');
  });

  test('refuses an archive whose declared sizes sum past 256 MiB', () => {
    const entries = Array.from({ length: 52 }, (_, i) => ({
      name: `part${i}`,
      data: 'x',
      declaredSize: 5 * 1024 * 1024,
    }));
    expect(listZip(makeZip(entries.slice(0, 51)))).toHaveLength(51);
    expect(reason(() => listZip(makeZip(entries)))).toBe('too-big-unpacked');
  });

  test('refuses zip64', () => {
    expect(reason(() => listZip(makeZip([{ name: 'a', data: 'a' }], { zip64Locator: true })))).toBe(
      'zip64',
    );
    expect(
      reason(() => listZip(makeZip([{ name: 'a', data: 'a', declaredSize: 0xffffffff }]))),
    ).toBe('zip64');
  });

  test('refuses a split archive', () => {
    expect(reason(() => listZip(makeZip([{ name: 'a', data: 'a' }], { disk: 1 })))).toBe('split');
  });

  test('refuses an archive holding any encrypted entry', () => {
    const plain = { name: 'readme.txt', data: 'hello' };
    expect(reason(() => listZip(makeZip([plain, { name: 'x', data: 'y', flags: 1 }])))).toBe(
      'encrypted',
    );
    expect(reason(() => listZip(makeZip([plain, { name: 'x', data: 'y', flags: 0x40 }])))).toBe(
      'encrypted',
    );
  });

  test('refuses unsafe names', () => {
    for (const name of ['/etc/x', 'a/../b', '..', 'C:x', 'a\\b', 'a\0b', 'a\x1bb', '']) {
      const zip = makeZip([
        { name: 'fine.txt', data: 'ok' },
        { name, data: 'bad' },
      ]);
      expect(
        reason(() => listZip(zip)),
        JSON.stringify(name),
      ).toBe('unsafe-name');
    }
  });

  test('refuses two entries with the same name', () => {
    const zip = makeZip([
      { name: 'text.md', data: 'one' },
      { name: 'text.md', data: 'two' },
    ]);
    expect(reason(() => listZip(zip))).toBe('duplicate-name');
  });

  test('refuses overlapping entries', () => {
    const entries = [
      { name: 'a', data: 'first', method: 0 },
      { name: 'b', data: 'second', method: 0 },
    ];
    expect(listZip(makeZip(entries))).toHaveLength(2);
    expect(reason(() => listZip(makeZip(entries, { overlap: [0, 1] })))).toBe('damaged');
  });

  test('refuses a local header whose name differs from its central record', () => {
    const zip = makeZip([{ name: 'text.md', data: 'one', localName: 'evil.md' }]);
    expect(reason(() => listZip(zip))).toBe('damaged');
  });

  test('refuses data that runs past the central directory', () => {
    const zip = makeZip([{ name: 'text.md', data: 'one', method: 0 }]);
    // The central record's compressed size (offset 20 into it), made larger than the data.
    const central = zip.length - 22 - (46 + 'text.md'.length);
    zip[central + 20] = 200;
    expect(reason(() => listZip(zip))).toBe('damaged');
  });

  test('refuses prepended data', () => {
    const zip = makeZip([{ name: 'text.md', data: SCENE }]);
    const stub = new TextEncoder().encode('#!/bin/sh\nexit 0\n');
    // A self-extractor whose offsets count from the file's start.
    expect(
      reason(() => listZip(makeZip([{ name: 'text.md', data: SCENE }], { prefix: stub }))),
    ).toBe('not-zip');
    // And one whose offsets don't.
    const joined = new Uint8Array(stub.length + zip.length);
    joined.set(stub);
    joined.set(zip, stub.length);
    expect(reason(() => listZip(joined))).toBe('not-zip');
  });
});

describe('refusing an entry', () => {
  test('refuses an entry declared over 5 MiB before inflating', async () => {
    const zip = makeZip([{ name: 'big', data: 'small really', declaredSize: 5 * 1024 * 1024 + 1 }]);
    const [entry] = listZip(zip);
    if (!entry) throw new Error('one entry');
    const spy = vi.fn();
    vi.stubGlobal(
      'DecompressionStream',
      class {
        constructor() {
          spy();
          throw new Error('should not inflate');
        }
      },
    );
    expect(await readReason(() => readEntry(zip, entry))).toBe('entry-too-big');
    expect(spy).not.toHaveBeenCalled();
  });

  test('stops inflating past the declared size and refuses the entry', async () => {
    const zip = makeZip([{ name: 'scene.fountain', data: SCENE.repeat(50), declaredSize: 100 }]);
    const [entry] = listZip(zip);
    if (!entry) throw new Error('one entry');
    expect(await readReason(() => readEntry(zip, entry))).toBe('damaged');
    const stored = makeZip([{ name: 's', data: SCENE, method: 0, declaredSize: 10 }]);
    const [s] = listZip(stored);
    if (!s) throw new Error('one entry');
    expect(await readReason(() => readEntry(stored, s))).toBe('damaged');
  });

  test('refuses a CRC-32 mismatch', async () => {
    for (const method of [0, 8] as const) {
      const zip = makeZip([{ name: 'scene', data: SCENE, method, declaredCrc: 0x12345678 }]);
      const [entry] = listZip(zip);
      if (!entry) throw new Error('one entry');
      expect(await readReason(() => readEntry(zip, entry)), `method ${method}`).toBe('damaged');
    }
  });

  test('refuses junk after a deflate stream', async () => {
    const good = makeZip([{ name: 'scene', data: SCENE }]);
    const [g] = listZip(good);
    if (!g) throw new Error('one entry');
    const packed = good.slice(g.dataOffset, g.dataOffset + g.compressedSize);
    const raw = new Uint8Array(packed.length + 4);
    raw.set(packed);
    raw.set([1, 2, 3, 4], packed.length);
    const zip = makeZip([{ name: 'scene', data: SCENE, raw }]);
    const [entry] = listZip(zip);
    if (!entry) throw new Error('one entry');
    expect(await readReason(() => readEntry(zip, entry))).toBe('damaged');
    // And a stream cut short.
    const cut = makeZip([{ name: 'scene', data: SCENE, raw: packed.slice(0, -2) }]);
    const [c] = listZip(cut);
    if (!c) throw new Error('one entry');
    expect(await readReason(() => readEntry(cut, c))).toBe('damaged');
  });

  test("refuses a method it doesn't read", async () => {
    const zip = makeZip([{ name: 'scene.bz2', data: SCENE, method: 12 }]);
    const [entry] = listZip(zip);
    expect(entry?.method).toBe(12);
    if (!entry) throw new Error('one entry');
    expect(await readReason(() => readEntry(zip, entry))).toBe('method');
  });

  test('reads a stored entry and refuses a deflated one where DecompressionStream is missing', async () => {
    const zip = makeZip([
      { name: 'stored', data: SCENE, method: 0 },
      { name: 'deflated', data: SCENE, method: 8 },
    ]);
    const [stored, deflated] = listZip(zip);
    if (!stored || !deflated) throw new Error('two entries');
    vi.stubGlobal('DecompressionStream', undefined);
    expect(text(await readEntry(zip, stored))).toBe(SCENE);
    expect(await readReason(() => readEntry(zip, deflated))).toBe('no-inflate');
    vi.stubGlobal(
      'DecompressionStream',
      class {
        constructor(format: string) {
          throw new TypeError(`Unsupported format ${format}`);
        }
      },
    );
    expect(await readReason(() => readEntry(zip, deflated))).toBe('no-inflate');
  });

  test('the zero bomb the scaling test uses inflates as it says', async () => {
    const { packed, size } = zeroBomb(3);
    const zip = makeZip([{ name: 'zeros', data: new Uint8Array(size), raw: packed }]);
    const [entry] = listZip(zip);
    if (!entry) throw new Error('one entry');
    const out = await readEntry(zip, entry);
    expect(out.length).toBe(size);
    expect(out.every((b) => b === 0)).toBe(true);
  });
});
