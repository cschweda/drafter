import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SpellLanguage } from '@drafter/spell';
import { describe, expect, test, vi } from 'vitest';
import {
  createSpellWorker,
  fetchDictionary,
  type SpellReply,
  type SpellRequest,
} from '../app/workers/spell-compute';

// The real dictionaries, read in Node from the packages `@drafter/spell` depends on (their
// `exports` hides the files, so each package's folder is found from its `index.js`).
const spell = fileURLToPath(new URL('../../../packages/spell/package.json', import.meta.url));
const folderOf = (name: string) => dirname(createRequire(spell).resolve(name));
const FILES: Record<SpellLanguage, { aff: Uint8Array; dic: Uint8Array }> = Object.fromEntries(
  (
    [
      ['en-US', 'dictionary-en'],
      ['en-GB', 'dictionary-en-gb'],
    ] as const
  ).map(([language, name]) => [
    language,
    {
      aff: new Uint8Array(readFileSync(join(folderOf(name), 'index.aff'))),
      dic: new Uint8Array(readFileSync(join(folderOf(name), 'index.dic'))),
    },
  ]),
) as never;

const load = vi.fn(async (language: SpellLanguage) => FILES[language]);

const check = (seq: number, source: string): SpellRequest => ({
  type: 'check',
  seq,
  source,
  kind: 'fountain',
  notes: false,
  mine: [],
});
const words = (reply: SpellReply | null) =>
  reply?.type === 'checked' ? reply.marks.map((m) => m.word) : reply;

const SCRIPT = 'INT. KITCHEN - NIGHT\n\nMargaret waits by the phnoe. Its colour is red.\n';

describe('createSpellWorker', () => {
  test('checks after the dictionary is ready', async () => {
    const worker = createSpellWorker(load);
    expect(await worker.handle({ type: 'language', language: 'en-US' })).toEqual({
      type: 'ready',
      language: 'en-US',
    });
    const reply = await worker.handle(check(1, SCRIPT));
    expect(reply).toMatchObject({ type: 'checked', seq: 1 });
    expect(words(reply)).toEqual(['phnoe', 'colour']);
  });

  test('a check sent before ready waits for it', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = createSpellWorker(async (language) => {
      await held;
      return FILES[language];
    });
    const ready = worker.handle({ type: 'language', language: 'en-US' });
    const checked = worker.handle(check(1, SCRIPT));
    let settled = false;
    void checked.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    release();
    expect((await ready)?.type).toBe('ready');
    expect(words(await checked)).toEqual(['phnoe', 'colour']);
  });

  test('a failed dictionary load is one reply, and the next request tries again', async () => {
    let fail = true;
    const flaky = vi.fn(async (language: SpellLanguage) => {
      if (fail) throw new Error('offline');
      return FILES[language];
    });
    const worker = createSpellWorker(flaky);
    const replies = await Promise.all([
      worker.handle({ type: 'language', language: 'en-US' }),
      worker.handle(check(1, SCRIPT)),
      worker.handle(check(2, SCRIPT)),
    ]);
    // One load, one failure said; the others wait on the same load and say nothing.
    expect(flaky).toHaveBeenCalledOnce();
    expect(replies.filter((r) => r?.type === 'failed')).toHaveLength(1);
    expect(replies.filter((r) => r !== null)).toHaveLength(1);
    expect(replies[0]).toMatchObject({ type: 'failed' });
    fail = false;
    expect(words(await worker.handle(check(3, SCRIPT)))).toEqual(['phnoe', 'colour']);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  test('suggests at most five', async () => {
    const worker = createSpellWorker(load);
    const reply = await worker.handle({ type: 'suggest', seq: 4, word: 'phnoe' });
    expect(reply).toMatchObject({ type: 'suggestions', seq: 4, word: 'phnoe' });
    const suggestions = reply?.type === 'suggestions' ? reply.suggestions : [];
    expect(suggestions).toContain('phone');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  test('rechecks everything after the language changes', async () => {
    const worker = createSpellWorker(load);
    await worker.handle({ type: 'language', language: 'en-US' });
    expect(words(await worker.handle(check(1, SCRIPT)))).toEqual(['phnoe', 'colour']);
    // British English: the verdicts US English gave are not kept, so colour is a word now.
    await worker.handle({ type: 'language', language: 'en-GB' });
    expect(words(await worker.handle(check(2, SCRIPT)))).toEqual(['phnoe']);
    const american = SCRIPT.replace('colour', 'color');
    expect(words(await worker.handle(check(3, american)))).toEqual(['phnoe', 'color']);
    // And back: colour is wrong again.
    await worker.handle({ type: 'language', language: 'en-US' });
    expect(words(await worker.handle(check(4, SCRIPT)))).toEqual(['phnoe', 'colour']);
  });

  test('checks a Markdown document and passes My dictionary along', async () => {
    const worker = createSpellWorker(load);
    const reply = await worker.handle({
      type: 'check',
      seq: 1,
      source: '# A draft\n\nThe phnoe rings for Zephyrine. `zzqx`\n',
      kind: 'markdown',
      notes: false,
      mine: ['zephyrine'],
    });
    expect(words(reply)).toEqual(['phnoe']);
  });
});

describe('fetchDictionary', () => {
  test('fetches the two files from the language’s folder', async () => {
    const asked: string[] = [];
    const files = await fetchDictionary('en-GB', async (url) => {
      asked.push(url);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    expect(asked.sort()).toEqual([
      '/dictionaries/en-GB/index.aff',
      '/dictionaries/en-GB/index.dic',
    ]);
    expect(files.aff).toBeInstanceOf(Uint8Array);
    expect([...files.dic]).toEqual([1, 2, 3]);
  });

  test('a file that is not there is an error', async () => {
    await expect(
      fetchDictionary('en-US', async (url) =>
        url.endsWith('.dic') ? new Response('', { status: 404 }) : new Response('x'),
      ),
    ).rejects.toThrow('index.dic');
  });
});
