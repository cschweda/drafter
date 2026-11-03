// The command line's fixes found by the trap documents (fixtures/trap): what `build` and `check`
// will read, the column of many problems on one line, and the name `convert` says it wrote.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { MAX_SCRIPT_BYTES, sourceElement } from '@drafter/archive';
import { describe, expect, it } from 'vitest';
import { drafter, tempDir } from './helpers';

const posix = process.platform !== 'win32';

describe('what build and check read', () => {
  const dir = tempDir();

  it.skipIf(!posix)('refuses a named pipe at once, without waiting for a writer', async () => {
    const pipe = join(dir(), 'pipe.fountain');
    execFileSync('mkfifo', [pipe]);
    const start = performance.now();
    for (const command of ['build', 'check']) {
      const result = await drafter(command, pipe, ...(command === 'build' ? ['--txt', '-'] : []));
      expect(result.code).toBe(1);
      expect(result.err).toContain(`can't read ${pipe}: it isn’t a file`);
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it.skipIf(!posix)('refuses a device, which never ends, rather than reading it', async () => {
    const zero = join(dir(), 'zero.fountain');
    symlinkSync('/dev/zero', zero);
    const result = await drafter('check', zero);
    expect(result.code).toBe(1);
    expect(result.err).toContain('it isn’t a file');
  });

  // A folder from someone else, with a link where the PDF goes, can't make build write through it
  // (red/blue audit, 2026-11-03): the PDF replaces the link, and the file it pointed at is untouched.
  it.skipIf(!posix)(
    'replaces a link planted where the output goes, never writing through it',
    async () => {
      const outside = join(dir(), 'outside.txt');
      writeFileSync(outside, 'precious notes');
      const folder = join(dir(), 'folder');
      mkdirSync(folder);
      const script = join(folder, 'script.fountain');
      writeFileSync(script, 'INT. ROOM - DAY\n\nA line.\n');
      symlinkSync(outside, join(folder, 'script.pdf'));
      const result = await drafter('build', script);
      expect(result.code).toBe(0);
      expect(readFileSync(outside, 'utf8')).toBe('precious notes');
      expect(lstatSync(join(folder, 'script.pdf')).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(folder, 'script.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
      // Nothing left behind but the script and its PDF.
      expect(readdirSync(folder).sort()).toEqual(['script.fountain', 'script.pdf']);
    },
  );

  it('says a folder is a folder', async () => {
    const folder = join(dir(), 'folder.fountain');
    mkdirSync(folder);
    const result = await drafter('check', folder);
    expect(result.code).toBe(1);
    expect(result.err).toContain(`can't read ${folder}: it's a folder`);
  });

  it('reads a script of exactly 5 MB, and refuses one a byte over', async () => {
    const line = 'A lever waits.\n';
    const at = join(dir(), 'at.fountain');
    writeFileSync(
      at,
      line.repeat(Math.ceil(MAX_SCRIPT_BYTES / line.length)).slice(0, MAX_SCRIPT_BYTES),
    );
    expect((await drafter('check', at)).code).toBe(0);
    const over = join(dir(), 'over.fountain');
    writeFileSync(over, `${'a'.repeat(MAX_SCRIPT_BYTES)}\n`);
    const result = await drafter('check', over);
    expect(result.code).toBe(1);
    expect(result.err).toContain(`can't read ${over}: it is larger than 5 MB`);
    // A template's JSON file is read the same way.
    const template = join(dir(), 'big.json');
    writeFileSync(template, `"${'a'.repeat(MAX_SCRIPT_BYTES)}"`);
    const big = await drafter('check', at, '--template', template);
    expect(big.err).toContain(`can't read ${template}: it is larger than 5 MB`);
  });
});

describe('the column of each problem', () => {
  const dir = tempDir();

  it('counts code points, surrogate pairs once, for several problems on one line', async () => {
    const line = '🚂 [[ one 👩🏽‍🔧 [[ two 🇬🇧 [[ three';
    const script = join(dir(), 'many.fountain');
    writeFileSync(script, `INT. HALL - DAY\n\n${line}\n\nINT. YARD - DAY\n\n𝒜 [[ four\n`);
    const result = await drafter('check', script);
    const columns = [...result.out.matchAll(/many\.fountain:(\d+):(\d+): warning:/g)].map(
      ([, l, c]) => `${l}:${c}`,
    );
    // As `[...text]` counts them, from the start of each line.
    const expected = (text: string, row: number) =>
      [...text.matchAll(/\[\[/g)].map((m) => `${row}:${[...text.slice(0, m.index)].length + 1}`);
    expect(columns).toEqual([...expected(line, 3), ...expected('𝒜 [[ four', 7)]);
  });

  it('stays fast with many problems on one long line', async () => {
    const script = join(dir(), 'long.fountain');
    writeFileSync(script, `INT. HALL - DAY\n\n${'[[ 🚂 '.repeat(20_000)}\n`);
    const start = performance.now();
    const result = await drafter('check', script);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(result.out).toContain(`long.fountain:3:${[...'[[ 🚂 '.repeat(19_999)].length + 1}:`);
  });
});

describe('convert names the file it writes', () => {
  const dir = tempDir();

  it('a Markdown document from an export is notes.md, converted and then skipped', async () => {
    const page = join(dir(), 'notes.html');
    writeFileSync(
      page,
      `<!DOCTYPE html><html><body>${sourceElement('markdown', '# Notes\n\nHi.\n')}</body></html>`,
    );
    const first = await drafter('convert', page);
    expect(first.out).toContain(`→ ${join(dir(), 'notes.md')}`);
    expect(existsSync(join(dir(), 'notes.md'))).toBe(true);
    expect(existsSync(join(dir(), 'notes.fountain'))).toBe(false);
    const again = await drafter('convert', page);
    expect(again.out).toContain(
      `skipped: ${join(dir(), 'notes.md')} is already there (--force replaces it)`,
    );
  });
});
