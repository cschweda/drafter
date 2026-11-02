import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { stat, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { sourceElement } from '../src';
import { Refused, readCapped, readScriptFile, reason, strictText } from '../src/node';
import { makeZip } from './make-zip';

const posix = process.platform !== 'win32';
const utf8 = new TextEncoder();
const MB = 1024 * 1024;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drafter-node-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
const put = (name: string, data: string | Uint8Array) => {
  const path = join(dir, name);
  writeFileSync(path, data);
  return path;
};
const tooBig = () => new Error('too big');
const failure = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error,
  );

describe('readCapped', () => {
  test('reads a regular file whole, and never more than the cap plus one byte', async () => {
    const path = put('a.txt', 'EXT. DOCK - DAY\n');
    expect(new TextDecoder().decode(await readCapped(path, 100, tooBig))).toBe('EXT. DOCK - DAY\n');
    const exact = put('b.txt', 'x'.repeat(10));
    expect((await readCapped(exact, 10, tooBig)).length).toBe(10);
    expect(await failure(readCapped(put('c.txt', 'x'.repeat(11)), 10, tooBig))).toEqual(tooBig());
  });

  test('refuses over the cap before reading', async () => {
    const path = put('big.bin', '');
    await truncate(path, 6 * MB);
    const error = await failure(readCapped(path, 5 * MB, tooBig));
    expect(error?.message).toBe('too big');
  });

  test.skipIf(!posix)('refuses a folder, a FIFO, and /dev/zero behind a link', async () => {
    const error = await failure(readCapped(dir, 100, tooBig));
    expect(error).toBeInstanceOf(Refused);
    expect(error?.message).toBe("it's a folder");
    const fifo = join(dir, 'pipe');
    execFileSync('mkfifo', [fifo]);
    expect((await failure(readCapped(fifo, 100, tooBig)))?.message).toBe('it isn’t a file');
    const zero = join(dir, 'zero');
    symlinkSync('/dev/zero', zero);
    expect((await failure(readCapped(zero, 100, tooBig)))?.message).toBe('it isn’t a file');
  });

  test.skipIf(!posix)('noFollow refuses a link in the last part', async () => {
    const real = put('real.txt', 'hello');
    const link = join(dir, 'link.txt');
    symlinkSync(real, link);
    expect(new TextDecoder().decode(await readCapped(link, 100, tooBig))).toBe('hello');
    const error = await failure(readCapped(link, 100, tooBig, { noFollow: true }));
    expect(error).toBeInstanceOf(Refused);
    expect(error?.message).toMatch(/^can't read it:/);
  });

  test.skipIf(!posix)('noFollow still reads a file under a linked folder', async () => {
    mkdirSync(join(dir, 'real'));
    writeFileSync(join(dir, 'real', 'a.txt'), 'inside');
    symlinkSync(join(dir, 'real'), join(dir, 'linked'));
    const bytes = await readCapped(join(dir, 'linked', 'a.txt'), 100, tooBig, { noFollow: true });
    expect(new TextDecoder().decode(bytes)).toBe('inside');
  });

  test.skipIf(!posix)('expect refuses a file swapped after it was checked', async () => {
    const a = put('a.txt', 'first');
    const b = put('b.txt', 'second');
    const checked = await stat(a, { bigint: true });
    const expected = { dev: checked.dev, ino: checked.ino };
    expect(new TextDecoder().decode(await readCapped(a, 100, tooBig, { expect: expected }))).toBe(
      'first',
    );
    renameSync(b, a);
    const error = await failure(readCapped(a, 100, tooBig, { expect: expected }));
    expect(error).toBeInstanceOf(Refused);
    expect(error?.message).toBe('it changed while it was being read');
  });
});

describe('reason', () => {
  test('puts codes in words', () => {
    expect(reason({ code: 'ENOENT' })).toBe('no such file');
    expect(reason(new Error('odd'))).toBe('odd');
  });
});

describe('strictText', () => {
  test('drops a BOM and makes line feeds', () => {
    expect(strictText(utf8.encode('﻿A\r\nB\rC\n'))).toBe('A\nB\nC\n');
  });

  test('refuses UTF-16, an early NUL, and bad UTF-8', () => {
    expect(() => strictText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toThrow(
      'it isn’t UTF-8 text',
    );
    expect(() => strictText(utf8.encode('ab\0cd'))).toThrow('it holds more than text');
    expect(() => strictText(new Uint8Array([0x41, 0xc3, 0x28]))).toThrow('it isn’t UTF-8 text');
  });
});

describe('readScriptFile', () => {
  const WHAT = 'only some files';
  test('reads an FDX, a Highland, and a reopenable HTML export as convert does', async () => {
    const fdx = put(
      'a.fdx',
      '<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="5"><Content><Paragraph Type="Scene Heading"><Text>INT. DOCK - DAY</Text></Paragraph></Content></FinalDraft>',
    );
    const fromFdx = await readScriptFile(fdx, WHAT);
    expect(fromFdx.text).toContain('INT. DOCK - DAY');
    expect(fromFdx).toMatchObject({ notes: 0, markdown: false });

    const highland = put(
      'b.highland',
      makeZip([
        { name: 'text.fountain', data: 'INT. LAMP ROOM - NIGHT\n\nBrigid trims the wick.\n' },
        { name: 'info.json', data: '{"version":2}' },
      ]),
    );
    expect((await readScriptFile(highland, WHAT)).text).toContain('Brigid trims the wick.');

    const script = 'Title: Dock\r\n\r\nINT. DOCK - DAY\r\n';
    const html = put(
      'c.html',
      `<!DOCTYPE html><html><body><main></main>${sourceElement('fountain', script)}</body></html>\n`,
    );
    const reopened = await readScriptFile(html, WHAT);
    expect(reopened).toEqual({ text: script, notes: 0, markdown: false });
  });

  test('refuses any other file with the words it is given', async () => {
    const error = await failure(readScriptFile(put('d.xyz', 'x'), WHAT));
    expect(error).toBeInstanceOf(Refused);
    expect(error?.message).toBe(WHAT);
  });
});

describe('the root entry', () => {
  test('imports nothing from Node', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(file, 'utf8');
      for (const match of code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = match[1] as string;
        expect(spec.startsWith('node:'), `${file} imports ${spec}`).toBe(false);
        if (spec.startsWith('.')) visit(resolve(dirname(file), `${spec}.ts`));
      }
    };
    visit(join(src, 'index.ts'));
    expect(seen.size).toBeGreaterThan(5);
  });
});
