import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildCommit, drafterVersion } from '../scripts/version.mjs';

// About Drafter's version is defined at build time (nuxt.config.ts `__DRAFTER_VERSION__`) from
// the repository's version, which the desktop app reports as Electron's app version. They agree.

const root = new URL('../../../', import.meta.url);
const versionOf = (path: string) =>
  (JSON.parse(readFileSync(new URL(path, root), 'utf8')) as { version?: string }).version;

describe('the version the web build defines', () => {
  test('is the desktop app’s version, which Electron reports', () => {
    expect(drafterVersion()).toBe(versionOf('apps/desktop/package.json'));
    expect(drafterVersion()).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  test('is every package’s version', () => {
    const names = readdirSync(new URL('packages/', root));
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      expect(versionOf(`packages/${name}/package.json`), name).toBe(drafterVersion());
    }
  });

  test('the build’s commit is a short hash and a date, or nothing', () => {
    const commit = buildCommit();
    if (commit === null) return;
    expect(commit.commit).toMatch(/^[0-9a-f]{7,12}$/);
    expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
