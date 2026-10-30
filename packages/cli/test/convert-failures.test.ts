// `drafter convert` when the disk fails partway: a write that runs out of space after some bytes,
// and a publish that fails. Nothing half-written may be left where a later run would skip it, and
// no temporary file may be left at all. The failures are injected into `node:fs/promises`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drafter, tempDir } from './helpers';

const fail = vi.hoisted(() => ({ write: false, link: false, rename: false, noLinks: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const failure = (code: string) => Object.assign(new Error(`${code}: injected`), { code });
  return {
    ...real,
    // Writes the first bytes, then runs out of space, as a full disk does.
    writeFile: async (...args: Parameters<typeof real.writeFile>) => {
      if (!fail.write) return real.writeFile(...args);
      const [path, data, options] = args;
      await real.writeFile(path, String(data).slice(0, 10), options);
      throw failure('ENOSPC');
    },
    link: async (...args: Parameters<typeof real.link>) => {
      if (fail.link) throw failure('EIO');
      if (fail.noLinks) throw failure('ENOTSUP'); // a FAT or exFAT drive
      return real.link(...args);
    },
    rename: async (...args: Parameters<typeof real.rename>) => {
      if (fail.rename) throw failure('EIO');
      return real.rename(...args);
    },
  };
});

const FDX =
  '<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="5"><Content><Paragraph Type="Action"><Text>The tide turns.</Text></Paragraph></Content></FinalDraft>';

describe('drafter convert, when the disk fails', () => {
  const dir = tempDir();
  afterEach(() => {
    Object.assign(fail, { write: false, link: false, rename: false, noLinks: false });
  });

  for (const [what, flags, force] of [
    ['a write that runs out of space', { write: true }, false],
    ['a write that runs out of space, with --force', { write: true }, true],
    ['a failed publish', { link: true }, false],
    ['a failed replace, with --force', { rename: true }, true],
  ] as const) {
    it(`leaves neither a .fountain nor a temporary file after ${what}`, async () => {
      writeFileSync(join(dir(), 'a.fdx'), FDX);
      Object.assign(fail, flags);
      const args = ['convert', join(dir(), 'a.fdx'), ...(force ? ['--force'] : [])];
      const result = await drafter(...args);
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/a\.fdx: refused: can't write .*a\.fountain: /);
      expect(readdirSync(dir())).toEqual(['a.fdx']);
    });
  }

  it('on a disk without hard links, copies the file into place, never over one', async () => {
    fail.noLinks = true;
    writeFileSync(join(dir(), 'a.fdx'), FDX);
    writeFileSync(join(dir(), 'b.fdx'), FDX);
    writeFileSync(join(dir(), 'b.fountain'), 'MINE');
    const result = await drafter('convert', dir());
    expect(result.code, result.out).toBe(0);
    expect(result.out).toMatch(/^1 converted, 1 skipped$/m);
    expect(readFileSync(join(dir(), 'a.fountain'), 'utf8')).toBe('The tide turns.\n');
    expect(readFileSync(join(dir(), 'b.fountain'), 'utf8')).toBe('MINE');
    expect(readdirSync(dir()).sort()).toEqual(['a.fdx', 'a.fountain', 'b.fdx', 'b.fountain']);
  });
});
