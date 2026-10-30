// Real files from the other apps, when the maintainer supplies them (DEFERRED, Call 12): never
// committed (`.gitignore` holds `*.highland` and `*.fadein`), read from a local folder named by
// DRAFTER_REAL_FILES. Skipped until then:
//   DRAFTER_REAL_FILES=<folder> pnpm --filter @drafter/archive test real-files
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';
import { fromHighland } from '../src/highland';

const folder = process.env.DRAFTER_REAL_FILES;

describe('real files', () => {
  it.skipIf(!folder)("imports the maintainer's Highland file", async () => {
    const bytes = new Uint8Array(readFileSync(join(folder ?? '', 'real.highland')));
    const { text } = await fromHighland(bytes);
    expect(text.trim()).not.toBe('');
    expect(parse(text).blocks.some((b) => b.kind === 'scene_heading')).toBe(true);
  });
});
