import { execFileSync } from 'node:child_process';
import { type Dirent, mkdirSync, symlinkSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolvePath } from '../src/paths';
import type { Root } from '../src/roots';
import { WALK_LIMITS, walk } from '../src/walk';
import { put, tempFolder } from './temp';

vi.mock('node:fs/promises', { spy: true });

const platform = process.platform;
const skipLinks = platform === 'win32';

function scripts(): { t: string; root: Root } {
  const t = tempFolder();
  mkdirSync(join(t, 'Scripts'));
  return { t, root: { name: 'Scripts', real: join(t, 'Scripts') } };
}

const shown = (result: { found: Array<{ shown: string }> }) => result.found.map((f) => f.shown);

describe('walk', () => {
  it('finds the scripts in name order, skipping dot files and other kinds', async () => {
    const { t, root } = scripts();
    const s = join(t, 'Scripts');
    for (const name of [
      'b.fountain',
      'B.md',
      'a.txt',
      'Z.fdx',
      'cover.pdf',
      'notes.docx',
      '.hidden.fountain',
      '.git/config.md',
      'Signal Hill/101.fountain',
      'Signal Hill/102.FOUNTAIN',
      'Signal Hill/art.png',
      'export.html',
      'export.epub',
    ])
      put(join(s, name));
    const all = await walk(root, true);
    expect(shown(all)).toEqual([
      'Scripts/B.md',
      'Scripts/Signal Hill/101.fountain',
      'Scripts/Signal Hill/102.FOUNTAIN',
      'Scripts/Z.fdx',
      'Scripts/a.txt',
      'Scripts/b.fountain',
      'Scripts/export.epub',
      'Scripts/export.html',
    ]);
    expect(all.truncated).toBe(false);
    expect(all.found.map((f) => f.format)).toEqual([
      'markdown',
      'fountain',
      'fountain',
      'fdx',
      'text',
      'fountain',
      'epub',
      'html',
    ]);
    const first = all.found[0];
    expect(first).toMatchObject({ real: join(s, 'B.md'), size: 24 });
    expect(typeof first?.dev).toBe('bigint');
    expect(typeof first?.ino).toBe('bigint');

    expect(shown(await walk(root, false))).toEqual([
      'Scripts/B.md',
      'Scripts/Z.fdx',
      'Scripts/a.txt',
      'Scripts/b.fountain',
      'Scripts/export.epub',
      'Scripts/export.html',
    ]);
    // From a checked subfolder, paths keep the folder's name.
    const sub = await resolvePath('Scripts/Signal Hill', [root], platform, 'folder');
    expect(shown(await walk(sub, true))).toEqual([
      'Scripts/Signal Hill/101.fountain',
      'Scripts/Signal Hill/102.FOUNTAIN',
    ]);
  });

  it.skipIf(skipLinks)('never follows a link to a folder', async () => {
    const { t, root } = scripts();
    put(join(t, 'Scripts', 'Signal Hill', '101.fountain'));
    put(join(t, 'Elsewhere', 'secret.fountain'));
    symlinkSync(join(t, 'Scripts', 'Signal Hill'), join(t, 'Scripts', 'Again'));
    symlinkSync(join(t, 'Elsewhere'), join(t, 'Scripts', 'Elsewhere'));
    symlinkSync(join(t, 'Scripts'), join(t, 'Scripts', 'Signal Hill', 'Loop'));
    expect(shown(await walk(root, true))).toEqual(['Scripts/Signal Hill/101.fountain']);
  });

  it.skipIf(skipLinks)('keeps a link to a file only inside the folders', async () => {
    const { t, root } = scripts();
    const real = put(join(t, 'Scripts', 'Signal Hill', '101.fountain'));
    put(join(t, 'Elsewhere', 'secret.fountain'));
    put(join(t, 'Scripts2', 'near.fountain'));
    symlinkSync(real, join(t, 'Scripts', 'latest.fountain'));
    symlinkSync(join(t, 'Elsewhere', 'secret.fountain'), join(t, 'Scripts', 'secret.fountain'));
    symlinkSync(join(t, 'Scripts2', 'near.fountain'), join(t, 'Scripts', 'near.fountain'));
    symlinkSync(join(t, 'Scripts', 'gone.fountain'), join(t, 'Scripts', 'broken.fountain'));
    // A link with a script's name to a file of another kind is still named by the link.
    const { found } = await walk(root, true);
    expect(found.map((f) => [f.shown, f.real])).toEqual([
      ['Scripts/Signal Hill/101.fountain', real],
      ['Scripts/latest.fountain', real],
    ]);
  });

  it.skipIf(skipLinks)('skips pipes and other things that are not files', async () => {
    const { t, root } = scripts();
    execFileSync('mkfifo', [join(t, 'Scripts', 'pipe.fountain')]);
    put(join(t, 'Scripts', 'real.fountain'));
    expect(shown(await walk(root, true))).toEqual(['Scripts/real.fountain']);
  });

  it('stops at 6 levels and 500 files', async () => {
    expect(WALK_LIMITS).toEqual({ depth: 6, files: 500 });
    const { t, root } = scripts();
    // 8 levels of 250 files each: 2,000 in all.
    let dir = join(t, 'Scripts');
    for (let level = 0; level < 8; level++) {
      for (let i = 0; i < 250; i++) put(join(dir, `${String(i).padStart(3, '0')}.fountain`), '');
      dir = join(dir, 'z');
    }
    const result = await walk(root, true);
    expect(result.found).toHaveLength(500);
    expect(result.truncated).toBe(true);

    // Deep, but few files: nothing below the sixth level.
    const deep = scripts();
    let d = join(deep.t, 'Scripts');
    for (let level = 0; level <= 8; level++) {
      put(join(d, `level ${level}.fountain`));
      d = join(d, 'z');
    }
    const levels = await walk(deep.root, true);
    expect(levels.found.map((f) => f.shown.split('/').pop())).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((level) => `level ${level}.fountain`),
    );
    expect(levels.truncated).toBe(true);

    // Exactly 500 is all of them.
    const exact = scripts();
    for (let i = 0; i < 500; i++)
      put(join(exact.t, 'Scripts', `${String(i).padStart(3, '0')}.md`), '');
    const all = await walk(exact.root, true);
    expect(all.found).toHaveLength(500);
    expect(all.truncated).toBe(false);
  });

  it('drafts folders and cuts files are left to their tools', async () => {
    const { t, root } = scripts();
    const s = join(t, 'Scripts');
    put(join(s, 'Signal Hill – 101.fountain'));
    put(join(s, 'Signal Hill – 101 drafts', 'Signal Hill – 101 – Draft 01.fountain'));
    put(join(s, 'Signal Hill – 101.fountain.cuts.md'));
    put(join(s, 'Bible.md'));
    put(join(s, 'Bible.md.cuts.md'));
    // A folder ending in " drafts" with no work beside it is an ordinary folder.
    put(join(s, 'Old drafts', 'pilot.fountain'));
    expect(shown(await walk(root, true))).toEqual([
      'Scripts/Bible.md',
      'Scripts/Old drafts/pilot.fountain',
      'Scripts/Signal Hill – 101.fountain',
    ]);
  });

  it.skipIf(skipLinks)(
    'a file or folder that leads outside is dropped even when listed as no link',
    async () => {
      // As if a subfolder and a file were swapped for links after their folder was listed: the
      // listing says "folder" and "file", but each really leads out of the root.
      const { t, root } = scripts();
      const s = join(t, 'Scripts');
      put(join(s, 'kept.fountain'));
      put(join(t, 'Elsewhere', 'secret.fountain'));
      symlinkSync(join(t, 'Elsewhere'), join(s, 'Sub'));
      symlinkSync(join(t, 'Elsewhere', 'secret.fountain'), join(s, 'swapped.fountain'));
      const stale = (name: string, kind: 'folder' | 'file') =>
        ({
          name,
          parentPath: s,
          isDirectory: () => kind === 'folder',
          isFile: () => kind === 'file',
          isSymbolicLink: () => false,
        }) as unknown as Dirent;
      vi.mocked(fsPromises.readdir).mockImplementationOnce((async () => [
        stale('kept.fountain', 'file'),
        stale('Sub', 'folder'),
        stale('swapped.fountain', 'file'),
      ]) as unknown as typeof fsPromises.readdir);
      vi.mocked(fsPromises.readdir).mockClear();
      const { found } = await walk(root, true, platform);
      expect(found.map((f) => [f.shown, f.real])).toEqual([
        ['Scripts/kept.fountain', join(s, 'kept.fountain')],
      ]);
      // The folder outside is never even listed.
      expect(vi.mocked(fsPromises.readdir).mock.calls.map(([dir]) => String(dir))).toEqual([s]);
    },
  );
});
