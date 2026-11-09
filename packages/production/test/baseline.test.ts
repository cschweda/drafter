import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeBaseline, encodeBaseline } from '../src';

/** About 120 pages of screenplay: scenes with varied, repeating-vocabulary prose, like a real script. */
function longScript(): string {
  const words = (
    'night door rain street window quiet shout run hold letter coffee table light shadow ' +
    'answer silence phone engine corner stairs mirror glass whisper station train platform ' +
    'garden harbor lantern bridge knife photograph promise secret morning ticket'
  ).split(' ');
  let seed = 7;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const sentence = (n: number) =>
    Array.from({ length: n }, () => words[next(words.length)]).join(' ');
  const out: string[] = [];
  for (let s = 1; s <= 240; s++) {
    out.push(`INT. ${sentence(2).toUpperCase()} - NIGHT`, '', `${sentence(18)}.`, '');
    for (let d = 0; d < 6; d++) {
      out.push(words[next(8)].toUpperCase(), `${sentence(10)}.`, '');
    }
  }
  return out.join('\n');
}

describe('baseline codec', () => {
  it('round-trips a script', async () => {
    const text = longScript();
    expect(await decodeBaseline(await encodeBaseline(text))).toBe(text);
  });

  it('round-trips non-ASCII text', async () => {
    const text = 'CAFÉ - “quoted” 日本語 😀\r\nline two';
    expect(await decodeBaseline(await encodeBaseline(text))).toBe(text);
  });

  it('encodes a 120-page script under 60 KB', async () => {
    const encoded = await encodeBaseline(longScript());
    expect(encoded.length).toBeLessThan(60 * 1024);
  });

  it('refuses bad base64, bad gzip, and a bomb', async () => {
    expect(await decodeBaseline('!!! not base64 !!!')).toBeNull();
    expect(await decodeBaseline(btoa('this is not gzip'))).toBeNull();
    const bomb = gzipSync(Buffer.alloc(9 * 1024 * 1024, 'a')).toString('base64');
    expect(await decodeBaseline(bomb)).toBeNull();
    expect(await decodeBaseline(await encodeBaseline('hello'), 4)).toBeNull();
  });

  it('keeps a leading byte-order mark', async () => {
    const text = '﻿INT. ROOM - DAY\n\nShe waits.\n';
    expect(await decodeBaseline(await encodeBaseline(text))).toBe(text);
  });
});
