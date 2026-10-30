import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { el, escapeHtml } from '../src/escape';

/**
 * The text the file can carry for `s`, written out from the rules rather than from the code: a
 * control character (not a tab or a line feed) is a space, a lone surrogate or a noncharacter
 * that XML refuses is U+FFFD, and every other character is itself.
 */
function carried(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const next = s.charCodeAt(i + 1);
    if (c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      out += s[i] + s[i + 1];
      i++;
    } else if (c >= 0xd800 && c <= 0xdfff) out += '�';
    else if (c === 0xfffe || c === 0xffff) out += '�';
    else if (c === 0x09 || c === 0x0a) out += s[i];
    else if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) out += ' ';
    else out += s[i];
  }
  return out;
}

/** Characters that matter here, mixed into the generated strings far more often than chance. */
const awkward = fc.constantFrom(
  '<',
  '>',
  '&',
  '"',
  "'",
  '\0',
  '\r',
  '\t',
  '\n',
  '\u0085',
  ' ',
  '\ud800',
  '\udfff',
  '🎬',
  '￾',
  '</p>',
  '<!--',
  '&amp;',
);
const hostile = fc
  .array(fc.oneof(fc.string({ unit: 'binary', maxLength: 6 }), awkward), { maxLength: 24 })
  .map((parts) => parts.join(''));

describe('escapeHtml', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('turns controls into spaces and keeps tabs and newlines', () => {
    expect(escapeHtml('a\0b\x07c\x1bd\re\x7ff\x85g\x9fh')).toBe('a b c d e f g h');
    expect(escapeHtml('a\tb\nc')).toBe('a\tb\nc');
  });

  it('replaces a lone surrogate', () => {
    expect(escapeHtml('a\ud800b')).toBe('a�b');
    expect(escapeHtml('a\udc00')).toBe('a�');
    expect(escapeHtml('\udc00\ud800')).toBe('��');
    // A pair is one character, and stays.
    expect(escapeHtml('a🎬b')).toBe('a🎬b');
  });

  it('replaces the two noncharacters XML refuses, so the same text can go into an EPUB', () => {
    expect(escapeHtml('a￾b￿')).toBe('a�b�');
  });

  it('leaves everything else as it is, and returns plain text unchanged', () => {
    const text = 'INT. TOKYO — NIGHT 东京 é é   ok';
    expect(escapeHtml(text)).toBe(text);
  });

  it('a property: the escaped text, parsed in a <p> with jsdom, gives back s', () => {
    fc.assert(
      fc.property(hostile, (s) => {
        const host = document.createElement('div');
        host.innerHTML = `<p>${escapeHtml(s)}</p>`;
        expect(host.children.length).toBe(1);
        expect(host.firstElementChild?.tagName).toBe('P');
        expect(host.firstElementChild?.children.length).toBe(0);
        expect(host.textContent).toBe(carried(s));
      }),
      { numRuns: 500 },
    );
  });

  it('a property: an attribute value comes back as itself too', () => {
    fc.assert(
      fc.property(hostile, (s) => {
        const host = document.createElement('div');
        host.innerHTML = `<p title="${escapeHtml(s)}">x</p>`;
        expect(host.firstElementChild?.getAttribute('title')).toBe(carried(s));
        expect(host.firstElementChild?.attributes.length).toBe(1);
      }),
      { numRuns: 300 },
    );
  });

  it('a property: escaped text is well-formed XML text too (for the EPUB)', () => {
    const parser = new DOMParser();
    fc.assert(
      fc.property(hostile, (s) => {
        const xml = parser.parseFromString(
          `<p xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(s)}</p>`,
          'application/xhtml+xml',
        );
        expect(xml.getElementsByTagName('parsererror').length).toBe(0);
        // XML reads a carriage return as a line feed; there is none left to read.
        expect(xml.documentElement.textContent).toBe(carried(s));
      }),
      { numRuns: 300 },
    );
  });

  it('is linear in the length of the text', () => {
    const unit = '<&>"\'\0\ud800ab';
    const time = (n: number) => {
      const text = unit.repeat(n);
      const start = performance.now();
      escapeHtml(text);
      return performance.now() - start;
    };
    time(20_000);
    const small = Math.max(time(50_000), 1);
    const large = time(400_000);
    expect(large / small).toBeLessThan(40);
  });
});

describe('el, the one place markup is written', () => {
  it('writes an element with escaped attributes and the given content', () => {
    expect(el('p', { class: 'note', title: `"a" & <b>` }, 'text')).toBe(
      '<p class="note" title="&quot;a&quot; &amp; &lt;b&gt;">text</p>',
    );
  });

  it('closes a void element itself, as HTML and XHTML both read it', () => {
    expect(el('hr', {})).toBe('<hr />');
    expect(el('br', { class: 'x' })).toBe('<br class="x" />');
  });

  it('writes a true attribute with an empty value and leaves out false and undefined ones', () => {
    expect(el('section', { class: 'reading', hidden: true, id: undefined, x: false }, '')).toBe(
      '<section class="reading" hidden=""></section>',
    );
  });

  it('writes numbers as they are', () => {
    expect(el('li', { 'data-n': 3 }, '')).toBe('<li data-n="3"></li>');
  });

  it('refuses a tag or attribute name it did not expect', () => {
    expect(() => el('p onclick', {}, '')).toThrow(RangeError);
    expect(() => el('p', { 'onclick="x"': 'y' }, '')).toThrow(RangeError);
    expect(() => el('p', { 'a b': 'y' }, '')).toThrow(RangeError);
    // An event handler would be script the CSP has no hash for; none is ever written.
    expect(() => el('p', { onclick: 'y' }, '')).toThrow(RangeError);
  });

  it('takes a prefixed attribute name, for the EPUB', () => {
    expect(el('aside', { 'epub:type': 'footnote' }, 'n')).toBe(
      '<aside epub:type="footnote">n</aside>',
    );
  });
});
