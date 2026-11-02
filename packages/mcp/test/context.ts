// A reader's context for tests that call load() and friends directly, as the worker makes one.
import { randomBytes } from 'node:crypto';
import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import { resolveRoots } from '../src/roots';
import type { ToolContext } from '../src/tools/index';
import { makeContext } from '../src/worker';

export async function contextFor(folders: string[]): Promise<ToolContext> {
  const roots = await resolveRoots(folders, process.platform);
  return makeContext({
    roots,
    options: { folders, notes: false, boneyard: false, wordsPerMinute: DEFAULT_WORDS_PER_MINUTE },
    key: new Uint8Array(randomBytes(32)),
    platform: process.platform,
  });
}
