// A temporary folder for a test, with its real path (macOS's /var is a link to /private/var).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A new, empty folder, removed after the test. */
export function tempFolder(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'drafter-mcp-')));
  made.push(dir);
  return dir;
}

/** Writes `text` at `path`, making its folders. */
export function put(path: string, text = 'INT. RADIO ROOM - NIGHT\n'): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}
