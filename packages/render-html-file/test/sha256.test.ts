import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { base64, cspHash, sha256 } from '../src/sha256';

const node = (bytes: Uint8Array) => new Uint8Array(createHash('sha256').update(bytes).digest());

describe('sha256', () => {
  it('gives the standard’s answers', () => {
    const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
    expect(hex(sha256(new Uint8Array()))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with Node’s at every length around a block’s edges', () => {
    for (let n = 0; n <= 200; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 0xff);
      expect(sha256(bytes), String(n)).toEqual(node(bytes));
    }
  });

  it('a property: agrees with Node’s on any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 3000 }), (bytes) => {
        expect(sha256(bytes)).toEqual(node(bytes));
      }),
    );
  });

  it('base64 agrees with Node’s, past the chunk it reads in', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, i) => (i * 7) & 0xff);
    expect(base64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('a CSP hash is the UTF-8 text’s, quoted', () => {
    const text = 'body { color: red; } é';
    expect(cspHash(text)).toBe(
      `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`,
    );
  });
});
