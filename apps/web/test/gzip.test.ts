import fc from 'fast-check';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { canCompress, gunzip, gzip } from '../app/storage/gzip';

afterEach(() => vi.unstubAllGlobals());

describe('gzip', () => {
  test('gzip and gunzip give any text back', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'grapheme' }), async (text) => {
        expect(await gunzip(await gzip(text))).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  test('gzip cuts a script to well under half', async () => {
    const scene =
      'INT. KITCHEN - NIGHT\n\nMara stands at the sink, running water over a cup that is already clean.\n\nMARA\nYou said you would call.\n\nJONAH\n(quietly)\nI said I would try.\n\n';
    const script = Array.from({ length: 200 }, (_, i) =>
      scene.replace('KITCHEN', `ROOM ${i}`),
    ).join('');
    const bytes = await gzip(script);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeLessThan(new TextEncoder().encode(script).length * 0.5);
  });

  test('canCompress is false without CompressionStream', () => {
    expect(canCompress()).toBe(true);
    vi.stubGlobal('CompressionStream', undefined);
    expect(canCompress()).toBe(false);
  });

  test('gunzip rejects bytes that are not gzip', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow();
  });
});
