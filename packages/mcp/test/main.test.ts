import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { main } from '../src/main';
import { NO_FOLDER, USAGE } from '../src/options';
import { tempFolder } from './temp';

function io() {
  const err: string[] = [];
  const out: string[] = [];
  return {
    err,
    out,
    io: { err: (line: string) => err.push(line), out: (line: string) => out.push(line) },
  };
}

describe('the program', () => {
  it('--version prints the version and nothing else', async () => {
    const run = io();
    expect(await main(['--version'], run.io, 'inline')).toBe(0);
    expect(run.out).toEqual([pkg.version]);
    expect(run.err).toEqual([]);
  });

  it('--help prints the usage', async () => {
    const run = io();
    expect(await main(['--help'], run.io, 'inline')).toBe(0);
    expect(run.out).toEqual([USAGE.trimEnd()]);
  });

  it('a mistake on the command line is said on standard error, and it stops', async () => {
    const run = io();
    expect(await main([], run.io, 'inline')).toBe(1);
    expect(run.err).toEqual([`drafter-mcp: ${NO_FOLDER}`]);
    expect(run.out).toEqual([]);
  });

  it('a folder that isn’t there stops it before it serves', async () => {
    const run = io();
    const missing = join(tempFolder(), 'Nowhere');
    expect(await main(['--folder', missing], run.io, 'inline')).toBe(1);
    expect(run.err).toEqual([`drafter-mcp: ${missing} isn’t a folder.`]);
  });
});
