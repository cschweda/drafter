import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { pnpmCommand, replaceFolder } from '../scripts/build-web.mjs';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A parent folder holding `web/` (the old build) and `built/` (the new one). */
function setUp() {
  const parent = mkdtempSync(join(tmpdir(), 'drafter-build-web-'));
  made.push(parent);
  const web = join(parent, 'web');
  const built = join(parent, 'built');
  for (const [dir, label] of [
    [web, 'old'],
    [built, 'new'],
  ] as const) {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), `${label} index`);
    writeFileSync(join(dir, '_headers'), `${label} headers`);
    writeFileSync(join(dir, 'docs', 'index.html'), `${label} docs`);
  }
  return { parent, web, built };
}

/** The old build, whole: what an app started at this moment must find. */
function expectWhole(web: string, label: string) {
  expect(readFileSync(join(web, 'index.html'), 'utf8')).toBe(`${label} index`);
  expect(readFileSync(join(web, '_headers'), 'utf8')).toBe(`${label} headers`);
  expect(readFileSync(join(web, 'docs', 'index.html'), 'utf8')).toBe(`${label} docs`);
}

describe('replaceFolder (pnpm build:web)', () => {
  test('swaps in the new build, and leaves no temporary folders behind', () => {
    const { parent, web, built } = setUp();
    replaceFolder(built, web);
    expectWhole(web, 'new');
    expect(readdirSync(parent).sort()).toEqual(['built', 'web']);
  });

  test('leaves the old build whole while the new one is being copied', () => {
    const { web, built } = setUp();
    let checked = false;
    replaceFolder(built, web, (from, to) => {
      // Halfway through the copy: one file in, the rest not yet.
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, 'index.html'), readFileSync(join(from, 'index.html')));
      expectWhole(web, 'old');
      cpSync(from, to, { recursive: true });
      expectWhole(web, 'old');
      checked = true;
    });
    expect(checked).toBe(true);
    expectWhole(web, 'new');
  });

  test('keeps the old build when the copy fails', () => {
    const { parent, web, built } = setUp();
    expect(() =>
      replaceFolder(built, web, (_from, to) => {
        mkdirSync(to, { recursive: true });
        writeFileSync(join(to, 'index.html'), 'partial');
        throw new Error('disk full');
      }),
    ).toThrow('disk full');
    expectWhole(web, 'old');
    expect(readdirSync(parent).sort()).toEqual(['built', 'web']);
  });

  test('works when there is no build yet, and clears leftovers of a stopped run', () => {
    const { parent, web, built } = setUp();
    rmSync(web, { recursive: true });
    mkdirSync(join(parent, 'web.next-123'));
    mkdirSync(join(parent, 'web.old-456'));
    replaceFolder(built, web);
    expectWhole(web, 'new');
    expect(existsSync(join(parent, 'web.next-123'))).toBe(false);
    expect(existsSync(join(parent, 'web.old-456'))).toBe(false);
  });
});

describe('pnpmCommand (how build:web runs pnpm)', () => {
  test('runs the pnpm that is running it, with this Node, on every system', () => {
    const env = { npm_execpath: 'C:\\pnpm\\bin\\pnpm.cjs' };
    expect(pnpmCommand(['build'], env, 'win32', 'C:\\node.exe')).toEqual({
      file: 'C:\\node.exe',
      args: ['C:\\pnpm\\bin\\pnpm.cjs', 'build'],
      shell: false,
    });
  });

  test('otherwise pnpm from the PATH, through a shell only on Windows (pnpm.cmd)', () => {
    expect(pnpmCommand(['build'], {}, 'linux')).toEqual({
      file: 'pnpm',
      args: ['build'],
      shell: false,
    });
    expect(pnpmCommand(['build'], {}, 'win32')).toEqual({
      file: 'pnpm',
      args: ['build'],
      shell: true,
    });
    // npm's own entry is not pnpm.
    expect(pnpmCommand(['build'], { npm_execpath: '/usr/lib/npm-cli.js' }, 'linux').file).toBe(
      'pnpm',
    );
  });
});
