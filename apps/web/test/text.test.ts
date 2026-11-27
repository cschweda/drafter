import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  decodeFile,
  encodeFile,
  fileBaseName,
  fileNameFor,
  NotUtf8Error,
  titleOf,
} from '../app/storage/text';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('decodeFile and encodeFile', () => {
  test('strips a BOM on decode and restores it on encode', () => {
    const file = decodeFile(bytes('﻿INT. HALL - DAY\n'));
    expect(file).toEqual({ text: 'INT. HALL - DAY\n', lineBreak: '\n', bom: true });
    expect(file.text.includes('﻿')).toBe(false);
    expect(encodeFile(file.text, file.lineBreak, file.bom)).toBe('﻿INT. HALL - DAY\n');
    expect(decodeFile(bytes('INT. HALL - DAY\n')).bom).toBe(false);
    expect(encodeFile('INT. HALL - DAY\n', '\n', false)).toBe('INT. HALL - DAY\n');
  });

  test("finds a CRLF file's line break from its first line break", () => {
    expect(decodeFile(bytes('A\r\nB\r\n')).lineBreak).toBe('\r\n');
    expect(decodeFile(bytes('A\nB\r\n')).lineBreak).toBe('\n');
    expect(decodeFile(bytes('A\r\nB\n')).lineBreak).toBe('\r\n');
    expect(decodeFile(bytes('no break')).lineBreak).toBe('\n');
    expect(decodeFile(bytes('A\r\nB\r\n')).text).toBe('A\nB\n');
  });

  test('round-trips a CRLF file through decode and encode', () => {
    const original = '﻿Title: Small Hours\r\n\r\nINT. HALL - DAY\r\n\r\nHello.\r\n';
    const { text, lineBreak, bom } = decodeFile(bytes(original));
    expect(text).not.toContain('\r');
    expect(encodeFile(text, lineBreak, bom)).toBe(original);
  });

  test('reads a lone CR as a line break, and handles an empty file and a file of only a BOM', () => {
    expect(decodeFile(bytes('A\rB')).text).toBe('A\nB');
    expect(decodeFile(bytes(''))).toEqual({ text: '', lineBreak: '\n', bom: false });
    expect(decodeFile(bytes('﻿'))).toEqual({ text: '', lineBreak: '\n', bom: true });
  });

  test('keeps a second BOM in the text, since only the first is the file’s', () => {
    expect(decodeFile(bytes('﻿﻿A')).text).toBe('﻿A');
  });
});

describe('titleOf', () => {
  test('reads the title from the title page', () => {
    expect(titleOf(parse('Title: Small Hours\nAuthor: A. Writer\n\nINT. HALL - DAY\n'))).toBe(
      'Small Hours',
    );
    expect(titleOf(parse('title: Small Hours\n\nINT. HALL - DAY\n'))).toBe('Small Hours');
  });

  test('joins a multi-line title into one line of plain text', () => {
    expect(
      titleOf(parse('Title:\n    _**SMALL HOURS**_\n    The Sequel\nAuthor: A\n\nHi.\n')),
    ).toBe('SMALL HOURS The Sequel');
  });

  test('falls back when there is no title page, no Title, or an empty one', () => {
    expect(titleOf(parse('INT. HALL - DAY\n'))).toBe('Untitled');
    expect(titleOf(parse('Author: A. Writer\n\nINT. HALL - DAY\n'))).toBe('Untitled');
    expect(titleOf(parse('Title:\nAuthor: A\n\nINT. HALL - DAY\n'), 'Mine')).toBe('Mine');
  });
});

describe('fileNameFor', () => {
  test('takes out what can’t be seen or would turn the name round (red/blue audit, W13)', () => {
    expect(fileNameFor('invoice\u202efdp.exe', '.fountain')).toBe('invoicefdp.exe.fountain');
    expect(fileNameFor('\u202e', '.fountain')).toBe('Untitled.fountain');
    expect(fileNameFor('\u2066x\u2069', '.pdf')).toBe('x.pdf');
    expect(fileNameFor('a\u0085b\u200bc\u2028d', '.txt')).toBe('abcd.txt');
  });

  test('never makes a name Windows keeps for a device, or one too long for a disk (W14)', () => {
    for (const name of ['CON', 'nul', 'COM1', 'lpt9', 'Aux', 'PRN']) {
      expect(fileNameFor(name, '.fountain'), name).toBe(`_${name}.fountain`);
    }
    expect(fileNameFor('aux.', '.fountain')).toBe('_aux.fountain');
    expect(fileNameFor('CONSOLE', '.fountain')).toBe('CONSOLE.fountain');
    const long = fileNameFor('\u{1F3AC}'.repeat(120), '.fountain');
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(255);
    // Whole characters only, and an ordinary long title is still 120 characters.
    expect(long.endsWith('\u{1F3AC}.fountain')).toBe(true);
    expect(fileNameFor('a'.repeat(200), '.md')).toBe(`${'a'.repeat(120)}.md`);
  });

  test('knows a device’s name with anything after a dot, and its odd spellings (the audit of W14)', () => {
    for (const name of [
      'CON.txt',
      'NUL.tar',
      'COM1.backup',
      'CON .x',
      'COM\u00b9',
      'LPT\u00b2.a',
      'CONIN$',
      'conout$',
    ]) {
      expect(fileNameFor(name, '.pdf'), name).toBe(`_${name}.pdf`);
    }
    expect(fileNameFor('Contact.txt', '.pdf')).toBe('Contact.txt.pdf');
    expect(fileNameFor('COM10', '.pdf')).toBe('COM10.pdf');
  });

  test('a name of only what can’t be seen is Untitled, and real titles keep their joiners (W13)', () => {
    for (const unseen of [
      '\u3164',
      '\u115f',
      '\u1160',
      '\u2800',
      '\uffa0',
      '\u034f',
      '\ufe0f',
      '\u180b',
      '\u200d',
      '\u{e0067}\u{e007f}',
    ]) {
      expect(fileNameFor(unseen, '.pdf'), JSON.stringify(unseen)).toBe('Untitled.pdf');
      expect(fileNameFor(`a${unseen}\u3164b`, '.pdf').includes('\u3164')).toBe(false);
    }
    // Persian with its zero-width non-joiner, a family emoji, and a flag made of tag characters.
    const persian = '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645';
    expect(fileNameFor(persian, '.md')).toBe(`${persian}.md`);
    const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467} Family';
    expect(fileNameFor(family, '.md')).toBe(`${family}.md`);
    const scotland = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
    expect(fileNameFor(`${scotland} Play`, '.md')).toBe(`${scotland} Play.md`);
    // Tag characters with no flag before them are unseen text, and go.
    expect(fileNameFor('a\u{e0041}\u{e0042}b', '.md')).toBe('ab.md');
    // A long title in a script of three bytes a character keeps 80 of them, not 66.
    expect(Array.from(fileNameFor('\u5b57'.repeat(120), '.md')).length).toBe(80 + 3);
    expect(fileNameFor('\u0436'.repeat(130), '.md')).toBe(`${'\u0436'.repeat(120)}.md`);
  });

  test('makes a safe file name', () => {
    expect(fileNameFor('Small Hours', '.fountain')).toBe('Small Hours.fountain');
    expect(fileNameFor('A/B\\C:D*E?F"G<H>I|J', '.pdf')).toBe('ABCDEFGHIJ.pdf');
    expect(fileNameFor('  spaced   out  ', '.txt')).toBe('spaced out.txt');
    expect(fileNameFor('x'.repeat(300), '.fountain')).toBe(`${'x'.repeat(120)}.fountain`);
  });

  test('falls back to Untitled, and keeps off dots and control characters', () => {
    expect(fileNameFor('', '.fountain')).toBe('Untitled.fountain');
    expect(fileNameFor('/:*', '.fountain')).toBe('Untitled.fountain');
    expect(fileNameFor('..hidden..', '.fountain')).toBe('hidden.fountain');
    expect(fileNameFor('a\u0000b\nc', '.fountain')).toBe('abc.fountain');
  });

  test('cuts at 120 characters, and at 240 bytes, without splitting a surrogate pair', () => {
    // An emoji is four bytes: sixty of them are the 240 a name is allowed.
    const name = fileNameFor('😀'.repeat(200), '.fountain');
    expect(name).toBe(`${'😀'.repeat(60)}.fountain`);
    expect(fileNameFor('é'.repeat(200), '.fountain')).toBe(`${'é'.repeat(120)}.fountain`);
  });
});

describe('opening a file strictly', () => {
  test('refuses bytes that are not UTF-8 instead of replacing them', () => {
    // "café" in Latin-1: the lone 0xE9 is not UTF-8.
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    expect(() => decodeFile(latin1, { strict: true })).toThrow(NotUtf8Error);
    // Without `strict`, the replacement character is what a writer would have saved over it.
    expect(decodeFile(latin1).text).toBe('caf\ufffd');
    expect(decodeFile(bytes('café'), { strict: true }).text).toBe('café');
    expect(decodeFile(bytes('\ufeffA\r\nB'), { strict: true })).toEqual({
      text: 'A\nB',
      lineBreak: '\r\n',
      bom: true,
    });
  });

  test('names a script after its file when it has no title', () => {
    expect(fileBaseName('The Call.fountain')).toBe('The Call');
    expect(fileBaseName('notes.v2.txt')).toBe('notes.v2');
    expect(fileBaseName('README')).toBe('README');
    expect(fileBaseName('.fountain')).toBe('.fountain');
    expect(fileBaseName(undefined)).toBe('Untitled');
    expect(fileBaseName('')).toBe('Untitled');
  });
});
