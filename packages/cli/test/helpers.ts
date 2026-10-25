import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@drafter/cli';
import { afterEach, beforeEach } from 'vitest';

/** The repository root, where `pnpm drafter` runs. */
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const repo = (path: string) => join(root, path);

export interface Result {
  code: number;
  /** Standard output as text, and as bytes for anything binary written there. */
  out: string;
  bytes: Uint8Array;
  err: string;
}

/** Runs the CLI in this process, capturing what it prints. */
export async function drafter(...args: string[]): Promise<Result> {
  const out: Array<string | Uint8Array> = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (data) => out.push(data),
    err: (text) => err.push(text),
    cwd: root,
  });
  const encoder = new TextEncoder();
  const chunks = out.map((data) => (typeof data === 'string' ? encoder.encode(data) : data));
  const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return { code, out: new TextDecoder().decode(bytes), bytes, err: err.join('') };
}

/** A fresh temporary folder for each test, removed afterwards. */
export function tempDir(): () => string {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'drafter-cli-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  return () => dir;
}
