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
});
