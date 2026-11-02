// The program: read the command line, resolve the folders, start the reader, and serve over
// standard input and output. Standard error gets one line at start and one per refusal; nothing
// else is written anywhere.
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import pkg from '../package.json' with { type: 'json' };
import { parseOptions, USAGE } from './options';
import { ReaderPool, type WorkerSpec } from './pool';
import { resolveRoots, StartError } from './roots';
import { createServer } from './server';

export const VERSION: string = pkg.version;

export interface MainIo {
  /** A line on standard error. */
  err(line: string): void;
  /** A line on standard output, only for --version and --help (console.log when left out). */
  out?(line: string): void;
}

/** Runs the program; resolves with its exit code once it is serving (or has said why it can't). */
export async function main(
  argv: readonly string[],
  io: MainIo,
  worker: WorkerSpec,
): Promise<number> {
  const out = io.out ?? ((line: string) => console.log(line));
  const platform = process.platform;
  const parsed = parseOptions(argv, { home: homedir(), platform });
  if ('version' in parsed) {
    out(VERSION);
    return 0;
  }
  if ('help' in parsed) {
    out(USAGE.trimEnd());
    return 0;
  }
  if ('error' in parsed) {
    io.err(`drafter-mcp: ${parsed.error}`);
    return 1;
  }
  let roots: Awaited<ReturnType<typeof resolveRoots>>;
  try {
    roots = await resolveRoots(parsed.folders, platform);
  } catch (error) {
    if (error instanceof StartError) {
      io.err(`drafter-mcp: ${error.message}`);
      return 1;
    }
    throw error;
  }
  const pool = new ReaderPool(worker, {
    roots,
    options: parsed,
    key: new Uint8Array(randomBytes(32)),
    platform,
  });
  const count = `${roots.length} ${roots.length === 1 ? 'folder' : 'folders'}`;
  io.err(`drafter-mcp ${VERSION}: reading ${count}: ${roots.map((root) => root.name).join(', ')}`);
  serveStdio(() =>
    createServer({ roots, options: parsed, pool, version: VERSION, log: (line) => io.err(line) }),
  );
  return 0;
}
