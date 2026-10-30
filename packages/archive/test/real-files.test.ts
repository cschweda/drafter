// Real files from the other apps, when the maintainer supplies them (DEFERRED, Call 12): never
// committed (`.gitignore` holds `*.highland` and `*.fadein`), read from a local folder named by
// DRAFTER_REAL_FILES. Skipped until then:
//   DRAFTER_REAL_FILES=<folder> pnpm --filter @drafter/archive test real-files
// Each test skips on its own when its file isn't in the folder.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';
import { fromHighland } from '../src/highland';

const folder = process.env.DRAFTER_REAL_FILES;

/** The path of a real file, or null when the folder is unset or the file isn't in it. */
function realFile(name: string): string | null {
  if (!folder) return null;
  const path = join(folder, name);
  return existsSync(path) ? path : null;
}

const highlandFile = realFile('real.highland');

describe('real files', () => {
  it.skipIf(!highlandFile)("imports the maintainer's Highland file", async () => {
    const bytes = new Uint8Array(readFileSync(highlandFile ?? ''));
    const { text } = await fromHighland(bytes);
    expect(text.trim()).not.toBe('');
    expect(parse(text).blocks.some((b) => b.kind === 'scene_heading')).toBe(true);
  });
});
