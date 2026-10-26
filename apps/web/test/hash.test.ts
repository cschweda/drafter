import { describe, expect, test } from 'vitest';
import { hashText } from '../app/storage/hash';

describe('hashText', () => {
  test('is the SHA-256 of the UTF-8 text, in hex', async () => {
    expect(await hashText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await hashText('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await hashText('é')).not.toBe(await hashText('e'));
  });
});
