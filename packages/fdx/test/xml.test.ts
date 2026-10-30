import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_XML_CHARS, readXml, writeXml, type XmlElement, XmlError, type XmlNode } from '../src';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

const el = (name: string, attrs: Record<string, string> = {}, ...children: XmlNode[]) => ({
  name,
  attrs,
  children,
});

const refuses = (text: string) => {
  try {
    readXml(text);
  } catch (e) {
    expect(e).toBeInstanceOf(XmlError);
    expect(Number.isInteger((e as XmlError).offset)).toBe(true);
    return;
  }
  throw new Error(`readXml accepted: ${text.slice(0, 60)}`);
};

// The writer indents elements that hold only elements, and the reader keeps that indentation as
// whitespace-only text, so trees are compared with whitespace-only text dropped from the elements
// that hold no other text. (An element with real text is written exactly, and read back exactly.)
function strip(node: XmlElement): XmlElement {
  const hasText = node.children.some((c) => typeof c === 'string' && c.trim() !== '');
  return {
    name: node.name,
    attrs: node.attrs,
    children: node.children
      .filter((c) => hasText || typeof c !== 'string')
      .map((c) => (typeof c === 'string' ? c : strip(c))),
  };
}

describe('writeXml and readXml', () => {
  it('writes the declaration, then the tree indented two spaces', () => {
    const tree = el('A', { x: '1' }, el('B'), el('C', {}, el('D', {}, 'hi')));
    expect(writeXml(tree)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
        '<A x="1">\n  <B/>\n  <C>\n    <D>hi</D>\n  </C>\n</A>\n',
    );
  });

  it('round-trips a hand-built tree, apart from the indentation it adds', () => {
    const tree = el(
      'FinalDraft',
      { Version: '5', Note: 'a "b" & <c>\n\td' },
      el(
        'Content',
        {},
        el('Paragraph', { Type: 'Action' }, el('Text', {}, 'x < y & z > "w" \'v\'')),
      ),
      el('Empty'),
    );
    expect(strip(readXml(writeXml(tree)))).toEqual(strip(tree));
  });

  it('keeps text with elements around it exactly', () => {
    const tree = el('P', {}, ' a ', el('b', {}, ' c '), '\n d');
    expect(readXml(writeXml(tree))).toEqual(tree);
  });

  it('keeps the whitespace-only text between elements', () => {
    const root = readXml('<a>\n  <b/>\n</a>');
    expect(root.children).toEqual(['\n  ', el('b'), '\n']);
  });

  it('reads CDATA as text, merged with the text beside it', () => {
    const root = readXml('<a>x<![CDATA[<b> & &amp;]]>y</a>');
    expect(root.children).toEqual(['x<b> & &amp;y']);
  });

  it('reads the five entities and numeric references', () => {
    const root = readXml('<a q="&quot;&apos;">&lt;&gt;&amp; &#65;&#x1F600;</a>');
    expect(root.attrs.q).toBe('"\'');
    expect(root.children).toEqual(['<>& A\u{1F600}']);
  });

  it('accepts a leading declaration, a byte order mark, comments, and single quotes', () => {
    const root = readXml("﻿<?xml version='1.0'?>\n<!-- c --><a b='1'><!-- x --></a>\n<!-- y -->\n");
    expect(root).toEqual(el('a', { b: '1' }));
  });

  it('turns CRLF into a line feed', () => {
    expect(readXml('<a>x\r\ny\rz</a>').children).toEqual(['x\ny\nz']);
  });

  it('keeps an attribute called __proto__ as an ordinary attribute', () => {
    const root = readXml('<a __proto__="x"/>');
    expect(Object.keys(root.attrs)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(root.attrs)).toBe(Object.prototype);
  });
});

describe('readXml refuses', () => {
  const cases: Array<[string, string]> = [
    ['a DOCTYPE', '<!DOCTYPE a><a/>'],
    ['a DOCTYPE with an entity', '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'],
    ['a custom entity', '<a>&custom;</a>'],
    ['an entity in an attribute', '<a b="&custom;"/>'],
    ['a bare ampersand', '<a>fish & chips</a>'],
    ['the null character reference', '<a>&#0;</a>'],
    ['a reference to a forbidden character', '<a>&#x1;</a>'],
    ['a reference to a surrogate', '<a>&#xD800;</a>'],
    ['a reference past the last code point', '<a>&#x110000;</a>'],
    ['mismatched tags', '<a></b>'],
    ['crossed tags', '<a><b></a></b>'],
    ['a duplicate attribute', '<a x="1" x="2"/>'],
    ['an unclosed element', '<a><b></b>'],
    ['an unclosed tag', '<a'],
    ['an unquoted attribute', '<a x=1/>'],
    ['a < in an attribute', '<a x="<"/>'],
    ['text after the root', '<a/>tail'],
    ['a second root', '<a/><b/>'],
    ['text before the root', 'head<a/>'],
    ['nothing at all', ''],
    ['only a declaration', '<?xml version="1.0"?>'],
    ['a processing instruction after the declaration', '<?xml version="1.0"?><?pi x?><a/>'],
    ['a processing instruction inside', '<a><?pi x?></a>'],
    ['a declaration that is not first', '<!-- c --><?xml version="1.0"?><a/>'],
    ['a control character', '<a>\u0001</a>'],
    ['a lone surrogate', '<a>\uD800</a>'],
    ['a lone surrogate in a name', '<a\uD800/>'],
    ['U+FFFF in a name', '<a\uFFFF/>'],
    ['a ]]> in text', '<a>x]]>y</a>'],
    ['a -- in a comment', '<a><!-- a -- b --></a>'],
    ['a CDATA section outside the root', '<![CDATA[x]]><a/>'],
    ['an unclosed CDATA section', '<a><![CDATA[x</a>'],
  ];
  for (const [what, text] of cases) it(what, () => refuses(text));

  it('nesting deeper than 64, and accepts exactly 64', () => {
    const nest = (d: number) => '<a>'.repeat(d) + '</a>'.repeat(d);
    expect(readXml(nest(64)).name).toBe('a');
    refuses(nest(65));
    expect(readXml(`${'<a>'.repeat(63)}<b/>${'</a>'.repeat(63)}`).name).toBe('a');
    refuses(`${'<a>'.repeat(64)}<b/>${'</a>'.repeat(64)}`);
  });

  it('input over 5 MB', () => {
    refuses(`<a>${'x'.repeat(MAX_XML_CHARS)}</a>`);
  });
});

describe('readXml error messages', () => {
  it('shorten a long name', () => {
    const long = 'a'.repeat(200_000);
    for (const xml of [
      `<r></${long}>`,
      `<${long}`,
      `<r ${long}></r>`,
      `<r ${long}="1" ${long}="2"/>`,
      `<r><${long}>`,
    ]) {
      let message = '';
      try {
        readXml(xml);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message.length).toBeLessThan(120);
      expect(message).toContain('…');
    }
  });
});

describe('readXml on a large file', () => {
  // Linear, not a wall-clock budget (scaling.ts): time grows about 4 times from n to 4n.
  const rows = (count: number) =>
    `<Doc>\n${'<Paragraph Type="Action"><Text>Some words &amp; more.</Text></Paragraph>\n'.repeat(count)}</Doc>`;

  it(
    'reads rows in linear time, up to 5 MB',
    () => {
      const { growth, large } = scaling(rows, readXml, 15_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
      const row = rows(1).length - rows(0).length;
      const text = rows(Math.floor((MAX_XML_CHARS - 20) / row));
      expect(text.length).toBeLessThanOrEqual(MAX_XML_CHARS);
      expect(text.length).toBeGreaterThan(5_000_000);
      expect(readXml(text).children.length).toBeGreaterThan(50_000);
    },
    SCALING_TIMEOUT,
  );

  it(
    'reads many attributes and many entities in linear time',
    () => {
      const attributes = (n: number) =>
        `<a ${Array.from({ length: n }, (_, k) => `x${k}="&amp;"`).join(' ')}/>`;
      const entities = (n: number) => `<a>${'&lt;'.repeat(n)}</a>`;
      for (const [make, n] of [
        [attributes, 40_000],
        [entities, 250_000],
      ] as const) {
        const { growth, large } = scaling(make, readXml, n);
        expect(growth).toBeLessThan(MAX_GROWTH);
        expect(large).toBeLessThan(HANG_MS);
      }
    },
    SCALING_TIMEOUT,
  );
});

// Text of XML characters: the markup characters, whitespace, and astral characters among them.
const xmlText = fc
  .array(
    fc.oneof(
      fc.constantFrom('<', '>', '&', '"', "'", ']]>', ' ', '\n', '\t', '\r', ';', '&amp;', '#'),
      fc.string({ unit: 'grapheme', minLength: 1, maxLength: 3 }),
      fc.constantFrom('\u{1F600}', '\u{10FFFF}', '\u{10000}', '�', 'é'),
    ),
    { minLength: 1, maxLength: 8 },
  )
  .map((parts) => parts.join(''))
  .filter((s) => /^[\t\n\r -퟿-�\u{10000}-\u{10FFFF}]*$/u.test(s));

const nameArb = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_.-]{0,6}$/);

const treeArb: fc.Arbitrary<XmlElement> = fc.letrec((tie) => ({
  tree: fc.record({
    name: nameArb,
    attrs: fc.dictionary(nameArb, xmlText, { maxKeys: 3 }),
    children: fc
      .array(fc.oneof({ depthSize: 'small' }, xmlText, tie('tree') as fc.Arbitrary<XmlElement>), {
        maxLength: 4,
      })
      // Adjacent strings would read back as one run, so merge them as the reader does.
      .map((kids) =>
        kids.reduce<XmlNode[]>((acc, k) => {
          if (typeof k === 'string' && typeof acc[acc.length - 1] === 'string') {
            acc[acc.length - 1] += k;
          } else acc.push(k);
          return acc;
        }, []),
      ),
  }),
})).tree;

describe('round trip', () => {
  it('readXml(writeXml(t)) equals t for random trees with random text', () => {
    fc.assert(
      fc.property(treeArb, (t) => {
        expect(strip(readXml(writeXml(t)))).toEqual(strip(t));
      }),
      { numRuns: 300 },
    );
  });

  it('is exact for any text in a single element', () => {
    fc.assert(
      fc.property(xmlText, xmlText, (text, attr) => {
        const t = el('T', { a: attr }, text);
        expect(readXml(writeXml(t))).toEqual(t);
      }),
      { numRuns: 300 },
    );
  });
});
