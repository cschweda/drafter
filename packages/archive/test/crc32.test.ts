import { describe, expect, test } from 'vitest';
import { crc32 } from '../src/crc32';

describe('crc32', () => {
  test('gives 0xCBF43926 for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  test('gives 0 for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});
