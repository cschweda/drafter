import { constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { DeflateWalkError, walkDeflate } from '../src/deflate';
import { Bits, CLEN_ORDER, emptyDynamicBlocks } from './make-zip';

/** zlib's verdict: how many bytes the stream gives, or null when zlib refuses it or leaves bytes over. */
function zlibCount(bytes: Uint8Array): number | null {
  try {
    const { buffer, engine } = inflateRawSync(bytes, { info: true }) as unknown as {
      buffer: Uint8Array;
      engine: { bytesWritten: number };
    };
    return engine.bytesWritten === bytes.length ? buffer.length : null;
  } catch {
    return null;
  }
}

/** The walk's verdict, in the same terms. */
function walkCount(bytes: Uint8Array): number | null {
  try {
    return walkDeflate(bytes, 1 << 30);
  } catch (error) {
    if (error instanceof DeflateWalkError) return null;
    throw error;
  }
}

/** Canonical codes for a list of lengths (RFC 1951 §3.2.2): symbol to [code, length]. */
function canonical(lengths: number[]): Map<number, [number, number]> {
  const counts = new Array<number>(16).fill(0);
  for (const l of lengths) if (l) counts[l] = (counts[l] ?? 0) + 1;
  const next = new Array<number>(16).fill(0);
  let code = 0;
  for (let len = 1; len < 16; len++) {
    code = (code + (len > 1 ? (counts[len - 1] ?? 0) : 0)) << 1;
    next[len] = code;
  }
  const out = new Map<number, [number, number]>();
  lengths.forEach((l, sym) => {
    if (l) out.set(sym, [next[l]++ as number, l]);
  });
  return out;
}

/**
 * One final dynamic block: the code length code's 19 lengths, then the literal/length and
 * distance lengths sent one symbol each, then the literal 'A' and an end of block.
 */
function dynamic(clens: number[], lit: number[], dist: number[]): Uint8Array {
  const bits = new Bits().put(1, 1).put(2, 2);
  bits
    .put(lit.length - 257, 5)
    .put(dist.length - 1, 5)
    .put(19 - 4, 4);
  for (const sym of CLEN_ORDER) bits.put(clens[sym] ?? 0, 3);
  const clen = canonical(clens);
  for (const l of [...lit, ...dist]) {
    const c = clen.get(l);
    if (!c) throw new Error(`no code length code for ${l}`);
    bits.code(...c);
  }
  const litCodes = canonical(lit);
  for (const sym of [65, 256]) {
    const c = litCodes.get(sym);
    if (c) bits.code(...c);
  }
  return bits.bytes();
}

/** Lengths 0 to 15 at 4 bits each: a complete code length code. */
const CLEN_COMPLETE = [...new Array<number>(16).fill(4), 0, 0, 0];
const litWith = (lengths: Record<number, number>, n = 257) => {
  const out = new Array<number>(n).fill(0);
  for (const [sym, len] of Object.entries(lengths)) out[Number(sym)] = len;
  return out;
};

describe('the deflate walk', () => {
  test('refuses incomplete Huffman codes as zlib does', () => {
    const refused = {
      'an incomplete code length code': dynamic(
        new Array<number>(19).fill(5),
        litWith({ 65: 1, 256: 1 }),
        [1],
      ),
      'a code length code with one 2-bit code unused': dynamic(
        [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        litWith({ 65: 1, 256: 1 }),
        [1],
      ),
      'an incomplete literal/length code': dynamic(CLEN_COMPLETE, litWith({ 65: 2, 256: 2 }), [1]),
      'an incomplete distance code of two symbols': dynamic(
        CLEN_COMPLETE,
        litWith({ 65: 1, 256: 1 }),
        [2, 2],
      ),
    };
    for (const [what, stream] of Object.entries(refused)) {
      expect(zlibCount(stream), what).toBeNull();
      expect(walkCount(stream), what).toBeNull();
    }
  });

  test('takes a single 1-bit code, and no distance codes, as zlib does', () => {
    const taken = {
      'one 1-bit distance code': dynamic(CLEN_COMPLETE, litWith({ 65: 1, 256: 1 }), [1]),
      'no distance codes': dynamic(CLEN_COMPLETE, litWith({ 65: 1, 256: 1 }), [0]),
      'one 1-bit literal/length code': emptyDynamicBlocks(0),
    };
    for (const [what, stream] of Object.entries(taken)) {
      const count = zlibCount(stream);
      expect(count, what).not.toBeNull();
      expect(walkCount(stream), what).toBe(count);
    }
  });

  test('agrees with zlib on damaged streams', () => {
    const strategies = [
      constants.Z_DEFAULT_STRATEGY,
      constants.Z_FILTERED,
      constants.Z_HUFFMAN_ONLY,
      constants.Z_RLE,
      constants.Z_FIXED,
    ];
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 2000 }).map((d) => d.map((b) => b % 7)),
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom(...strategies),
        fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
          minLength: 1,
          maxLength: 3,
        }),
        (data, level, strategy, changes) => {
          const stream = new Uint8Array(deflateRawSync(data, { level, strategy }));
          // Most changes land in the block headers, where the codes are described.
          for (const [at, value] of changes) stream[at % Math.min(stream.length, 40)] = value;
          expect(walkCount(stream)).toBe(zlibCount(stream));
        },
      ),
      { numRuns: 3000 },
    );
  });
});
