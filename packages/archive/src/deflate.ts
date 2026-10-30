// A walk over a raw deflate stream (RFC 1951) that inflates nothing: it decodes every block's
// codes, counts the bytes they would give, and finds where the final block ends. The platform's
// DecompressionStream does the inflating; this walk is what lets the reader refuse a stream that
// gives more than its entry declares before anything is inflated, and refuse bytes after the
// stream's end, which not every DecompressionStream does (Node 22's drops them silently).
// Each step reads at least one bit, so the walk is linear in the compressed size.

/** Thrown for a stream that isn't valid deflate, or that gives more than its limit. */
export class DeflateWalkError extends Error {
  constructor() {
    super('The deflate stream is damaged, or gives more than its limit.');
  }
}

const MAX_BITS = 15;

// RFC 1951 §3.2.5: the base and extra bits of each length symbol (257 to 285) and distance symbol.
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
// §3.2.7: the order the code length code's lengths are sent in.
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A canonical Huffman code: how many codes of each length, and the symbols in code order. */
interface Code {
  counts: Uint16Array;
  symbols: Uint16Array;
}

/**
 * The code for a list of lengths. As zlib does: over-subscribed lengths are refused, and so are
 * incomplete ones, except no codes at all (decoding then fails at the first use) and, outside the
 * code length code, a single code of length 1.
 */
function buildCode(lengths: ArrayLike<number>, codeLengths = false): Code {
  const counts = new Uint16Array(MAX_BITS + 1);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i] as number]++;
  counts[0] = 0;
  let left = 1;
  let used = 0;
  for (let len = 1; len <= MAX_BITS; len++) {
    left = (left << 1) - (counts[len] as number);
    if (left < 0) throw new DeflateWalkError(); // over-subscribed
    used += counts[len] as number;
  }
  const single = used === 1 && counts[1] === 1;
  if (left > 0 && used > 0 && (codeLengths || !single)) throw new DeflateWalkError(); // incomplete
  const offsets = new Uint16Array(MAX_BITS + 2);
  for (let len = 1; len <= MAX_BITS; len++) {
    offsets[len + 1] = (offsets[len] as number) + (counts[len] as number);
  }
  const symbols = new Uint16Array(lengths.length);
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym] as number;
    if (len) symbols[offsets[len]++] = sym;
  }
  return { counts, symbols };
}

const FIXED_LIT = buildCode(
  Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)),
);
// §3.2.6: 32 distance codes of 5 bits; 30 and 31 never occur, and are refused when they do.
const FIXED_DIST = buildCode(Array.from({ length: 32 }, () => 5));

/**
 * Walks the raw deflate stream in `bytes`, and gives how many bytes it inflates to. Throws a
 * `DeflateWalkError` if the stream is damaged, ends before its final block, has bytes after it,
 * or would give more than `limit` bytes.
 */
export function walkDeflate(bytes: Uint8Array, limit: number): number {
  const end = bytes.length * 8;
  let pos = 0; // in bits
  let out = 0;

  const bits = (n: number): number => {
    if (pos + n > end) throw new DeflateWalkError();
    let v = 0;
    for (let i = 0; i < n; i++, pos++) {
      v |= (((bytes[pos >>> 3] as number) >>> (pos & 7)) & 1) << i;
    }
    return v;
  };

  // Codes are sent from their most significant bit (§3.1.1).
  const decode = (code: Code): number => {
    let value = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAX_BITS; len++) {
      value |= bits(1);
      const count = code.counts[len] as number;
      if (value - first < count) return code.symbols[index + value - first] as number;
      index += count;
      first = (first + count) << 1;
      value <<= 1;
    }
    throw new DeflateWalkError(); // a code the lengths left unused
  };

  const grow = (n: number) => {
    out += n;
    if (out > limit) throw new DeflateWalkError();
  };

  let final = 0;
  while (!final) {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      pos = (pos + 7) & ~7;
      const len = bits(16);
      const nlen = bits(16);
      if ((len ^ 0xffff) !== nlen) throw new DeflateWalkError();
      if (pos + len * 8 > end) throw new DeflateWalkError();
      pos += len * 8;
      grow(len);
      continue;
    }
    let lit = FIXED_LIT;
    let dist = FIXED_DIST;
    if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new DeflateWalkError();
      const clens = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) clens[CLEN_ORDER[i] as number] = bits(3);
      const clen = buildCode(clens, true);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < lengths.length; ) {
        const sym = decode(clen);
        if (sym < 16) {
          lengths[i++] = sym;
          continue;
        }
        let repeat: number;
        let value = 0;
        if (sym === 16) {
          if (i === 0) throw new DeflateWalkError();
          value = lengths[i - 1] as number;
          repeat = 3 + bits(2);
        } else if (sym === 17) repeat = 3 + bits(3);
        else repeat = 11 + bits(7);
        if (i + repeat > lengths.length) throw new DeflateWalkError();
        lengths.fill(value, i, i + repeat);
        i += repeat;
      }
      if (lengths[256] === 0) throw new DeflateWalkError(); // no end of block
      lit = buildCode(lengths.subarray(0, nlen));
      dist = buildCode(lengths.subarray(nlen));
    } else if (type !== 1) {
      throw new DeflateWalkError();
    }
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) {
        grow(1);
      } else if (sym === 256) {
        break;
      } else {
        const l = sym - 257;
        if (l >= 29) throw new DeflateWalkError();
        const length = (LENGTH_BASE[l] as number) + bits(LENGTH_EXTRA[l] as number);
        const d = decode(dist);
        if (d >= 30) throw new DeflateWalkError();
        const distance = (DIST_BASE[d] as number) + bits(DIST_EXTRA[d] as number);
        if (distance > out) throw new DeflateWalkError(); // reaches before the start
        grow(length);
      }
    }
  }
  // The stream must fill the bytes exactly: the final block ends in the last byte.
  if ((pos + 7) >>> 3 !== bytes.length) throw new DeflateWalkError();
  return out;
}
