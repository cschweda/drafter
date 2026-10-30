import { constants, deflateRawSync } from 'node:zlib';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { listZip, readEntry, ZipError } from '../src/zip';
import { makeZip } from './make-zip';

const segment = fc.stringMatching(/^[A-Za-z0-9_ -][A-Za-z0-9_. -]{0,11}$/);
const entries = fc.uniqueArray(
  fc.record({
    name: fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join('/')),
    data: fc.uint8Array({ maxLength: 4096 }),
    method: fc.constantFrom(0 as const, 8 as const),
  }),
  { maxLength: 6, selector: (e) => e.name },
);

/** Every entry's name and bytes, or the ZipError's reason; any other error fails the test. */
async function readAll(bytes: Uint8Array): Promise<{ name: string; data: number[] }[] | string> {
  try {
    const out = [];
    for (const entry of listZip(bytes)) {
      out.push({ name: entry.name, data: [...(await readEntry(bytes, entry))] });
    }
    return out;
  } catch (error) {
    if (error instanceof ZipError) return error.reason;
    throw error;
  }
}

describe('zip properties', () => {
  test('makeZip then listZip and readEntry gives the entries back', async () => {
    await fc.assert(
      fc.asyncProperty(entries, async (list) => {
        const got = await readAll(makeZip(list));
        expect(got).toEqual(list.map((e) => ({ name: e.name, data: [...e.data] })));
      }),
      { numRuns: 100 },
    );
  });

  test('reads back deflate streams of every level and strategy', async () => {
    const strategies = [
      constants.Z_DEFAULT_STRATEGY,
      constants.Z_FILTERED,
      constants.Z_HUFFMAN_ONLY,
      constants.Z_RLE,
      constants.Z_FIXED,
    ];
    const words = fc.array(fc.constantFrom('INT.', 'night', 'MARGARET', 'the', 'lamp', '\n', ' '), {
      maxLength: 3000,
    });
    await fc.assert(
      fc.asyncProperty(
        words,
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom(...strategies),
        async (parts, level, strategy) => {
          const data = new TextEncoder().encode(parts.join(''));
          const raw = new Uint8Array(deflateRawSync(data, { level, strategy }));
          const got = await readAll(makeZip([{ name: 'script.txt', data, raw }]));
          expect(got).toEqual([{ name: 'script.txt', data: [...data] }]);
        },
      ),
      { numRuns: 150 },
    );
  });

  test('any bytes list or throw a ZipError, never anything else', async () => {
    const eocd = Uint8Array.of(0x50, 0x4b, 0x05, 0x06);
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 2048 }),
        fc.boolean(),
        fc.uint8Array({ minLength: 18, maxLength: 18 }),
        async (junk, withEnd, tail) => {
          // Half the time, end with something shaped like an end record, so listing gets further.
          const bytes = withEnd ? Uint8Array.from([...junk, ...eocd, ...tail]) : junk;
          await readAll(bytes);
        },
      ),
      { numRuns: 300 },
    );
  });

  test('changing any one byte of a valid archive reads the same, or throws a ZipError', async () => {
    await fc.assert(
      fc.asyncProperty(
        entries.filter((list) => list.length > 0),
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
        async (list, at, delta) => {
          const zip = makeZip(list);
          const index = at % zip.length;
          zip[index] = ((zip[index] ?? 0) + delta) & 0xff;
          const got = await readAll(zip);
          if (typeof got !== 'string') {
            expect(got).toEqual(list.map((e) => ({ name: e.name, data: [...e.data] })));
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
