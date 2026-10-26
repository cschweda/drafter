import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkBuild, FIXTURE_MARKERS, iconNamesIn } from '../scripts/check-build.mjs';

async function site(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'drafter-build-'));
  await mkdir(join(dir, '_nuxt'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, '_nuxt', name), text);
  return dir;
}

describe('checking a build', () => {
  test('finds the fixture in a bundle that has it, and none in one that has not', async () => {
    const clean = await site({ 'a.js': 'console.log("Drafter")' });
    const leaky = await site({ 'a.js': 'x', 'b.js': `const label = "${FIXTURE_MARKERS[0]}"` });
    expect((await checkBuild(clean, { fixture: false, icons: [] })).problems).toEqual([]);
    expect((await checkBuild(leaky, { fixture: false, icons: [] })).problems.join('\n')).toMatch(
      /fixture.*b\.js/s,
    );
    // A test build must have it, or the browser tests would be testing nothing.
    expect((await checkBuild(clean, { fixture: true, icons: [] })).problems.join('\n')).toMatch(
      /fixture/,
    );
    expect((await checkBuild(leaky, { fixture: true, icons: [] })).problems).toEqual([]);
  });

  test('reads the icon names a source file uses', () => {
    expect(
      iconNamesIn('newIcon: \'i-lucide-file-plus\', other: "i-lucide-drama"; not i-mdi-home'),
    ).toEqual(['file-plus', 'drama']);
  });

  test('finds an icon the bundle lacks', async () => {
    const bundle = await site({
      'a.js': 'JSON.parse("{\\"file-plus\\":{\\"width\\":24,\\"body\\":\\"<path/>\\"}}")',
    });
    expect((await checkBuild(bundle, { fixture: false, icons: ['file-plus'] })).problems).toEqual(
      [],
    );
    expect(
      (await checkBuild(bundle, { fixture: false, icons: ['file-plus', 'drama'] })).problems.join(
        '\n',
      ),
    ).toMatch(/drama/);
  });

  test('finds a Heroicons name the tour draws that the bundle lacks, and ignores one in another set', async () => {
    const hero = await site({
      'a.js':
        'JSON.parse("{\\"prefix\\":\\"heroicons\\",\\"icons\\":{\\"play\\":{\\"width\\":24,\\"body\\":\\"<path/>\\"}}}")',
    });
    expect(
      (await checkBuild(hero, { fixture: false, icons: [], heroicons: ['play'] })).problems,
    ).toEqual([]);
    expect(
      (
        await checkBuild(hero, { fixture: false, icons: [], heroicons: ['play', 'check'] })
      ).problems.join('\n'),
    ).toMatch(/Heroicons .check/);
    // The same name in the Lucide set doesn't count.
    const lucide = await site({
      'a.js':
        'JSON.parse("{\\"prefix\\":\\"lucide\\",\\"icons\\":{\\"play\\":{\\"width\\":24,\\"body\\":\\"<path/>\\"}}}")',
    });
    expect(
      (await checkBuild(lucide, { fixture: false, icons: [], heroicons: ['play'] })).problems.join(
        '\n',
      ),
    ).toMatch(/Heroicons .play/);
  });
});

describe('checking the service worker’s precache', () => {
  const SW = (urls: string[], extra = '') =>
    `define(["./workbox-1"],function(e){e.precacheAndRoute([${urls
      .map((url) => `{url:"${url}",revision:null}`)
      .join(',')}]);${extra}});`;

  async function worker(files: Record<string, string>, urls: string[], extra = '') {
    const dir = await mkdtemp(join(tmpdir(), 'drafter-sw-'));
    await mkdir(join(dir, '_nuxt'));
    await mkdir(join(dir, 'fonts'));
    for (const [name, text] of Object.entries({
      ...files,
      'sw.js': SW(urls, extra),
      'workbox-1.js': 'x',
    })) {
      await writeFile(join(dir, name), text);
    }
    return dir;
  }
  const check = async (dir: string) =>
    (await checkBuild(dir, { fixture: false, icons: [], precache: true })).problems.join('\n');

  const FILES = {
    '_nuxt/a.js': 'x',
    '_nuxt/layout.worker-1.js': 'x',
    '_nuxt/b.css': 'x',
    'fonts/Courier.ttf': 'x',
    'icon-192.png': 'x',
    'og-image.png': 'x',
    '404.html': 'x',
    'index.html': 'x',
  };
  const ALL = [
    '/',
    '_nuxt/a.js',
    '_nuxt/layout.worker-1.js',
    '_nuxt/b.css',
    'fonts/Courier.ttf',
    'icon-192.png',
  ];

  test('passes when every script, style, worker, font, and icon is cached, and the social image is not', async () => {
    expect(await check(await worker(FILES, ALL))).toBe('');
  });

  test('finds a worker chunk, a font, or the shell that the cache lacks', async () => {
    const lacking = await check(await worker(FILES, ['_nuxt/a.js', '_nuxt/b.css', 'icon-192.png']));
    expect(lacking).toMatch(/layout\.worker-1\.js/);
    expect(lacking).toMatch(/Courier\.ttf/);
    expect(lacking).toMatch(/shell/);
  });

  test('finds a file cached that the app does not need', async () => {
    expect(await check(await worker(FILES, [...ALL, 'og-image.png']))).toMatch(/og-image\.png/);
  });

  test('finds runtime caching, and a missing worker', async () => {
    expect(await check(await worker(FILES, ALL, 'e.registerRoute(/x/,new e.CacheFirst);'))).toMatch(
      /runtime caching/,
    );
    const none = await site({ 'a.js': 'x' });
    expect(await check(none)).toMatch(/sw\.js/);
  });
});
