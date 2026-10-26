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
    const original = '﻿Title: Big Fish\r\n\r\nINT. HALL - DAY\r\n\r\nHello.\r\n';
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
    expect(titleOf(parse('Title: Big Fish\nAuthor: A. Writer\n\nINT. HALL - DAY\n'))).toBe(
      'Big Fish',
    );
    expect(titleOf(parse('title: Big Fish\n\nINT. HALL - DAY\n'))).toBe('Big Fish');
  });

  test('joins a multi-line title into one line of plain text', () => {
    expect(titleOf(parse('Title:\n    _**BIG FISH**_\n    The Sequel\nAuthor: A\n\nHi.\n'))).toBe(
      'BIG FISH The Sequel',
    );
  });

  test('falls back when there is no title page, no Title, or an empty one', () => {
    expect(titleOf(parse('INT. HALL - DAY\n'))).toBe('Untitled');
    expect(titleOf(parse('Author: A. Writer\n\nINT. HALL - DAY\n'))).toBe('Untitled');
    expect(titleOf(parse('Title:\nAuthor: A\n\nINT. HALL - DAY\n'), 'Mine')).toBe('Mine');
  });
});

describe('fileNameFor', () => {
  test('makes a safe file name', () => {
    expect(fileNameFor('Big Fish', '.fountain')).toBe('Big Fish.fountain');
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

  test('cuts at 120 characters without splitting a surrogate pair', () => {
    const name = fileNameFor('😀'.repeat(200), '.fountain');
    expect(name).toBe(`${'😀'.repeat(120)}.fountain`);
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
