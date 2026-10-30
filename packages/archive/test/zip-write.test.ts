import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { crc32 } from '../src/crc32';
import { listZip, readEntry } from '../src/zip';
import { zipStored } from '../src/zip-write';

const bytes = (text: string) => new TextEncoder().encode(text);
const u16 = (b: Uint8Array, at: number) => (b[at] as number) | ((b[at + 1] as number) << 8);
const u32 = (b: Uint8Array, at: number) =>
  ((b[at] as number) |
    ((b[at + 1] as number) << 8) |
    ((b[at + 2] as number) << 16) |
    ((b[at + 3] as number) << 24)) >>>
  0;

describe('zipStored', () => {
  test("round-trips through the archive's own reader (names, bytes, order)", async () => {
    const entries = [
      { name: 'mimetype', data: bytes('application/epub+zip') },
      { name: 'META-INF/container.xml', data: bytes('<container/>') },
      { name: 'EPUB/fonts/a.ttf', data: new Uint8Array([0, 1, 0, 0, 255, 254, 0]) },
    ];
    const zip = zipStored(entries);
    const listed = listZip(zip);
    expect(listed.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    for (const [i, entry] of listed.entries()) {
      expect(await readEntry(zip, entry)).toEqual(entries[i]?.data);
    }
  });

  test('round-trips any set of entries (property)', async () => {
    const name = fc
      .array(fc.constantFrom('a', 'b', 'Z', '0', '-', '_', '.', 'é', '日'), {
        minLength: 1,
        maxLength: 8,
      })
      .map((cs) => cs.join(''))
      .filter((n) => n !== '.' && n !== '..');
    const path = fc.array(name, { minLength: 1, maxLength: 3 }).map((ps) => ps.join('/'));
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.record({ name: path, data: fc.uint8Array({ maxLength: 300 }) }), {
          selector: (e) => e.name,
          maxLength: 8,
        }),
        async (entries) => {
          const zip = zipStored(entries);
          const listed = listZip(zip);
          expect(listed.map((e) => e.name)).toEqual(entries.map((e) => e.name));
          for (const [i, entry] of listed.entries()) {
            expect(await readEntry(zip, entry)).toEqual(entries[i]?.data);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  test('stores without compression: method 0, sizes equal, the data in place, no extra field', () => {
    const data = bytes('application/epub+zip');
    const zip = zipStored([{ name: 'mimetype', data }]);
    // The first local header, as an EPUB reader looks at it by offset.
    expect(u32(zip, 0)).toBe(0x04034b50);
    expect(u16(zip, 8)).toBe(0); // stored
    expect(u32(zip, 14)).toBe(crc32(data));
    expect(u32(zip, 18)).toBe(data.length);
    expect(u32(zip, 22)).toBe(data.length);
    expect(u16(zip, 26)).toBe(8); // "mimetype"
    expect(u16(zip, 28)).toBe(0); // no extra field
    expect(new TextDecoder().decode(zip.subarray(30, 38))).toBe('mimetype');
    expect(new TextDecoder().decode(zip.subarray(38, 58))).toBe('application/epub+zip');
    const [entry] = listZip(zip);
    expect(entry?.method).toBe(0);
    expect(entry?.compressedSize).toBe(entry?.size);
  });

  test('UTF-8 names, with the language-encoding flag in both headers', async () => {
    const zip = zipStored([{ name: 'Brouillon – été/日本.txt', data: bytes('x') }]);
    expect(u16(zip, 6) & 0x800).toBe(0x800);
    const [entry] = listZip(zip);
    expect(entry?.name).toBe('Brouillon – été/日本.txt');
    // The central record's flag too (the reader insists the two agree).
    expect(entry && (await readEntry(zip, entry))).toEqual(bytes('x'));
  });

  test('an empty entry', async () => {
    const zip = zipStored([{ name: 'empty', data: new Uint8Array() }]);
    const [entry] = listZip(zip);
    expect(entry?.size).toBe(0);
    expect(entry && (await readEntry(zip, entry))).toEqual(new Uint8Array());
  });

  test('no entries is an empty archive', () => {
    expect(listZip(zipStored([]))).toEqual([]);
  });

  test('refuses a name with "..", a leading "/", a backslash, an empty one, or a repeat', () => {
    const one = (name: string) => () => zipStored([{ name, data: new Uint8Array() }]);
    for (const bad of ['../x', 'a/../b', '..', '/abs', 'a\\b', '', 'a\u0000b']) {
      expect(one(bad), bad).toThrow(RangeError);
    }
    expect(() =>
      zipStored([
        { name: 'a', data: new Uint8Array() },
        { name: 'a', data: new Uint8Array() },
      ]),
    ).toThrow(RangeError);
  });

  test('the same entries make the same bytes', () => {
    const entries = [{ name: 'a.txt', data: bytes('one') }];
    expect(zipStored(entries)).toEqual(zipStored(entries));
  });
});
