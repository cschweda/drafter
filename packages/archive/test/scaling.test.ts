import { describe, expect, test } from 'vitest';
import { listZip, readEntry, type ZipEntry, ZipError } from '../src/zip';
import { makeZip, zeroBomb } from './make-zip';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling, scalingAsync } from './scaling';

/** Text of `bytes` length, varied enough that deflate has real work to do. */
function prose(bytes: number): string {
  const words = [
    'lamp',
    'stair',
    'harbour',
    'Margaret',
    'thermos',
    'gull',
    'fog',
    'night',
    'keeper',
  ];
  let out = '';
  let seed = 7;
  while (out.length < bytes) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out += `${words[seed % words.length]}${seed % 11 === 0 ? '.\n' : ' '}`;
  }
  return out.slice(0, bytes);
}

describe('zip scaling', () => {
  test(
    'listing grows linearly with the entry count',
    () => {
      const make = (n: number) =>
        makeZip(
          Array.from({ length: n }, (_, i) => ({ name: `scene-${i}.txt`, data: `scene ${i}` })),
        );
      const { growth } = scaling(make, (zip) => listZip(zip), 250);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    "reading grows linearly with the entry's size",
    async () => {
      const make = (n: number): [Uint8Array, ZipEntry] => {
        const zip = makeZip([{ name: 'script.txt', data: prose(n) }]);
        const [entry] = listZip(zip);
        if (!entry) throw new Error('one entry');
        return [zip, entry];
      };
      const { growth } = await scalingAsync(
        make,
        ([zip, entry]) => readEntry(zip, entry),
        256 * 1024,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('finds no end record in 32 MiB of junk in under 100 ms', () => {
    const junk = new Uint8Array(32 * 1024 * 1024).fill(0x50);
    const start = performance.now();
    expect(() => listZip(junk)).toThrow(ZipError);
    expect(performance.now() - start).toBeLessThan(100);
  });

  test('refuses a 5 MiB-capped entry whose deflate stream would give 1 GB, in under a second', async () => {
    const { packed, size } = zeroBomb(520_000);
    expect(size).toBeGreaterThan(1_000_000_000);
    const zip = makeZip([
      { name: 'bomb', data: new Uint8Array(0), raw: packed, declaredSize: 5 * 1024 * 1024 },
    ]);
    const [entry] = listZip(zip);
    if (!entry) throw new Error('one entry');
    const start = performance.now();
    await expect(readEntry(zip, entry)).rejects.toThrow(ZipError);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
