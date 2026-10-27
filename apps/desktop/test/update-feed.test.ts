import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { checkFeed } from '../scripts/check-update-feed.mjs';

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
});
