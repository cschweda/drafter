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
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanWorkName } from '../../../packages/history/src/draft-file';
import { besideHandlers, besideNames, checkRel } from '../src/beside';
import { FileError, MAX_READ_BYTES } from '../src/files';
import { Grants } from '../src/grants';
import { cleanWorkName as mainCleanWorkName } from '../src/work-names';

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
    // A Markdown draft of the same work (Boca.md would share the folder).
    const md = 'Boca drafts/Boca – Draft 01.md';
    expect(await beside.writeBeside(script, md, bytes('# Notes'), 'create')).toBe('written');
    expect(await readFile(at(md), 'utf8')).toBe('# Notes');
    // Another computer's Draft 01, kept beside this one's.
    const two = 'Boca drafts/Boca – Draft 01 (2).fountain';
    expect(await beside.writeBeside(script, two, bytes('theirs'), 'create')).toBe('written');
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
      const names = besideNames(`/w/${work}.fountain`);
      expect(() => checkRel(`${work} drafts/${work} – Draft 01.fountain`, names)).not.toThrow();
      expect(() => checkRel(`${work} drafts/${work} – Draft 100.md`, names)).not.toThrow();
      expect(() => checkRel(`${work}.fountain.cuts.md`, names)).not.toThrow();
    }
    // And refuses what it would change.
    for (const work of ['a:b', 'a?b', '.hidden', 'trail.', 'a"b', 'a|b']) {
      expect(cleanWorkName(work)).not.toBe(work);
      expect(
        () => checkRel(`${work}.fountain.cuts.md`, besideNames('/w/x.fountain')),
        work,
      ).toThrow(FileError);
    }
  });

  test('the main process cleans a name exactly as the page does', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), (work) => {
        let page: string | Error;
        let main: string | Error;
        try {
          page = cleanWorkName(work);
        } catch (error) {
          page = error as Error;
        }
        try {
          main = mainCleanWorkName(work);
        } catch (error) {
          main = error as Error;
        }
        if (page instanceof Error) expect(main).toBeInstanceOf(RangeError);
        else expect(main).toBe(page);
      }),
      { numRuns: 500 },
    );
  });

  test('the names are the granted script’s: as `cleanWorkName` makes them', () => {
    for (const name of ['Boca.fountain', 'The Long Goodbye (2).md', 'a:b?.fountain', 'x.txt']) {
      const stem = name.slice(0, name.lastIndexOf('.'));
      expect(besideNames(`/w/${name}`)).toEqual({
        cuts: `${cleanWorkName(name)}.cuts.md`,
        folder: `${cleanWorkName(stem)} drafts`,
        draft: `${cleanWorkName(stem)} – Draft `,
      });
    }
  });

  test('refuses names of another work: its cuts file, its drafts folder, its drafts', async () => {
    const other = [
      'Other.fountain.cuts.md',
      'Boca.md.cuts.md',
      'Boca.fountain.cuts.md.cuts.md',
      'Other drafts/Other – Draft 01.fountain',
      'Other drafts/Boca – Draft 01.fountain',
      'Boca drafts/Other – Draft 01.fountain',
      'Boca drafts/Boca – Draft 1.fountain',
      'Boca drafts/Boca – Draft 001.fountain',
      'Boca drafts/Boca – Draft 00.fountain',
      'Boca drafts/Boca – Draft 01 (x).fountain',
      'Boca drafts/Boca – Draft 01 (0).fountain',
      'Boca drafts/Boca – Draft 01x.fountain',
      'Boca drafts/Boca – Draft .fountain',
      'Boca drafts/Boca – Draft 01.fountain.md',
      'Boca drafts/notes.md',
      'Boca drafts/Boca.fountain',
      'Boca drafts/Boca - Draft 01.fountain',
    ];
    for (const rel of other) {
      expect(await codeOf(beside.writeBeside(script, rel, bytes('x'), 'create')), rel).toBe(
        'not-allowed',
      );
      expect(await codeOf(beside.readBeside(script, rel)), rel).toBe('not-allowed');
    }
    expect(await codeOf(beside.listBeside(script, 'Other drafts'))).toBe('not-allowed');
    expect(readdirSync(at(''))).toEqual(['Boca.fountain']);
    // Another granted script has its own names, and only those.
    const other2 = join(dir, 'Scripts', 'Other.fountain');
    await writeFile(other2, 'x');
    await grants.grant(other2);
    expect(await beside.writeBeside(other2, 'Other.fountain.cuts.md', bytes('x'), 'replace')).toBe(
      'written',
    );
    expect(await codeOf(beside.writeBeside(other2, CUTS, bytes('x'), 'replace'))).toBe(
      'not-allowed',
    );
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

// Windows has no O_NOFOLLOW: the open there follows a link. These run with the flag as 0, so the
// lstat before the open, and the open handle's identity after it, are what refuse a link.
describe.runIf(posix)('without O_NOFOLLOW, as on Windows', () => {
  let swap: ((path: string) => Promise<void>) | null;
  let plain: ReturnType<typeof besideHandlers>;
  beforeEach(() => {
    swap = null;
    plain = besideHandlers(grants, {
      noFollow: 0,
      afterCheck: async (path) => {
        await swap?.(path);
      },
    });
  });

  test('a link at the file is refused before it is opened', async () => {
    const victim = join(dir, 'victim.txt');
    await writeFile(victim, 'secret');
    await symlink(victim, at(CUTS));
    expect(await codeOf(plain.readBeside(script, CUTS))).toBe('not-allowed');
    await mkdir(at('Boca drafts'));
    await symlink(victim, at(DRAFT));
    expect(await codeOf(plain.readBeside(script, DRAFT))).toBe('not-allowed');
    expect(await codeOf(plain.writeBeside(script, DRAFT, bytes('x'), 'create'))).toBe(
      'not-allowed',
    );
    expect(await codeOf(plain.writeBeside(script, CUTS, bytes('x'), 'replace'))).toBe(
      'not-allowed',
    );
    expect(await readFile(victim, 'utf8')).toBe('secret');
  });

  test('a file swapped for a link between the check and the open is refused', async () => {
    const victim = join(dir, 'victim.txt');
    await writeFile(victim, 'secret');
    await writeFile(at(CUTS), 'mine');
    swap = async (path) => {
      if (!path.endsWith(CUTS)) return;
      await rm(path);
      await symlink(victim, path);
    };
    expect(await codeOf(plain.readBeside(script, CUTS))).toBe('not-allowed');
  });

  test('a drafts folder swapped for a link during a read or a write is refused', async () => {
    const outside = join(dir, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'Boca – Draft 01.fountain'), 'theirs');
    await beside.writeBeside(script, DRAFT, bytes('mine'), 'create');
    swap = async (path) => {
      if (!path.endsWith('Boca – Draft 01.fountain') && !path.endsWith('Boca – Draft 02.fountain'))
        return;
      swap = null;
      await rename(at('Boca drafts'), at('Moved'));
      await symlink(outside, at('Boca drafts'));
    };
    expect(await codeOf(plain.readBeside(script, DRAFT))).toBe('not-allowed');
    await rm(at('Boca drafts'));
    await rename(at('Moved'), at('Boca drafts'));
    swap = async (path) => {
      if (!path.endsWith('Boca – Draft 02.fountain')) return;
      swap = null;
      await rename(at('Boca drafts'), at('Moved2'));
      await symlink(outside, at('Boca drafts'));
    };
    const second = 'Boca drafts/Boca – Draft 02.fountain';
    expect(await codeOf(plain.writeBeside(script, second, bytes('x'), 'create'))).toBe(
      'not-allowed',
    );
    expect(readdirSync(outside)).toEqual(['Boca – Draft 01.fountain']);
  });

  test('reads and writes as usual when nothing is swapped', async () => {
    expect(await plain.writeBeside(script, DRAFT, bytes('one'), 'create')).toBe('written');
    expect(await plain.writeBeside(script, CUTS, bytes('cuts'), 'replace')).toBe('written');
    expect(new TextDecoder().decode((await plain.readBeside(script, DRAFT)) ?? undefined)).toBe(
      'one',
    );
    expect(new TextDecoder().decode((await plain.readBeside(script, CUTS)) ?? undefined)).toBe(
      'cuts',
    );
  });
});
