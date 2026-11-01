// Reopenable exports on the command line: `drafter build --html --reopenable` carries the script
// inside the page, and `drafter convert` reads it back from that page or from a Drafter EPUB.
// Every file here is the test's own, with original text.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_ENTRY, zipStored } from '@drafter/archive';
import { describe, expect, it } from 'vitest';
import { drafter, tempDir } from './helpers';

const SCRIPT = [
  'Title: The Tide Clock',
  'Author: Oona Brack',
  '',
  'INT. CLOCK ROOM - DUSK',
  '',
  'Gears turn. [[Louder gears?]]',
  '',
  '/* A cut line. */',
  '',
  'OONA',
  '</script> and <!-- this --> are only words. Ça va, 時計.',
  '',
].join('\r\n');

const text = (s: string) => new TextEncoder().encode(s);

describe('drafter build --reopenable', () => {
  const dir = tempDir();

  it('puts the exact script in the HTML page only when asked', async () => {
    const script = join(dir(), 'Tide.fountain');
    writeFileSync(script, `﻿${SCRIPT}`);
    const plain = join(dir(), 'plain.html');
    const reopenable = join(dir(), 'Tide.html');
    expect((await drafter('build', script, '--html', plain)).code).toBe(0);
    expect(readFileSync(plain, 'utf8')).not.toContain('drafter-source');
    const built = await drafter('build', script, '--html', reopenable, '--reopenable');
    expect(built.code, built.err).toBe(0);
    expect(readFileSync(reopenable, 'utf8')).toContain('id="drafter-source"');

    // And back: byte for byte, its BOM and CRLF line breaks too.
    const out = join(dir(), 'back');
    const converted = await drafter('convert', reopenable, '--out', out);
    expect(converted.code, converted.out).toBe(0);
    expect(readFileSync(join(out, 'Tide.fountain'))).toEqual(Buffer.from(`﻿${SCRIPT}`, 'utf8'));
  });

  it('refuses to carry a file that is not UTF-8, which it could not carry exactly', async () => {
    const script = join(dir(), 'Latin.fountain');
    writeFileSync(script, Buffer.from([0x49, 0x4e, 0x54, 0x2e, 0x20, 0xe9, 0x0a]));
    const result = await drafter('build', script, '--html', join(dir(), 'l.html'), '--reopenable');
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/--reopenable.*isn’t UTF-8 text/);
    expect(existsSync(join(dir(), 'l.html'))).toBe(false);
  });

  it('is in the help, and needs --html', async () => {
    expect((await drafter('build', '--help')).out).toContain('--reopenable');
    const script = join(dir(), 'Tide.fountain');
    writeFileSync(script, SCRIPT);
    const result = await drafter('build', script, '--txt', join(dir(), 't.txt'), '--reopenable');
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/--reopenable.*--html/);
  });
});

describe('drafter convert, from a Drafter HTML or EPUB export', () => {
  const dir = tempDir();
  const put = (name: string, data: string | Uint8Array) => {
    writeFileSync(join(dir(), name), data);
    return join(dir(), name);
  };
  const book = (kind: 'fountain' | 'markdown', source: string) =>
    zipStored([
      { name: 'mimetype', data: text('application/epub+zip') },
      { name: 'EPUB/package.opf', data: text('<package/>') },
      { name: SOURCE_ENTRY[kind], data: text(source) },
    ]);

  it('writes the script inside an EPUB, and a Markdown document as .md', async () => {
    const md = '# Field Notes\n\nA [[note]].\n';
    put('Tide.epub', book('fountain', SCRIPT));
    put('Notes.epub', book('markdown', md));
    const result = await drafter('convert', join(dir(), 'Tide.epub'), join(dir(), 'Notes.epub'));
    expect(result.code, result.out).toBe(0);
    expect(readFileSync(join(dir(), 'Tide.fountain'), 'utf8')).toBe(SCRIPT);
    expect(readFileSync(join(dir(), 'Notes.md'), 'utf8')).toBe(md);
    expect(existsSync(join(dir(), 'Notes.fountain'))).toBe(false);
  });

  it('refuses a page or a book with no script inside, saying only Drafter’s own can be reopened', async () => {
    put('Other.html', '<!DOCTYPE html><html><body><p>A page from a site.</p></body></html>');
    put('Other.epub', zipStored([{ name: 'mimetype', data: text('application/epub+zip') }]));
    const result = await drafter('convert', join(dir(), 'Other.html'), join(dir(), 'Other.epub'));
    expect(result.code).toBe(1);
    expect(result.out.match(/can only reopen HTML or EPUB files it saved itself/g)).toHaveLength(2);
    expect(existsSync(join(dir(), 'Other.fountain'))).toBe(false);
  });

  it('refuses a malformed block, never crashing', async () => {
    put(
      'Bad.html',
      '<!DOCTYPE html><html><body><script type="text/plain" id="drafter-source" data-kind="fountain" data-encoding="base64">%%%</script></body></html>',
    );
    const result = await drafter('convert', join(dir(), 'Bad.html'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/refused: .*can only reopen/);
  });

  it('refuses a script inside that is not UTF-8 text', async () => {
    put('Nul.epub', book('fountain', 'INT. A\u0000B'));
    const result = await drafter('convert', join(dir(), 'Nul.epub'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/refused: it holds more than text/);
  });
});
