// Drafts and cuts written beside a script (src/beside.ts), on real temp folders, called as the
// IPC handlers call them: what a compromised page could ask for, too. Only beside a script the
// writer granted, only names Drafter makes, never over a draft file, never through a link.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, truncateSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanWorkName } from '../../../packages/history/src/draft-file';
import { besideHandlers, checkRel } from '../src/beside';
import { FileError, MAX_READ_BYTES } from '../src/files';
import { Grants } from '../src/grants';

const posix = process.platform !== 'win32';
const bytes = (text: string) => new TextEncoder().encode(text);
const DRAFT = 'Boca drafts/Boca – Draft 01.fountain';
const CUTS = 'Boca.fountain.cuts.md';

let dir: string;
let script: string;
let grants: Grants;
let beside: ReturnType<typeof besideHandlers>;

beforeEach(async () => {
  // Real paths throughout (macOS's temp folder is behind a link).
  dir = await realpath(await mkdtemp(join(tmpdir(), 'drafter-beside-')));
  await mkdir(join(dir, 'Scripts'));
  script = join(dir, 'Scripts', 'Boca.fountain');
  await writeFile(script, 'INT. HALL - DAY\n');
  grants = new Grants(join(dir, 'user-data', 'granted-files.json'));
  await grants.grant(script);
  beside = besideHandlers(grants);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FileError);
    return (error as FileError).code;
  }
  throw new Error('expected a refusal');
}

const at = (rel: string) => join(dir, 'Scripts', rel);
const tempsIn = (folder: string) => readdirSync(folder).filter((n) => n.includes('drafter-tmp'));

describe('writeBeside', () => {
  test('writes a draft file beside a granted script and makes the folder', async () => {
    expect(await beside.writeBeside(script, DRAFT, bytes('Draft one'), 'create')).toBe('written');
    expect(await readFile(at(DRAFT), 'utf8')).toBe('Draft one');
    expect((await lstat(at('Boca drafts'))).isDirectory()).toBe(true);
    expect(tempsIn(at('Boca drafts'))).toEqual([]);
    // A second draft goes into the folder that is now there.
    const second = 'Boca drafts/Boca – Draft 02.fountain';
    expect(await beside.writeBeside(script, second, bytes('Draft two'), 'create')).toBe('written');
    expect(await readFile(at(second), 'utf8')).toBe('Draft two');
  });

  test('writes the cuts file beside the script, and a Markdown draft', async () => {
    expect(await beside.writeBeside(script, CUTS, bytes('# Cuts'), 'replace')).toBe('written');
    expect(await readFile(at(CUTS), 'utf8')).toBe('# Cuts');
    const md = 'Notes drafts/Notes – Draft 01.md';
    expect(await beside.writeBeside(script, md, bytes('# Notes'), 'create')).toBe('written');
    expect(await readFile(at(md), 'utf8')).toBe('# Notes');
  });

  test('create never overwrites', async () => {
    await beside.writeBeside(script, DRAFT, bytes('first'), 'create');
    expect(await beside.writeBeside(script, DRAFT, bytes('second'), 'create')).toBe('exists');
    expect(await readFile(at(DRAFT), 'utf8')).toBe('first');
    expect(tempsIn(at('Boca drafts'))).toEqual([]);
    // Nor the cuts file, made with create.
    await writeFile(at(CUTS), 'theirs');
    expect(await beside.writeBeside(script, CUTS, bytes('mine'), 'create')).toBe('exists');
    expect(await readFile(at(CUTS), 'utf8')).toBe('theirs');
  });

  test('a draft file is only ever created, never replaced', async () => {
    await beside.writeBeside(script, DRAFT, bytes('first'), 'create');
    expect(await codeOf(beside.writeBeside(script, DRAFT, bytes('x'), 'replace'))).toBe(
      'not-allowed',
    );
    expect(await readFile(at(DRAFT), 'utf8')).toBe('first');
  });

  test('replace swaps atomically, keeping the file’s permissions', async () => {
    await writeFile(at(CUTS), 'old');
    if (posix) await chmod(at(CUTS), 0o640);
    const before = (await stat(at(CUTS))).ino;
    expect(await beside.writeBeside(script, CUTS, bytes('new'), 'replace')).toBe('written');
    expect(await readFile(at(CUTS), 'utf8')).toBe('new');
    // A new file renamed into place, not the old one written over.
    expect((await stat(at(CUTS))).ino).not.toBe(before);
    if (posix) expect((await stat(at(CUTS))).mode & 0o777).toBe(0o640);
    expect(tempsIn(at(''))).toEqual([]);
  });

  test('replace refuses a folder where the cuts file would be, and a read-only one', async () => {
    await mkdir(at(CUTS));
    expect(await codeOf(beside.writeBeside(script, CUTS, bytes('x'), 'replace'))).toBe(
      'not-a-file',
    );
    await rm(at(CUTS), { recursive: true });
    if (posix && process.getuid?.() !== 0) {
      await writeFile(at(CUTS), 'kept');
      await chmod(at(CUTS), 0o444);
      expect(await codeOf(beside.writeBeside(script, CUTS, bytes('x'), 'replace'))).toBe(
        'not-allowed',
      );
      expect(await readFile(at(CUTS), 'utf8')).toBe('kept');
    }
  });

  test('refuses an ungranted script, a missing one, and one that isn’t a script', async () => {
    const other = join(dir, 'Scripts', 'Other.fountain');
    await writeFile(other, 'x');
    expect(await codeOf(beside.writeBeside(other, DRAFT, bytes('x'), 'create'))).toBe(
      'not-allowed',
    );
    expect(existsSync(at('Boca drafts'))).toBe(false);
    // A granted export (a PDF saved) has no drafts beside it.
    const pdf = join(dir, 'Scripts', 'Boca.pdf');
    await writeFile(pdf, '%PDF');
    await grants.grant(pdf);
    expect(await codeOf(beside.writeBeside(pdf, DRAFT, bytes('x'), 'create'))).toBe('not-allowed');
    expect(await codeOf(beside.writeBeside('relative.fountain', CUTS, bytes('x'), 'create'))).toBe(
      'failed',
    );
    expect(existsSync(at(CUTS))).toBe(false);
  });

  test('refuses .., separators, NUL, long names, other extensions', async () => {
    const bad = [
      '../Boca.fountain.cuts.md',
      '..',
      'Boca drafts/../x.cuts.md',
      'Boca drafts/..',
      '/etc/x.cuts.md',
      'Boca drafts\\Boca – Draft 01.fountain',
      'a/b/c.fountain',
      'Boca drafts//Boca.fountain',
      'Boca drafts/',
      '',
      'Boca\0.fountain.cuts.md',
      'Boca drafts/Boca\0.fountain',
      `${'x'.repeat(250)}.cuts.md`,
      `Boca drafts/${'é'.repeat(130)}.fountain`,
      'Boca.fountain',
      'Boca.md',
      'Boca drafts/Boca – Draft 01.txt',
      'Boca drafts/Boca – Draft 01.cuts.md.exe',
      'Boca drafts/.Boca.fountain',
      'Boca drafts/Boca.fountain ',
      'Boca drafts/Boca:1.fountain',
      'Boca drafts/Bo*ca.fountain',
      'Boca drafts/Boca\u0007.fountain',
      'Elsewhere/Boca – Draft 01.fountain',
      '.cuts.md',
      ' Boca.cuts.md',
      'nul.cuts.md',
      'Boca drafts/CON.fountain',
    ];
    for (const rel of bad) {
      expect(await codeOf(beside.writeBeside(script, rel, bytes('x'), 'create')), rel).toBe(
        'not-allowed',
      );
      expect(await codeOf(beside.readBeside(script, rel)), rel).toBe('not-allowed');
    }
    for (const rel of [null, 3, {}, ['Boca.fountain.cuts.md']]) {
      expect(await codeOf(beside.writeBeside(script, rel, bytes('x'), 'create'))).toBe(
        'not-allowed',
      );
    }
    expect(readdirSync(at(''))).toEqual(['Boca.fountain']);
  });

  test('refuses a mode or data it doesn’t know, and more than a read could take back', async () => {
    expect(await codeOf(beside.writeBeside(script, CUTS, bytes('x'), 'append'))).toBe('failed');
    expect(await codeOf(beside.writeBeside(script, CUTS, 'text', 'replace'))).toBe('failed');
    const big = new Uint8Array(MAX_READ_BYTES + 1);
    expect(await codeOf(beside.writeBeside(script, CUTS, big, 'replace'))).toBe('too-big');
    expect(existsSync(at(CUTS))).toBe(false);
  });

  test('accepts every name `cleanWorkName` leaves as it is', () => {
    for (const work of ['Boca', 'The Long Goodbye (2)', 'Ünïcödé – ✓', 'a.b', '#1 Hit']) {
      expect(cleanWorkName(work)).toBe(work);
      expect(() => checkRel(`${work} drafts/${work} – Draft 01.fountain`)).not.toThrow();
      expect(() => checkRel(`${work}.fountain.cuts.md`)).not.toThrow();
    }
    // And refuses what it would change.
    for (const work of ['a:b', 'a?b', '.hidden', 'trail.', 'a"b', 'a|b']) {
      expect(cleanWorkName(work)).not.toBe(work);
      expect(() => checkRel(`${work}.fountain.cuts.md`), work).toThrow(FileError);
    }
  });

  describe.runIf(posix)('never follows a link', () => {
    test('at the file', async () => {
      const victim = join(dir, 'victim.txt');
      await writeFile(victim, 'secret');
      await mkdir(at('Boca drafts'));
      await symlink(victim, at(DRAFT));
      expect(await codeOf(beside.writeBeside(script, DRAFT, bytes('x'), 'create'))).toBe(
        'not-allowed',
      );
      await symlink(victim, at(CUTS));
      expect(await codeOf(beside.writeBeside(script, CUTS, bytes('x'), 'replace'))).toBe(
        'not-allowed',
      );
      expect(await readFile(victim, 'utf8')).toBe('secret');
      expect((await lstat(at(CUTS))).isSymbolicLink()).toBe(true);
      // Reading one is refused too: its target is never read.
      expect(await codeOf(beside.readBeside(script, CUTS))).toBe('not-allowed');
      expect(await codeOf(beside.readBeside(script, DRAFT))).toBe('not-allowed');
    });

    test('at a dangling link, which would make a file elsewhere', async () => {
      const elsewhere = join(dir, 'made-elsewhere.fountain');
      await mkdir(at('Boca drafts'));
      await symlink(elsewhere, at(DRAFT));
      expect(await codeOf(beside.writeBeside(script, DRAFT, bytes('x'), 'create'))).toBe(
        'not-allowed',
      );
      expect(existsSync(elsewhere)).toBe(false);
    });

    test('at the folder', async () => {
      const outside = join(dir, 'outside');
      await mkdir(outside);
      await symlink(outside, at('Boca drafts'));
      expect(await codeOf(beside.writeBeside(script, DRAFT, bytes('x'), 'create'))).toBe(
        'not-allowed',
      );
      expect(readdirSync(outside)).toEqual([]);
      expect(await codeOf(beside.readBeside(script, DRAFT))).toBe('not-allowed');
      expect(await codeOf(beside.listBeside(script, 'Boca drafts'))).toBe('not-allowed');
    });

    test('at the parent: a script’s folder swapped for a link after it was granted', async () => {
      const other = join(dir, 'Other');
      await mkdir(other);
      await writeFile(join(other, 'Boca.fountain'), 'other');
      await rename(join(dir, 'Scripts'), join(dir, 'Moved'));
      await symlink(other, join(dir, 'Scripts'));
      expect(await codeOf(beside.writeBeside(script, CUTS, bytes('x'), 'replace'))).toBe(
        'not-allowed',
      );
      expect(readdirSync(other)).toEqual(['Boca.fountain']);
    });

    test('a file where the drafts folder would be is refused, not replaced', async () => {
      await writeFile(at('Boca drafts'), 'a file');
      expect(await codeOf(beside.writeBeside(script, DRAFT, bytes('x'), 'create'))).toBe(
        'not-a-file',
      );
      expect(await readFile(at('Boca drafts'), 'utf8')).toBe('a file');
    });
  });
});

describe('readBeside', () => {
  test('reads what was written, and null for a file or folder not there', async () => {
    expect(await beside.readBeside(script, DRAFT)).toBeNull();
    expect(await beside.readBeside(script, CUTS)).toBeNull();
    await beside.writeBeside(script, DRAFT, bytes('Draft one'), 'create');
    await beside.writeBeside(script, CUTS, bytes('# Cuts'), 'replace');
    expect(new TextDecoder().decode((await beside.readBeside(script, DRAFT)) ?? undefined)).toBe(
      'Draft one',
    );
    expect(new TextDecoder().decode((await beside.readBeside(script, CUTS)) ?? undefined)).toBe(
      '# Cuts',
    );
  });

  test('refuses an ungranted script', async () => {
    const other = join(dir, 'Scripts', 'Other.fountain');
    await writeFile(other, 'x');
    expect(await codeOf(beside.readBeside(other, CUTS))).toBe('not-allowed');
    expect(await codeOf(beside.listBeside(other, 'Boca drafts'))).toBe('not-allowed');
  });

  test('refuses a folder in a file’s place, and a file over the cap', async () => {
    await mkdir(at(CUTS));
    expect(await codeOf(beside.readBeside(script, CUTS))).toBe('not-a-file');
    await rm(at(CUTS), { recursive: true });
    await writeFile(at(CUTS), '');
    // Sparse: it takes none of the space it says.
    truncateSync(at(CUTS), MAX_READ_BYTES + 1);
    expect(await codeOf(beside.readBeside(script, CUTS))).toBe('too-big');
  });

  test.runIf(posix)('refuses a named pipe at once, without waiting for a writer', async () => {
    execFileSync('mkfifo', [at(CUTS)]);
    const start = performance.now();
    expect(await codeOf(beside.readBeside(script, CUTS))).toBe('not-a-file');
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('listBeside', () => {
  test('lists the draft files in the folder, and nothing for a folder not there', async () => {
    expect(await beside.listBeside(script, 'Boca drafts')).toEqual([]);
    await beside.writeBeside(script, 'Boca drafts/Boca – Draft 02.fountain', bytes('2'), 'create');
    await beside.writeBeside(script, DRAFT, bytes('1'), 'create');
    await writeFile(at('Boca drafts/notes.txt'), 'not a draft');
    await writeFile(at('Boca drafts/.Boca – Draft 03.fountain.drafter-tmp-0123456789ab'), 'temp');
    await mkdir(at('Boca drafts/Sub.fountain'));
    if (posix) await symlink(script, at('Boca drafts/Link.fountain'));
    expect(await beside.listBeside(script, 'Boca drafts')).toEqual([
      'Boca – Draft 01.fountain',
      'Boca – Draft 02.fountain',
    ]);
  });

  test('refuses a folder name that isn’t a drafts folder', async () => {
    for (const folder of ['..', '.', '', 'Boca', 'a/b drafts', '../x drafts', 'x\0 drafts', 5]) {
      expect(await codeOf(beside.listBeside(script, folder)), String(folder)).toBe('not-allowed');
    }
  });

  test('refuses a file in the folder’s place', async () => {
    await writeFile(at('Boca drafts'), 'x');
    expect(await codeOf(beside.listBeside(script, 'Boca drafts'))).toBe('not-a-file');
  });
});
