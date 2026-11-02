import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

// Whole words (and their Sync and f… forms), so `truncated` or `renamed` in prose don't count.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['writeFile', /\bwrite(File|v)?(Sync)?\b/],
  ['appendFile', /\bappendFile(Sync)?\b/],
  ['mkdir', /\bmkd(ir|temp)(Sync)?\b/],
  ['rm(', /\brm(Sync)?\(/],
  ['rmdir', /\brmdir(Sync)?\b/],
  ['unlink', /\bunlink(Sync)?\b/],
  ['rename', /\brename(Sync)?\b/],
  ['copyFile', /\bcopyFile(Sync)?\b|\bcp(Sync)?\(/],
  ['symlink', /\bsymlink(Sync)?\b/],
  ['link(', /\blink(Sync)?\(/],
  ['chmod', /\b[lf]?ch(mod|own)(Sync)?\b/],
  ['utimes', /\b[fl]?utimes(Sync)?\b/],
  ['truncate', /\bf?truncate(Sync)?\b/],
  ['createWriteStream', /\bcreateWriteStream\b/],
  ['child_process', /child_process/],
  ['node:net', /['"](node:)?net['"]/],
  ['node:http', /['"](node:)?http2?['"]/],
  ['node:https', /['"](node:)?https['"]/],
  ['node:dgram', /['"](node:)?dgram['"]/],
  ['node:tls', /['"](node:)?tls['"]/],
  ['node:dns', /['"](node:)?dns['"]/],
  ['fetch(', /\bfetch\(/],
  ['WebSocket', /\bWebSocket\b/],
  ["'w' or 'a' open flags", /['"](w|wx|w\+|wx\+|a|ax|a\+|ax\+|r\+|rs\+)['"]/],
  ['write open flags', /\bO_(WRONLY|RDWR|CREAT|TRUNC|APPEND)\b/],
];

const caught = (text: string) =>
  FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(([what]) => what);

describe('read-only', () => {
  it('the scan finds the source files', () => {
    expect(sources(SRC).length).toBeGreaterThanOrEqual(6);
  });

  it("the package's source never writes, spawns, or connects", () => {
    const found = sources(SRC).flatMap((file) =>
      caught(readFileSync(file, 'utf8')).map((what) => `${file}: ${what}`),
    );
    expect(found).toEqual([]);
  });

  it('the scan would catch a write', () => {
    expect(caught("import { writeFile } from 'node:fs/promises'; await open(p, 'w');")).toEqual([
      'writeFile',
      "'w' or 'a' open flags",
    ]);
    expect(caught('await handle.truncate(0); fs.renameSync(a, b);')).toEqual([
      'rename',
      'truncate',
    ]);
    expect(caught("import { request } from 'node:https';")).toEqual(['node:https']);
    expect(caught("spawn from 'node:child_process'; fetch(url)")).toEqual([
      'child_process',
      'fetch(',
    ]);
    // Words in prose and names are not calls.
    expect(caught('let truncated = false; // renamed, unlinked, rewritten, the writer')).toEqual(
      [],
    );
  });
});
