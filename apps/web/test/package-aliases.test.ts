import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The build reads the workspace packages from their sources through one alias in nuxt.config.ts.
// A package the app depends on but the alias leaves out resolves to its `dist`, which a fresh
// checkout hasn't built: the build passes on a machine that has built it, and fails in CI.
const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe("the build's alias for the workspace packages", () => {
  it('names every @drafter package the app depends on', () => {
    const alias = /\^@drafter\\\/\(([a-z|-]+)\)/.exec(config)?.[1]?.split('|') ?? [];
    expect(alias.length).toBeGreaterThan(0);
    const used = Object.keys(manifest.dependencies)
      .filter((name) => name.startsWith('@drafter/'))
      .map((name) => name.slice('@drafter/'.length));
    expect(used.filter((name) => !alias.includes(name))).toEqual([]);
  });
});
