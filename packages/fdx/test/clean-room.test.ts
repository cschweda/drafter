import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the clean-room audits asked for (docs/clean-room-audit-2026-11-22.md): each fails on a
// thing an audit found by hand more than once. They read the repository's tracked files, so they
// live with the package whose fixtures they mostly watch.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const tracked = (...paths: string[]) =>
  execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

describe('clean room: test text is original', () => {
  it('has no film reference in any source, test, fixture, or sample', () => {
    // Three audits found a film's character and catchphrase in a test. Spelled in pieces here, so
    // this file is not a hit of its own.
    const words = [
      ['Mc', 'CLANE'],
      ['Yip', 'pee'],
      ['ki-', 'yay'],
    ].map((p) => p.join(''));
    const pattern = new RegExp(words.join('|'), 'i');
    const hits = tracked('packages', 'apps', 'modules', 'fixtures', 'samples')
      .filter((path) => /\.(?:ts|vue|mjs|js|fountain|md|fdx|txt|json|html|snap)$/.test(path))
      .filter((path) => pattern.test(read(path)));
    expect(hits).toEqual([]);
  });
});

describe('clean room: no real Final Draft file is committed', () => {
  // A real script is hundreds of kilobytes; Drafter's own are hand-made and small.
  const MAX_BYTES = 20_000;
  const HOMES = [
    'fixtures/trap/files/',
    'packages/fdx/test/fixtures/',
    'apps/web/test/fixtures/',
    'samples/fdx/',
  ];
  const files = tracked('*.fdx');

  it('finds the fixtures it guards', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s is small and in a fixture folder', (path) => {
    expect(HOMES.some((home) => path.startsWith(home))).toBe(true);
    expect(statSync(`${ROOT}/${path}`).size).toBeLessThan(MAX_BYTES);
  });

  it('keeps samples/fdx closed to everything but the synthetic samples', () => {
    expect(tracked('samples/fdx').sort()).toEqual([
      'samples/fdx/README.md',
      'samples/fdx/short-film.fdx',
      'samples/fdx/stage-play.fdx',
    ]);
    const ignore = read('.gitignore');
    expect(ignore).toContain('samples/fdx/*\n');
  });
});

describe('clean room: DEPENDENCIES.md lists what the packages use', () => {
  const doc = read('docs/DEPENDENCIES.md');
  const rows = new Map<string, string>();
  for (const line of doc.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const name = /^`([^`]+)`$/.exec(cells[1] ?? '')?.[1];
    if (name && cells.length > 3 && !rows.has(name)) rows.set(name, cells[2] ?? '');
  }
  const manifests = tracked('packages/*/package.json').map((path) => ({
    path,
    json: JSON.parse(read(path)) as { name: string; dependencies?: Record<string, string> },
  }));

  it('finds the packages it checks', () => {
    expect(manifests.length).toBeGreaterThan(20);
  });

  it.each(manifests.map((m) => [m.json.name, m] as const))(
    '%s has a row naming each dependency',
    (name, m) => {
      const row = rows.get(name);
      expect(row, `no row for ${name} in docs/DEPENDENCIES.md`).toBeDefined();
      const missing = Object.keys(m.json.dependencies ?? {}).filter(
        (dependency) => !row?.includes(`\`${dependency}\``),
      );
      expect(missing, `${name}'s row leaves these out`).toEqual([]);
    },
  );
});
