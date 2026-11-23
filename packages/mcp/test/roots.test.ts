import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRoots, StartError, wholeVolume } from '../src/roots';
import { put, tempFolder } from './temp';

const platform = process.platform;

describe('resolveRoots', () => {
  it('each folder is its real path', async () => {
    const t = tempFolder();
    mkdirSync(join(t, 'Scripts'));
    mkdirSync(join(t, 'Plays'));
    const roots = await resolveRoots(
      [join(t, 'Scripts', '..', 'Scripts'), join(t, 'Plays')],
      platform,
    );
    expect(roots).toEqual([
      { name: 'Scripts', real: join(t, 'Scripts') },
      { name: 'Plays', real: join(t, 'Plays') },
    ]);
  });

  it.skipIf(platform === 'win32')('a link to a folder is the folder it leads to', async () => {
    const t = tempFolder();
    mkdirSync(join(t, 'Scripts'));
    symlinkSync(join(t, 'Scripts'), join(t, 'Shortcut'));
    expect(await resolveRoots([join(t, 'Shortcut')], platform)).toEqual([
      { name: 'Scripts', real: join(t, 'Scripts') },
    ]);
  });

  it('two folders named alike are Scripts and Scripts (2)', async () => {
    const t = tempFolder();
    for (const dir of ['a/Scripts', 'b/Scripts', 'c/Scripts', 'd/scripts'])
      mkdirSync(join(t, dir), { recursive: true });
    const roots = await resolveRoots(
      ['a/Scripts', 'b/Scripts', 'c/Scripts', 'd/scripts'].map((dir) => join(t, dir)),
      platform,
    );
    expect(roots.map((root) => root.name)).toEqual([
      'Scripts',
      'Scripts (2)',
      'Scripts (3)',
      'scripts (4)',
    ]);
    expect(roots[1]?.real).toBe(join(t, 'b', 'Scripts'));
  });

  it('a folder inside another is one root', async () => {
    const t = tempFolder();
    mkdirSync(join(t, 'Scripts', 'Signal Hill'), { recursive: true });
    const outer = join(t, 'Scripts');
    const inner = join(t, 'Scripts', 'Signal Hill');
    expect(await resolveRoots([outer, inner, outer], platform)).toEqual([
      { name: 'Scripts', real: outer },
    ]);
    // Named inner first, the outer folder still holds it: one root, the outer one.
    expect(await resolveRoots([inner, outer], platform)).toEqual([
      { name: 'Scripts', real: outer },
    ]);
  });

  it('a sibling that shares a prefix is its own root', async () => {
    const t = tempFolder();
    mkdirSync(join(t, 'Scripts'));
    mkdirSync(join(t, 'Scripts2'));
    expect(
      (await resolveRoots([join(t, 'Scripts'), join(t, 'Scripts2')], platform)).map((r) => r.name),
    ).toEqual(['Scripts', 'Scripts2']);
  });

  it("a file, a missing path, and a drive's root are refused", async () => {
    const t = tempFolder();
    const file = put(join(t, 'pilot.fountain'));
    await expect(resolveRoots([file], platform)).rejects.toThrow(
      new StartError(`${file} isn’t a folder.`),
    );
    const missing = join(t, 'nowhere');
    await expect(resolveRoots([missing], platform)).rejects.toThrow(
      new StartError(`${missing} isn’t a folder.`),
    );
    const drive = parse(t).root;
    await expect(resolveRoots([drive], platform)).rejects.toThrow(
      new StartError(`Choose a folder, not a whole drive: ${drive}.`),
    );
    await expect(resolveRoots([t, drive], platform)).rejects.toBeInstanceOf(StartError);
  });

  it.skipIf(platform === 'win32')(
    'refuses a folder that is a whole volume, or everyone’s files',
    async () => {
      // Red/blue audit, 2026-11-23 (M5): only `/` was refused.
      const { homedir } = await import('node:os');
      const everyone = dirname(await realpath(homedir()));
      await expect(resolveRoots([everyone], platform)).rejects.toThrow(/not a whole drive/);
      expect(await wholeVolume('/Volumes', platform)).toBe(true);
      expect(await wholeVolume('/home', platform)).toBe(true);
      // An ordinary folder, on the device of the folder that holds it.
      const t = mkdtempSync(join(tmpdir(), 'drafter-roots-'));
      mkdirSync(join(t, 'Scripts'));
      expect(await wholeVolume(await realpath(join(t, 'Scripts')), platform)).toBe(false);
    },
  );
});
