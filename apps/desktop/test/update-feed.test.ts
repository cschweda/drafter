import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { checkFeed, checkFeeds } from '../scripts/check-update-feed.mjs';

const sha = (text: string) => createHash('sha512').update(text).digest('base64');

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-feed-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function release(options: { image?: string; deb?: string; feed?: string } = {}) {
  const image = options.image ?? 'the image';
  const deb = options.deb ?? 'the deb';
  await writeFile(join(dir, 'Drafter-x86_64.AppImage'), image);
  await writeFile(join(dir, 'Drafter-1.0.0-linux-amd64.deb'), deb);
  await writeFile(
    join(dir, 'latest-linux.yml'),
    options.feed ??
      `version: 1.0.0
files:
  - url: Drafter-x86_64.AppImage
    sha512: ${sha('the image')}
    size: ${Buffer.byteLength('the image')}
    blockMapSize: 5
  - url: Drafter-1.0.0-linux-amd64.deb
    sha512: ${sha('the deb')}
    size: ${Buffer.byteLength('the deb')}
path: Drafter-x86_64.AppImage
sha512: ${sha('the image')}
releaseDate: '2026-10-27T12:22:14.158Z'
`,
  );
}

describe('checkFeed', () => {
  test('accepts a feed that agrees with its files', async () => {
    await release();
    expect(checkFeed(dir)).toEqual([]);
  });

  test('finds a file the feed names that is not there', async () => {
    await release();
    await rm(join(dir, 'Drafter-1.0.0-linux-amd64.deb'));
    expect(checkFeed(dir).join('\n')).toMatch(/amd64\.deb: named in latest-linux\.yml but not in/);
  });

  test('finds a file whose sha512 is not the feed’s', async () => {
    await release({ deb: 'a different deb' });
    expect(checkFeed(dir).join('\n')).toMatch(
      /amd64\.deb: sha512 is .* but latest-linux\.yml says/,
    );
  });

  test('finds a feed with no AppImage, no path, or a path it does not list', async () => {
    await release({
      feed: 'version: 1.0.0\nfiles:\n  - url: Drafter-1.0.0-linux-amd64.deb\n    sha512: x\n',
    });
    const problems = checkFeed(dir).join('\n');
    expect(problems).toMatch(/no AppImage/);
    expect(problems).toMatch(/no `path`/);
    await release({
      feed: `version: 1.0.0\nfiles:\n  - url: Drafter-x86_64.AppImage\n    sha512: ${sha('the image')}\npath: Other.AppImage\nsha512: x\n`,
    });
    expect(checkFeed(dir).join('\n')).toMatch(/path Other\.AppImage is not one of the files/);
  });

  test('refuses names that leave the folder', async () => {
    await release({
      feed: `version: 1.0.0\nfiles:\n  - url: ../x.AppImage\n    sha512: x\npath: ../x.AppImage\nsha512: x\n`,
    });
    expect(checkFeed(dir).join('\n')).toMatch(/not a plain file name/);
  });

  test('refuses an AppImage whose name carries a version', async () => {
    // electron-updater installs a versioned AppImage's update under the new version's name and
    // deletes the old file, which launchers and an AppArmor profile still point at.
    await release();
    const named = 'Drafter-1.0.0-linux-x86_64.AppImage';
    await writeFile(join(dir, named), 'the image');
    await writeFile(
      join(dir, 'latest-linux.yml'),
      `version: 1.0.0\nfiles:\n  - url: ${named}\n    sha512: ${sha('the image')}\n    size: 9\npath: ${named}\nsha512: ${sha('the image')}\n`,
    );
    expect(checkFeed(dir).join('\n')).toMatch(
      /Drafter-1\.0\.0-linux-x86_64\.AppImage: an AppImage's name must not carry a version/,
    );
  });

  test('reports a missing feed', () => {
    expect(checkFeed(dir)[0]).toMatch(/does not exist/);
  });
});

describe('checkFeed, for latest.yml (Windows)', () => {
  const X64 = 'Drafter-1.0.0-windows-x64-setup.exe';
  const ARM = 'Drafter-1.0.0-windows-arm64-setup.exe';
  async function windows(names: string[] = [X64, ARM], options: { version?: string } = {}) {
    for (const name of names) await writeFile(join(dir, name), `the ${name}`);
    const [first] = names;
    await writeFile(
      join(dir, 'latest.yml'),
      `version: ${options.version ?? '1.0.0'}
files:
${names.map((name) => `  - url: ${name}\n    sha512: ${sha(`the ${name}`)}\n    size: ${Buffer.byteLength(`the ${name}`)}`).join('\n')}
path: ${first}
sha512: ${sha(`the ${first}`)}
releaseDate: '2026-10-27T12:22:14.158Z'
`,
    );
  }

  test('accepts an installer per processor, each named with its processor and the version', async () => {
    await windows();
    expect(checkFeed(dir, 'latest.yml')).toEqual([]);
  });

  test('accepts a single installer (the update test builds only x64)', async () => {
    await windows([X64]);
    expect(checkFeed(dir, 'latest.yml')).toEqual([]);
  });

  test('for a release, wants an installer for every processor', async () => {
    // electron-updater falls back to the first .exe when none holds the app's processor, so an
    // arm64 Drafter would install the x64 build over itself without a word.
    await windows([X64]);
    expect(checkFeed(dir, 'latest.yml', { release: true }).join('\n')).toMatch(
      /latest\.yml names no installer for arm64/,
    );
    await windows();
    expect(checkFeed(dir, 'latest.yml', { release: true })).toEqual([]);
    expect(checkFeeds(dir, ['latest.yml'], { release: true })).toEqual([]);
  });

  test('finds an installer that is missing or changed', async () => {
    await windows();
    await writeFile(join(dir, ARM), 'something else');
    expect(checkFeed(dir, 'latest.yml').join('\n')).toMatch(
      /arm64-setup\.exe: sha512 is .* but latest\.yml says/,
    );
    await rm(join(dir, ARM));
    expect(checkFeed(dir, 'latest.yml').join('\n')).toMatch(/named in latest\.yml but not in/);
  });

  test('wants each name to hold one processor, and no two the same', async () => {
    // electron-updater takes the first .exe whose name holds process.arch.
    await windows(['Drafter-1.0.0-windows-setup.exe']);
    expect(checkFeed(dir, 'latest.yml').join('\n')).toMatch(/must hold exactly one of x64, arm64/);
    await windows([X64, 'Drafter-1.0.0-windows-x64-setup-2.exe']);
    expect(checkFeed(dir, 'latest.yml').join('\n')).toMatch(/is for x64 too/);
  });

  test('wants the version in each installer’s name', async () => {
    await windows([X64, ARM], { version: '1.0.1' });
    expect(checkFeed(dir, 'latest.yml').join('\n')).toMatch(
      /must hold the feed's version \(1\.0\.1\)/,
    );
  });

  test('finds a feed with no installer', async () => {
    await writeFile(join(dir, 'latest.yml'), 'version: 1.0.0\nfiles: []\n');
    const problems = checkFeed(dir, 'latest.yml').join('\n');
    expect(problems).toMatch(/names no installer/);
    expect(problems).toMatch(/no `path`/);
  });

  test('both feeds of a release must give the same version', async () => {
    await release();
    await windows();
    expect(checkFeeds(dir, ['latest-linux.yml', 'latest.yml'])).toEqual([]);
    await windows([X64.replace('1.0.0', '1.0.1'), ARM.replace('1.0.0', '1.0.1')], {
      version: '1.0.1',
    });
    expect(checkFeeds(dir, ['latest-linux.yml', 'latest.yml']).join('\n')).toMatch(
      /different versions: latest-linux\.yml 1\.0\.0, latest\.yml 1\.0\.1/,
    );
  });

  test('refuses a feed it doesn’t know', async () => {
    await writeFile(join(dir, 'latest-mac.yml'), 'version: 1.0.0\n');
    expect(checkFeed(dir, 'latest-mac.yml').join('\n')).toMatch(/not a feed this release has/);
  });
});

describe('the packages’ names (electron-builder.config.cjs)', () => {
  const config = createRequire(import.meta.url)('../electron-builder.config.cjs');
  /** electron-builder's macros, as it expands them for an x64 Linux build. */
  const expand = (pattern: string, arch: string, ext: string) => {
    const values: Record<string, string> = { productName: 'Drafter', version: '1.2.3', arch, ext };
    return pattern.replace(/\$\{(\w+)\}/g, (_all, name: string) => values[name] ?? `?${name}`);
  };
  /** Whether the pattern uses electron-builder's `version` macro. */
  const versioned = (pattern: string) => /\$\{version\}/.test(pattern);

  test('the AppImage has one name for every version, so an update replaces it in place', () => {
    const pattern = config.appImage?.artifactName ?? config.artifactName;
    expect(versioned(pattern)).toBe(false);
    expect(expand(pattern, 'x86_64', 'AppImage')).toBe('Drafter-x86_64.AppImage');
  });

  test('the .deb keeps its version in its name', () => {
    const pattern = config.deb?.artifactName ?? config.artifactName;
    expect(expand(pattern, 'amd64', 'deb')).toBe('Drafter-1.2.3-linux-amd64.deb');
  });

  test('the Windows installers keep their version, and name their processor', () => {
    const pattern = config.nsis?.artifactName ?? config.win?.artifactName ?? config.artifactName;
    expect(expand(pattern, 'x64', 'exe')).toBe('Drafter-1.2.3-windows-x64-setup.exe');
    expect(expand(pattern, 'arm64', 'exe')).toBe('Drafter-1.2.3-windows-arm64-setup.exe');
    // One installer per processor, not one holding both.
    expect(config.nsis?.buildUniversalInstaller).toBe(false);
    expect(config.win?.target).toEqual([{ target: 'nsis', arch: ['x64', 'arm64'] }]);
  });

  test('a per-user, one-click install that asks for no administrator', () => {
    expect(config.nsis).toMatchObject({ oneClick: true, perMachine: false });
    expect(config.nsis?.deleteAppDataOnUninstall).toBe(false);
  });

  test('each system names its own file types (electron-builder adds a platform’s to the top level’s)', () => {
    expect(config.fileAssociations).toBeUndefined();
    const exts = (list: { ext: string }[]) => list.map((type) => type.ext);
    const all = ['fountain', 'md', 'markdown', 'fdx', 'highland', 'fadein'];
    expect(exts(config.linux.fileAssociations)).toEqual(all);
    expect(exts(config.mac.fileAssociations)).toEqual(all);
    // A Final Draft, Highland, or Fade In file is only offered (an import), never Drafter's by
    // default, and each has a MIME type of its own for the .deb.
    const imports: Record<string, string> = {
      fdx: 'application/x-fdx',
      highland: 'application/x-highland',
      fadein: 'application/x-fadein',
    };
    for (const [ext, mimeType] of Object.entries(imports)) {
      for (const list of [config.mac.fileAssociations, config.linux.fileAssociations]) {
        const type = list.find((t: { ext: string }) => t.ext === ext);
        expect(type, ext).toMatchObject({ rank: 'Alternate', role: 'Viewer', mimeType });
      }
    }
    // Markdown and the imports are only offered on Windows (installer/windows.nsh), never taken.
    expect(config.win.fileAssociations).toEqual([
      { ext: 'fountain', name: 'Drafter.fountain', description: 'Fountain screenplay' },
    ]);
  });

  test('the Windows installer offers each import in Open with, and takes it out again', async () => {
    const nsh = await readFile(join(__dirname, '..', 'installer', 'windows.nsh'), 'utf8');
    const [install = '', uninstall = ''] = nsh.split('!macro customUnInstall');
    for (const ext of ['fdx', 'highland', 'fadein']) {
      const progId = `Drafter.${ext}`;
      expect(install, ext).toContain(
        `WriteRegNone SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "${progId}"`,
      );
      expect(install, ext).toContain(
        `WriteRegStr SHELL_CONTEXT "Software\\Classes\\${progId}\\shell\\open\\command" "" '"$appExe" "%1"'`,
      );
      expect(uninstall, ext).toContain(
        `DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "${progId}"`,
      );
      expect(uninstall, ext).toContain(`DeleteRegKey SHELL_CONTEXT "Software\\Classes\\${progId}"`);
      // Offered, never taken: the extension's own default is left alone.
      expect(nsh, ext).not.toContain(`Software\\Classes\\.${ext}" ""`);
    }
  });

  test('the packed name makes plain folder names (not @drafterdesktop)', () => {
    expect(config.extraMetadata?.name).toBe('drafter');
  });
});
