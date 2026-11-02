import { mkdirSync, symlinkSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OUTSIDE, pathProblem, Refusal, resolvePath } from '../src/paths';
import type { Root } from '../src/roots';
import { put, tempFolder } from './temp';

vi.mock('node:fs/promises', { spy: true });

const platform = process.platform;
const skipLinks = platform === 'win32';

/** A Scripts folder and a Plays folder, each a root, with a script in Scripts. */
function setUp(): { t: string; roots: Root[] } {
  const t = tempFolder();
  put(join(t, 'Scripts', 'Signal Hill', '101.fountain'));
  mkdirSync(join(t, 'Plays'));
  return {
    t,
    roots: [
      { name: 'Scripts', real: join(t, 'Scripts') },
      { name: 'Plays', real: join(t, 'Plays') },
    ],
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Refusal);
    return (error as Error).message;
  }
  throw new Error('not refused');
}

describe('pathProblem and resolvePath', () => {
  it("a path starts with a folder's name", async () => {
    const { t, roots } = setUp();
    const checked = await resolvePath('Scripts/Signal Hill/101.fountain', roots, platform, 'file');
    expect(checked.root).toBe(roots[0]);
    expect(checked.real).toBe(join(t, 'Scripts', 'Signal Hill', '101.fountain'));
    expect(checked.shown).toBe('Scripts/Signal Hill/101.fountain');
    expect(checked.size).toBe('INT. RADIO ROOM - NIGHT\n'.length);
    expect(typeof checked.dev).toBe('bigint');
    expect(typeof checked.ino).toBe('bigint');
    expect(checked.mtimeMs).toBeGreaterThan(0);

    const folder = await resolvePath('Plays', roots, platform, 'folder');
    expect(folder).toMatchObject({ shown: 'Plays', real: join(t, 'Plays'), root: roots[1] });

    for (const path of ['Signal Hill/101.fountain', 'scripts/Signal Hill/101.fountain'])
      expect(await refusal(resolvePath(path, roots, platform, 'file'))).toBe(
        'Start the path with one of your folders: Scripts, Plays.',
      );
    expect(await refusal(resolvePath('Scripts/nothing.fountain', roots, platform, 'file'))).toBe(
      'There’s no file at Scripts/nothing.fountain.',
    );
  });

  it('.., ., empty parts, NUL, and absolute paths are refused in every position', async () => {
    const { roots } = setUp();
    const paths = [
      '..',
      'Scripts/..',
      'Scripts/a/../../x',
      'Scripts//a',
      'Scripts/./a',
      '/etc/passwd',
      'C:\\x',
      '\\\\server\\share\\x',
      'Scripts/a\0b',
      '',
      'Scripts/',
      './Scripts',
      '//server/share',
      'C:x',
      'C:',
    ];
    for (const path of paths) {
      for (const system of ['linux', 'darwin', 'win32'] as const)
        expect(pathProblem(path, system), `${JSON.stringify(path)} on ${system}`).not.toBeNull();
      await expect(resolvePath(path, roots, platform, 'file')).rejects.toBeInstanceOf(Refusal);
    }
  });

  it('a Windows folder and a backslashed tool path resolve on win32; a backslash is refused on posix', () => {
    expect(pathProblem('Scripts\\Signal Hill\\101.fountain', 'win32')).toBeNull();
    expect(pathProblem('Scripts/Signal Hill\\101.fountain', 'win32')).toBeNull();
    expect(pathProblem('Scripts\\Signal Hill\\101.fountain', 'linux')).toBe(
      'Use / between the parts of a path, not \\.',
    );
    expect(pathProblem('Scripts\\Signal Hill\\101.fountain', 'darwin')).not.toBeNull();
    expect(pathProblem('Scripts\\..\\x', 'win32')).not.toBeNull();
    expect(pathProblem('Scripts\\\\x', 'win32')).not.toBeNull();
    for (const path of [
      'Scripts/notes.md.',
      'Scripts/a.fountain:x',
      'Scripts/NUL.md',
      'Scripts/C:x',
      'Scripts/pilot .fountain ',
      'Scripts/a?.md',
    ]) {
      expect(pathProblem(path, 'win32'), path).not.toBeNull();
    }
    // The same names are ordinary on macOS and Linux.
    expect(pathProblem('Scripts/notes.md.', 'linux')).toBeNull();
    expect(pathProblem('Scripts/NUL.md', 'darwin')).toBeNull();
    expect(pathProblem('Scripts/Signal Hill/101.fountain', 'linux')).toBeNull();
    expect(pathProblem('Scripts/Signal Hill/101.fountain', 'win32')).toBeNull();
  });

  it('a 10,000-character path is refused before any disk access', async () => {
    const { roots } = setUp();
    const long = `Scripts/${'a'.repeat(9_992)}`;
    expect(pathProblem(long, platform)).toBe('That path is too long.');
    expect(pathProblem(`Scripts/${'a'.repeat(1_016)}`, 'linux')).toBeNull();
    expect(pathProblem(`Scripts/${'a'.repeat(1_017)}`, 'linux')).toBe('That path is too long.');
    vi.mocked(fsPromises.realpath).mockClear();
    vi.mocked(fsPromises.lstat).mockClear();
    expect(await refusal(resolvePath(long, roots, platform, 'file'))).toBe(
      'That path is too long.',
    );
    expect(fsPromises.realpath).not.toHaveBeenCalled();
    expect(fsPromises.lstat).not.toHaveBeenCalled();
    // The spy does see a path that is checked on disk.
    await resolvePath('Scripts/Signal Hill/101.fountain', roots, platform, 'file');
    expect(fsPromises.realpath).toHaveBeenCalledTimes(1);
    expect(fsPromises.lstat).toHaveBeenCalledTimes(1);
  });

  it('a hidden file or folder is refused', async () => {
    const { t, roots } = setUp();
    put(join(t, 'Scripts', '.hidden', 'x.fountain'));
    put(join(t, 'Scripts', '.git', 'config'));
    const hidden = 'Drafter for Claude doesn’t read hidden files or folders.';
    for (const path of [
      'Scripts/.git/config',
      'Scripts/.hidden/x.fountain',
      'Scripts/.x.fountain',
      '.Scripts/a',
    ]) {
      for (const system of ['linux', 'darwin', 'win32'] as const)
        expect(pathProblem(path, system), `${path} on ${system}`).toBe(hidden);
      expect(await refusal(resolvePath(path, roots, platform, 'file'))).toBe(hidden);
    }
    expect(pathProblem('Scripts\\.git\\config', 'win32')).toBe(hidden);
    // A dot inside a name is ordinary.
    expect(pathProblem('Scripts/Signal Hill/v1.2.fountain', 'linux')).toBeNull();
  });

  it.skipIf(skipLinks)('a link out of the folder is refused with the outside message', async () => {
    const { t, roots } = setUp();
    put(join(t, 'Private', 'diary.fountain'));
    symlinkSync(join(t, 'Private', 'diary.fountain'), join(t, 'Scripts', 'diary.fountain'));
    symlinkSync(join(t, 'Private'), join(t, 'Scripts', 'Private'));
    expect(await refusal(resolvePath('Scripts/diary.fountain', roots, platform, 'file'))).toBe(
      OUTSIDE,
    );
    expect(await refusal(resolvePath('Scripts/Private', roots, platform, 'folder'))).toBe(OUTSIDE);
    expect(
      await refusal(resolvePath('Scripts/Private/diary.fountain', roots, platform, 'file')),
    ).toBe(OUTSIDE);
    // A link that stays inside is the file it leads to.
    symlinkSync(
      join(t, 'Scripts', 'Signal Hill', '101.fountain'),
      join(t, 'Scripts', 'latest.fountain'),
    );
    const inside = await resolvePath('Scripts/latest.fountain', roots, platform, 'file');
    expect(inside.real).toBe(join(t, 'Scripts', 'Signal Hill', '101.fountain'));
    expect(inside.shown).toBe('Scripts/latest.fountain');
  });

  it.skipIf(skipLinks)('a link loop is refused', async () => {
    const { t, roots } = setUp();
    symlinkSync(join(t, 'Scripts', 'b.fountain'), join(t, 'Scripts', 'a.fountain'));
    symlinkSync(join(t, 'Scripts', 'a.fountain'), join(t, 'Scripts', 'b.fountain'));
    expect(await refusal(resolvePath('Scripts/a.fountain', roots, platform, 'file'))).toBe(
      'Scripts/a.fountain is a loop of links.',
    );
  });

  it.skipIf(skipLinks)('a sibling that shares a prefix is outside', async () => {
    const { t, roots } = setUp();
    put(join(t, 'Scripts2', 'x.fountain'));
    symlinkSync(join(t, 'Scripts2', 'x.fountain'), join(t, 'Scripts', 'x.fountain'));
    expect(await refusal(resolvePath('Scripts/x.fountain', roots, platform, 'file'))).toBe(OUTSIDE);
  });

  it('a folder inside another is reached by the outer name', async () => {
    const { roots } = setUp();
    // resolveRoots made Scripts/Signal Hill part of Scripts; it has no name of its own.
    expect(
      (await resolvePath('Scripts/Signal Hill/101.fountain', roots, platform, 'file')).shown,
    ).toBe('Scripts/Signal Hill/101.fountain');
    expect(await refusal(resolvePath('Signal Hill/101.fountain', roots, platform, 'file'))).toMatch(
      /^Start the path/,
    );
  });

  it('a folder named like a file is not a file', async () => {
    const { t, roots } = setUp();
    mkdirSync(join(t, 'Scripts', 'Pilot.fountain'));
    expect(await refusal(resolvePath('Scripts/Pilot.fountain', roots, platform, 'file'))).toBe(
      'Scripts/Pilot.fountain is a folder, not a file.',
    );
    expect(
      await refusal(resolvePath('Scripts/Signal Hill/101.fountain', roots, platform, 'folder')),
    ).toBe('Scripts/Signal Hill/101.fountain is a file, not a folder.');
  });
});
