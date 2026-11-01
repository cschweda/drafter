import { describe, expect, test } from 'vitest';
import {
  embeddedSource,
  MAX_SCRIPT_BYTES,
  REOPEN_MAX_BYTES,
  reopenFormatOf,
  SOURCE_ENTRY,
  SOURCE_ID,
  sourceElement,
  zipStored,
} from '../src';
import { makeZip } from './make-zip';

// Reopenable exports: the script inside a Drafter HTML or EPUB export, put there with "Let
// Drafter reopen this file", read back byte for byte, and anything else refused without a throw.

const utf8 = new TextEncoder();
const text = (s: string) => utf8.encode(s);
const back = (bytes: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

/** The hard cases in one script: a note, the boneyard, the metadata block, markup, unicode. */
const HARD = [
  'Title: The Lamp Room',
  'Author: Ines Varga',
  '',
  'INT. LAMP ROOM - NIGHT',
  '',
  'Brigid trims the wick. [[Check the lamp is brass, not tin.]]',
  '',
  '/* An older opening, cut:',
  'EXT. CLIFF - DAY',
  '*/',
  '',
  'BRIGID',
  '</script><script>alert(1)</script> <!-- not a comment --> ]]> &amp; "quoted" \'single\'',
  '',
  'Café, naïve, 灯台, 🕯️, é,   and   and a tab\there.',
  '',
  '[[drafter:',
  '{"template":"screenplay","scenes":{"1":{"color":"blue"}}}',
  ']]',
  '',
].join('\n');

/** An HTML page around an element, as an export would place it. */
const page = (element: string) =>
  `<!DOCTYPE html>\n<html lang="en"><head><title>T</title></head><body><main></main>${element}</body></html>\n`;

describe('sourceElement', () => {
  test('is an inert text/plain script with the stable id, holding only base64', () => {
    const element = sourceElement('fountain', HARD);
    expect(SOURCE_ID).toBe('drafter-source');
    expect(
      element.startsWith(
        `<script type="text/plain" id="drafter-source" data-kind="fountain" data-encoding="base64">`,
      ),
    ).toBe(true);
    expect(element.endsWith('</script>')).toBe(true);
    const inside = element.slice(element.indexOf('>') + 1, -'</script>'.length);
    expect(inside).toMatch(/^[A-Za-z0-9+/=\n]*$/);
    // Nothing in the text can end the element or open a comment.
    expect(inside).not.toMatch(/<|>|&/);
    expect(sourceElement('markdown', '# Notes\n')).toContain('data-kind="markdown"');
  });

  test('wraps its lines at 76 characters', () => {
    const element = sourceElement('fountain', 'x'.repeat(1000));
    const inside = element.slice(element.indexOf('>') + 1, -'</script>'.length);
    for (const line of inside.split('\n')) expect(line.length).toBeLessThanOrEqual(76);
  });
});

describe('embeddedSource from HTML', () => {
  test('gives back the exact text and its kind', async () => {
    for (const source of [HARD, HARD.replace(/\n/g, '\r\n'), `﻿${HARD}`, '', 'A']) {
      const found = await embeddedSource(text(page(sourceElement('fountain', source))));
      expect(found?.kind).toBe('fountain');
      expect(back(found?.bytes ?? new Uint8Array())).toBe(source);
    }
    const md = '# Notes\n\nA [[note]] and *emphasis*.\n';
    const found = await embeddedSource(text(page(sourceElement('markdown', md))));
    expect(found?.kind).toBe('markdown');
    expect(back(found?.bytes ?? new Uint8Array())).toBe(md);
  });

  test('every length of text round-trips (base64 padding)', async () => {
    for (let n = 0; n < 12; n++) {
      const source = 'é'.repeat(n) + 'a'.repeat(n % 3);
      const found = await embeddedSource(text(page(sourceElement('fountain', source))));
      expect(back(found?.bytes ?? new Uint8Array([0]))).toBe(source);
    }
  });

  test('is null for a page with no source, or a page another app made', async () => {
    expect(await embeddedSource(text(page('')))).toBeNull();
    expect(
      await embeddedSource(text('<!DOCTYPE html><html><body><p>Hi</p></body></html>')),
    ).toBeNull();
    expect(await embeddedSource(new Uint8Array())).toBeNull();
  });

  test('is null, never a throw, for a malformed or hostile block', async () => {
    const open =
      '<script type="text/plain" id="drafter-source" data-kind="fountain" data-encoding="base64">';
    const hostile = [
      `${open}not base64!</script>`,
      `${open}QUJD</script>${open}QUJD</script>`, // two
      `${open}QUJD`, // never closed
      `${open}QUJ</script>`, // a length that isn't base64's
      `${open}QU=D</script>`, // padding inside
      `${open}QUJD====</script>`,
      `${open}<b>QUJD</b></script>`,
      `${open}QR==</script>`, // padding bits that aren't zero
      `${open}QUI=</script>`.replace('QUI=', 'QUJ='), // the same, three characters
      '<script type="text/plain" id="drafter-source" data-kind="markdownX',
      `${open}AAAA</script>`, // NULs: the caller's text checks refuse them, but they decode
      '<script type="text/plain" id="drafter-source" data-kind="html" data-encoding="base64">QUJD</script>',
      '<script type="text/plain" id="drafter-source" data-kind="fountain" data-encoding="hex">414243</script>',
      '<script type="text/plain" id="drafter-source">INT. HALL</script>',
      `${open}${'/'.repeat(8)}</script>`, // not UTF-8 once decoded is the caller's to refuse
    ];
    for (const block of hostile) {
      const found = await embeddedSource(text(page(block)));
      if (block.includes('AAAA') || block.includes('////')) {
        // Decodes to bytes; the caller's strict text checks (NUL, UTF-8) refuse them.
        expect(found?.bytes.length).toBeGreaterThan(0);
      } else {
        expect(found, block).toBeNull();
      }
    }
  });

  test('a kind that never closes is refused, wherever the page starts', async () => {
    // A page that starts as the tag's end would, then a tag whose kind has no closing quote.
    const crafted =
      '" data-encoding="base64">QUJD</script><script type="text/plain" id="drafter-source" data-kind="markdownX';
    expect(await embeddedSource(text(crafted))).toBeNull();
  });

  test('a source over 5 MB, or a page over the cap, is null', async () => {
    const big = 'a'.repeat(MAX_SCRIPT_BYTES + 1);
    expect(await embeddedSource(text(page(sourceElement('fountain', big))))).toBeNull();
    const huge = new Uint8Array(REOPEN_MAX_BYTES + 1);
    huge.set(text(page(sourceElement('fountain', 'A'))));
    expect(await embeddedSource(huge)).toBeNull();
  });
});

describe('embeddedSource from an EPUB', () => {
  const book = (entries: { name: string; data: Uint8Array }[]) =>
    zipStored([{ name: 'mimetype', data: text('application/epub+zip') }, ...entries]);

  test('gives back the exact bytes of the source entry, and its kind', async () => {
    expect(SOURCE_ENTRY).toEqual({
      fountain: 'EPUB/drafter-source.fountain',
      markdown: 'EPUB/drafter-source.md',
    });
    for (const kind of ['fountain', 'markdown'] as const) {
      const found = await embeddedSource(
        book([
          { name: 'EPUB/package.opf', data: text('<package/>') },
          { name: SOURCE_ENTRY[kind], data: text(HARD) },
        ]),
      );
      expect(found?.kind).toBe(kind);
      expect(back(found?.bytes ?? new Uint8Array())).toBe(HARD);
    }
  });

  test('reads a deflated source entry too', async () => {
    const zip = makeZip([
      { name: 'mimetype', data: 'application/epub+zip', method: 0 },
      { name: SOURCE_ENTRY.fountain, data: HARD },
    ]);
    expect(back((await embeddedSource(zip))?.bytes ?? new Uint8Array())).toBe(HARD);
  });

  test('is null for a book with none, two, a damaged zip, or a source over 5 MB', async () => {
    expect(
      await embeddedSource(book([{ name: 'EPUB/package.opf', data: text('<p/>') }])),
    ).toBeNull();
    expect(
      await embeddedSource(
        book([
          { name: SOURCE_ENTRY.fountain, data: text('A') },
          { name: SOURCE_ENTRY.markdown, data: text('B') },
        ]),
      ),
    ).toBeNull();
    const good = book([{ name: SOURCE_ENTRY.fountain, data: text('A') }]);
    expect(await embeddedSource(good.subarray(0, good.length - 10))).toBeNull();
    const big = book([
      { name: SOURCE_ENTRY.fountain, data: new Uint8Array(MAX_SCRIPT_BYTES + 1).fill(0x61) },
    ]);
    expect(await embeddedSource(big)).toBeNull();
  });
});

describe('reopenFormatOf', () => {
  test('a web page or an e-book, by its content first and then its name', () => {
    const epub = zipStored([{ name: 'mimetype', data: text('application/epub+zip') }]);
    expect(reopenFormatOf('a.fountain', epub)).toBe('epub');
    expect(reopenFormatOf('a.epub', text('anything'))).toBe('epub');
    expect(reopenFormatOf('a.fountain', text('<!DOCTYPE html><html>'))).toBe('html');
    expect(reopenFormatOf('a.HTML', text('anything'))).toBe('html');
    expect(reopenFormatOf('a.htm', text('anything'))).toBe('html');
    expect(reopenFormatOf('a.fountain', text('INT. HALL - DAY\n'))).toBeNull();
    expect(
      reopenFormatOf('a.highland', zipStored([{ name: 'text.md', data: text('A') }])),
    ).toBeNull();
  });
});
