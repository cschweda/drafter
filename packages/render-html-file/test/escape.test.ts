import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { el, escapeHtml, safeHref } from '../src/escape';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

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

  it(
    'is linear in the length of the text',
    () => {
      const { growth } = scaling((n) => '<&>"\'\0\ud800ab'.repeat(n), escapeHtml, 50_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
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

  it('refuses style, srcdoc, formaction, srcset, and ping, as it refuses event handlers', () => {
    for (const key of ['style', 'srcdoc', 'formaction', 'srcset', 'ping', 'onload', 'onerror']) {
      expect(() => el('p', { [key]: 'x' }, ''), key).toThrow(RangeError);
    }
  });

  it('writes a link only to an anchor, http, https, or mailto', () => {
    expect(el('a', { href: '#b-3' }, 'x')).toBe('<a href="#b-3">x</a>');
    expect(el('a', { href: 'https://example.com/?a=1&b="2"' }, 'x')).toBe(
      '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;">x</a>',
    );
    expect(el('a', { href: 'mailto:ada@example.com' }, 'x')).toContain('mailto:');
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'java\tscript:alert(1)',
      '\x01javascript:alert(1)',
      'vbscript:x',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      '//example.com/x',
      'relative/path',
      '',
    ]) {
      expect(() => el('a', { href: bad }, 'x'), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  it("takes an href to another of an EPUB's own files, by the name its code gives it", () => {
    for (const good of ['part-2.xhtml#fn-3', 'part-1.xhtml', 'style.css', 'text/part-1.xhtml']) {
      expect(el('a', { href: good }, 'x')).toBe(`<a href="${good}">x</a>`);
    }
    for (const bad of [
      '../part-1.xhtml',
      '/part-1.xhtml',
      'part-1.html',
      'Part-1.xhtml',
      'part 1.xhtml',
      'part-1.xhtml#a"b',
      'part-1.xhtml?x',
      'a.xhtml/../b.xhtml',
    ]) {
      expect(() => el('a', { href: bad }, 'x'), JSON.stringify(bad)).toThrow(RangeError);
    }
    // Only as an href: a src is a resource, and stays refused.
    expect(() => el('img', { src: 'style.css', alt: '' })).toThrow(RangeError);
  });

  it('checks every URL attribute, and takes data: only for an image', () => {
    expect(el('img', { src: 'data:image/png;base64,AAAA', alt: '' })).toBe(
      '<img src="data:image/png;base64,AAAA" alt="" />',
    );
    expect(() => el('img', { src: 'https://example.com/x.png' })).not.toThrow();
    expect(() => el('img', { src: 'data:text/html,x' })).toThrow(RangeError);
    expect(() => el('script', { src: 'data:image/png,x' })).toThrow(RangeError);
    expect(() => el('a', { href: 'data:image/png,x' }, '')).toThrow(RangeError);
    for (const key of ['action', 'poster', 'cite', 'xlink:href', 'background', 'data']) {
      expect(() => el('x', { [key]: 'javascript:alert(1)' }, ''), key).toThrow(RangeError);
    }
  });

  it('refuses "</" in a script or a style, whose text is raw', () => {
    expect(() => el('script', {}, 'a</script><b>')).toThrow(RangeError);
    expect(() => el('style', {}, '</style>')).toThrow(RangeError);
    expect(el('style', {}, '.a{}')).toBe('<style>.a{}</style>');
  });

  it('writes a true aria- attribute as "true"', () => {
    expect(el('span', { 'aria-hidden': true }, '')).toBe('<span aria-hidden="true"></span>');
  });
});

describe('safeHref', () => {
  it('keeps anchors and the three link schemes, and nothing else', () => {
    expect(safeHref('#fn-1')).toBe('#fn-1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('HTTPS://example.com')).toBe('HTTPS://example.com');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:image/png,x')).toBeUndefined();
    expect(safeHref('data:image/png,x', true)).toBe('data:image/png,x');
    expect(safeHref('data:text/html,x', true)).toBeUndefined();
    expect(safeHref('nonsense')).toBeUndefined();
  });

  it('a property: whatever it keeps, a browser reads as an anchor or one of the three schemes', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: 'binary', maxLength: 20 }),
          fc
            .tuple(
              fc.constantFrom('java', 'http', 'https', 'mailto', 'data', 'vb', ' ', '\t', '#'),
              fc.constantFrom('', '\t', '\n', '\x00', ' '),
              fc.constantFrom('script:', 's:', ':', '//x', 'image/png,'),
              fc.string({ maxLength: 8 }),
            )
            .map((parts) => parts.join('')),
        ),
        (url) => {
          const kept = safeHref(url);
          if (kept === undefined) return;
          const a = document.createElement('a');
          a.setAttribute('href', kept);
          if (kept.startsWith('#')) return;
          expect(['http:', 'https:', 'mailto:']).toContain(a.protocol);
        },
      ),
      { numRuns: 500 },
    );
  });
});
