// What npm gets: a package staged from the bundle (scripts/stage.mjs), never the workspace's own
// manifest, whose dependencies the bundle already carries.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import workspace from '../package.json' with { type: 'json' };
import { tempFolder } from './temp';

const PACKAGE = join(import.meta.dirname, '..');
const BUNDLE = join(PACKAGE, 'dist', 'drafter-mcp.js');

beforeAll(() => {
  if (!existsSync(BUNDLE))
    throw new Error('No dist/drafter-mcp.js: run pnpm --filter drafter-mcp build');
});

/** A fresh stage, in a folder removed after the test. */
function staged(): string {
  const stage = join(tempFolder(), 'stage');
  execFileSync(process.execPath, [join(PACKAGE, 'scripts', 'stage.mjs'), stage]);
  return stage;
}

const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

describe('the staged npm package', () => {
  it('the staged package has no dependencies, scripts, or exports', () => {
    const pkg = manifest(staged());
    expect(Object.keys(pkg).sort()).toEqual(
      [
        'name',
        'version',
        'description',
        'license',
        'type',
        'bin',
        'files',
        'engines',
        'repository',
        'homepage',
        'keywords',
      ].sort(),
    );
    expect(pkg).toMatchObject({
      license: 'MIT',
      type: 'module',
      bin: { 'drafter-mcp': 'drafter-mcp.js' },
      files: ['drafter-mcp.js'],
      engines: { node: '>=22.12' },
      homepage: 'https://drafter.dev/docs/drafter-for-claude/',
      keywords: ['mcp', 'fountain', 'screenwriting', 'claude'],
    });
    expect(pkg.description).toBe(workspace.description);
  });

  it('it holds exactly package.json, README.md, LICENSE, and drafter-mcp.js', () => {
    const dir = staged();
    const run = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', dir], {
      cwd: tempFolder(),
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    // Nothing npm would "correct" in the manifest on publish.
    expect(run.stderr).not.toMatch(/corrected|warn/i);
    const [pack] = JSON.parse(run.stdout) as Array<{ files: Array<{ path: string }> }>;
    expect(pack?.files.map((file) => file.path).sort()).toEqual(
      ['LICENSE', 'README.md', 'drafter-mcp.js', 'package.json'].sort(),
    );
    expect(readFileSync(join(dir, 'drafter-mcp.js'))).toEqual(readFileSync(BUNDLE));
    expect(readFileSync(join(dir, 'README.md'))).toEqual(readFileSync(join(PACKAGE, 'README.md')));
    expect(readFileSync(join(dir, 'LICENSE'))).toEqual(
      readFileSync(join(PACKAGE, '..', '..', 'LICENSE')),
    );
  });

  it('its name is drafter-mcp and its version the workspace’s', () => {
    const pkg = manifest(staged());
    expect(pkg.name).toBe('drafter-mcp');
    expect(pkg.version).toBe(workspace.version);
  });

  it('its repository points at this repository’s packages/mcp', () => {
    expect(manifest(staged()).repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/cschweda/drafter.git',
      directory: 'packages/mcp',
    });
  });

  it('the bin is executable', () => {
    const mode = statSync(join(staged(), 'drafter-mcp.js')).mode;
    if (process.platform !== 'win32') expect(mode & 0o777).toBe(0o755);
  });

  it('it stages into an empty folder only, and writes nothing else', () => {
    const dir = staged();
    expect(() =>
      execFileSync(process.execPath, [join(PACKAGE, 'scripts', 'stage.mjs'), dir], {
        stdio: 'pipe',
      }),
    ).toThrow();
    expect(() =>
      execFileSync(process.execPath, [join(PACKAGE, 'scripts', 'stage.mjs')], { stdio: 'pipe' }),
    ).toThrow();
  });
});
