// A fast non-cryptographic hash written for Drafter (version-history design §3.2, Call 4). Two
// 32-bit lanes each take every UTF-16 code unit by xor and a multiply by an odd constant, then
// each is finished by the usual xor-shift and multiply rounds, so every input bit reaches every
// output bit. A scene version is named by 53 bits of the two (all a double holds exactly); a
// shingle by one lane's 32. Not for anything secret: a collision only makes two versions read
// as one.

const SEED_A = 0x2f6b_7a11;
const SEED_B = 0x5c3d_91e7;
// Odd multipliers taken from mathematical constants, so they owe nothing to any library: the
// golden ratio's fraction (Knuth's multiplicative hashing) and those of the square roots of 2 and 3.
const GOLDEN = 0x9e37_79b1;
const ROOT2 = 0x6a09_e667;
const ROOT3 = 0xbb67_ae85;

/** A 32-bit avalanche: xor-shifts and multiplies, each step reversible. */
function finish(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, ROOT2);
  h ^= h >>> 13;
  h = Math.imul(h, ROOT3);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The two lanes of `text`, each a 32-bit unsigned integer. */
function lanes(text: string): [number, number] {
  let a = SEED_A ^ text.length;
  let b = SEED_B;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, GOLDEN);
    b = Math.imul(b ^ c, ROOT3);
    b ^= b >>> 15;
  }
  // Each lane takes a little of the other before it is finished, so the two halves aren't
  // independent hashes of the same weakness.
  return [finish(a ^ Math.imul(b, GOLDEN)), finish(b ^ a)];
}

/** 53 bits of a hash of `text`, as 14 lowercase hex digits. */
export function hash53(text: string): string {
  const [a, b] = lanes(text);
  return ((b & 0x1f_ffff) * 0x1_0000_0000 + a).toString(16).padStart(14, '0');
}

/** 32 bits of a hash of `text`, from the same lanes, for a shingle. */
export function hash32(text: string): number {
  return lanes(text)[0];
}
