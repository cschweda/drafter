import { describe, expect, it } from 'vitest';
import { fingerprintLines } from '../src';

async function sha7(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 7);
}

describe('fingerprintLines', () => {
  it('trims and counts repeats', async () => {
    const h = await sha7('Hello');
    expect(await fingerprintLines('  Hello\nHello')).toEqual([`${h}:1`, `${h}:2`]);
  });

  it('gives blank lines fingerprints too', async () => {
    const e = await sha7('');
    expect(await fingerprintLines('a\n\n\n')).toEqual([
      `${await sha7('a')}:1`,
      `${e}:1`,
      `${e}:2`,
      `${e}:3`,
    ]);
  });

  it('treats \\r\\n and \\n alike', async () => {
    expect(await fingerprintLines('a\r\nb')).toEqual(await fingerprintLines('a\nb'));
  });
});
