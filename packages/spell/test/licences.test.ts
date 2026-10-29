// The guard on the spellchecker's third-party packages (Plan D, Call 1; Phase 2 design §21): each
// is installed at the exact version docs/DEPENDENCIES.md records, declares a permissive licence,
// and no dictionary under the GPL or LGPL is ever bundled. A changed version or licence fails here
// before it can ship.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { DICTIONARIES, SPELL_LANGUAGES } from '../src/dictionaries';

const here = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The folder of the package `name` resolves to from `fromDir` (its `exports` may hide the files). */
function packageDir(name: string, fromDir: string): string {
  let dir = dirname(createRequire(join(fromDir, 'package.json')).resolve(name));
  for (;;) {
    try {
      const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string };
      if (json.name === name) return dir;
    } catch {
      // No package.json here: keep going up.
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No folder for ${name} above ${fromDir}.`);
    dir = parent;
  }
}

interface Installed {
  name: string;
  version: string;
  license: string;
  dir: string;
}

function installed(name: string, fromDir = here): Installed {
  const dir = packageDir(name, fromDir);
  const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Installed;
  return { name, version: json.version, license: json.license, dir };
}

const nspell = () => installed('nspell');
// Brought by nspell, so it resolves from nspell's folder.
const isBuffer = () => installed('is-buffer', nspell().dir);
// Types only: `@types/nspell` has no entry to resolve, so its folder is found by its package.json.
const types = (): Installed => {
  const file = createRequire(join(here, 'package.json')).resolve('@types/nspell/package.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as Installed;
  return {
    name: '@types/nspell',
    version: json.version,
    license: json.license,
    dir: dirname(file),
  };
};
const dictionaries = () => SPELL_LANGUAGES.map((language) => DICTIONARIES[language]);

/** The versions recorded in docs/DEPENDENCIES.md, pinned exactly. */
const PINNED = { nspell: '2.1.5', 'is-buffer': '2.0.5', '@types/nspell': '2.1.6' };
const PERMISSIVE = ['MIT', '(MIT AND BSD)'];

describe('the spellchecker’s dependencies', () => {
  test('the installed versions are the recorded ones', () => {
    expect(SPELL_LANGUAGES).toEqual(['en-US', 'en-GB']);
    expect(DICTIONARIES['en-US']).toMatchObject({ package: 'dictionary-en', version: '4.0.0' });
    expect(DICTIONARIES['en-GB']).toMatchObject({ package: 'dictionary-en-gb', version: '3.0.0' });
    // package.json pins each exactly (no range), and names nothing else.
    expect(manifest.dependencies).toEqual({
      '@drafter/fountain': 'workspace:*',
      nspell: PINNED.nspell,
      ...Object.fromEntries(dictionaries().map((d) => [d.package, d.version])),
    });
    expect(manifest.devDependencies).toEqual({ '@types/nspell': PINNED['@types/nspell'] });
    expect(nspell().version).toBe(PINNED.nspell);
    expect(isBuffer().version).toBe(PINNED['is-buffer']);
    expect(types().version).toBe(PINNED['@types/nspell']);
    for (const dictionary of dictionaries()) {
      expect(installed(dictionary.package).version, dictionary.package).toBe(dictionary.version);
    }
  });

  test('every dependency declares a permissive licence', () => {
    for (const pkg of [nspell(), isBuffer(), types()]) {
      expect(pkg.license, pkg.name).toBe('MIT');
    }
    for (const dictionary of dictionaries()) {
      const pkg = installed(dictionary.package);
      expect(PERMISSIVE, pkg.name).toContain(pkg.license);
      expect(dictionary.licence, pkg.name).toBe(pkg.license);
    }
  });

  test('no dictionary licence file mentions the GPL or LGPL', () => {
    for (const dictionary of dictionaries()) {
      const text = readFileSync(join(installed(dictionary.package).dir, 'license'), 'utf8');
      // The SCOWL notice, with Ispell's BSD licence and the UKACD notice it must carry verbatim.
      expect(text, dictionary.package).toMatch(/Hunspell Dictionary/);
      expect(text, dictionary.package).toMatch(/Copyright \(c\) J Ross Beresford 1993-1999/);
      expect(text, dictionary.package).not.toMatch(/\b(?:L?GPL|copyleft)\b/i);
      expect(text, dictionary.package).not.toMatch(/general\s+public\s+licen[cs]e/i);
    }
  });
});
