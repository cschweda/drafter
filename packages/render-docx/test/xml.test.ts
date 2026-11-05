import { describe, expect, it } from 'vitest';
import { xmlText } from '../src/xml';

describe('xmlText', () => {
  it('escapes the five characters XML gives a meaning', () => {
    expect(xmlText('<w:fldChar/> & "x" ]]>')).toBe('&lt;w:fldChar/&gt; &amp; &quot;x&quot; ]]&gt;');
    expect(xmlText("it's")).toBe('it&apos;s');
  });

  it('drops the characters XML 1.0 forbids', () => {
    expect(xmlText('a\u0000b￾c')).toBe('abc');
    expect(xmlText('a\u0001\u001F￿b')).toBe('ab');
  });

  it('drops a lone surrogate, high or low, and keeps a pair', () => {
    expect(xmlText('a\uD800b')).toBe('ab');
    expect(xmlText('a\uDC00b')).toBe('ab');
    expect(xmlText('a😀b')).toBe('a😀b');
  });

  it('keeps tab, line feed, and carriage return', () => {
    expect(xmlText('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});
