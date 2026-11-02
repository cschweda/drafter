// Every answer and every refusal stays under MAX_ANSWER_CHARS, whatever the files hold: a scene
// reference that matches many huge headings, a huge title, a Fade In file whose many entries have
// long names, and (whatever a tool returns) the server's own guard on the way out.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { trapZip } from '../../../fixtures/trap/zip';
import { ABOUT, MAX_ANSWER_CHARS, MAX_REFUSAL_CHARS } from '../src/envelope';
import type { ReaderPool } from '../src/pool';
import { createServer, LOG_LINE_CHARS, logLine, TOO_LONG } from '../src/server';
import { TEXT_LIMITS } from '../src/tools/script';
import { handle } from '../src/worker';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { contextFor } from './context';
import { put, tempFolder } from './temp';

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

const textOf = (result: { content: unknown }) =>
  ((result.content as Array<{ text: string }>)[0] as { text: string }).text;

/** 25 scenes, each a heading of 50,000 characters that "room" matches. */
function hugeHeadings(): string {
  const scenes: string[] = [];
  for (let n = 1; n <= 25; n++)
    scenes.push(
      `INT. ROOM ${n} ${'W'.repeat(50_000)} - NIGHT\n\nA keeper waits.\n\nWREN\nStill here.\n`,
    );
  return scenes.join('\n');
}

/** Six `.xml` entries at the top, none OSF's, each name 30,000 characters long. */
const longNamed = () =>
  Array.from({ length: 6 }, (_, i) => ({
    name: `${String(i).repeat(30_000)}.xml`,
    data: '<x/>',
    method: 0,
  }));

describe('a scene reference that matches many huge headings', () => {
  it('is refused under the cap, each heading clipped and said to be cut', async () => {
    const dir = tempFolder();
    put(join(dir, 'Scripts', 'wide.fountain'), hugeHeadings());
    open = await connect({ folders: [join(dir, 'Scripts')] });
    for (const [tool, args] of [
      ['read_scene', { script: 'Scripts/wide.fountain', scene: 'room' }],
      ['character_lines', { script: 'Scripts/wide.fountain', character: 'wren', from: 'room' }],
    ] as const) {
      const result = await open.call(tool, args);
      const text = textOf(result);
      expect(text.length, tool).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
      const body = refusalOf(result);
      const matches = body.matches as Array<{ scene: number; heading: string; heading_cut?: true }>;
      expect(matches, tool).toHaveLength(20);
      for (const match of matches) {
        expect(match.heading.length).toBeLessThanOrEqual(TEXT_LIMITS.heading);
        expect(match.heading_cut).toBe(true);
      }
    }
    for (const line of open.logged) expect(line.length).toBeLessThanOrEqual(LOG_LINE_CHARS);
  });
});

describe('list_scripts and script_overview', () => {
  it('a title of 120,000 characters is clipped, and said to be cut', async () => {
    const dir = tempFolder();
    put(
      join(dir, 'Scripts', 'tall.fountain'),
      `Title: ${'T'.repeat(120_000)}\n\nINT. HALL - DAY\n\nA keeper stands.\n`,
    );
    open = await connect({ folders: [join(dir, 'Scripts')] });
    const listing = answerOf<{ files: Array<{ title: string; title_cut?: true }> }>(
      await open.call('list_scripts', {}),
    );
    expect(listing.files[0]?.title.length).toBeLessThanOrEqual(TEXT_LIMITS.heading);
    expect(listing.files[0]?.title_cut).toBe(true);
  });

  it('a Markdown title of 120,000 characters is clipped too', async () => {
    const dir = tempFolder();
    put(join(dir, 'Scripts', 'tall.md'), `# ${'T'.repeat(120_000)}\n\nWords.\n`);
    open = await connect({ folders: [join(dir, 'Scripts')] });
    const listing = answerOf<{ files: Array<{ title: string; title_cut?: true }> }>(
      await open.call('list_scripts', {}),
    );
    expect(listing.files[0]?.title.length).toBeLessThanOrEqual(TEXT_LIMITS.heading);
    expect(listing.files[0]?.title_cut).toBe(true);
  });

  it('a Fade In file with five long entry names is listed and refused under the cap', async () => {
    const dir = tempFolder();
    writeFileSync(put(join(dir, 'Scripts', 'many.fadein'), ''), trapZip(longNamed()));
    open = await connect({ folders: [join(dir, 'Scripts')] });
    const listing = answerOf<{ files: Array<{ refused: string | null }> }>(
      await open.call('list_scripts', {}),
    );
    expect(listing.files[0]?.refused?.length).toBeLessThanOrEqual(MAX_REFUSAL_CHARS);
    const overview = await open.call('script_overview', { script: 'Scripts/many.fadein' });
    expect(textOf(overview).length).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
    expect(refusalOf(overview).error.length).toBeLessThanOrEqual(MAX_REFUSAL_CHARS);
    for (const line of open.logged) expect(line.length).toBeLessThanOrEqual(LOG_LINE_CHARS);
  });
});

describe('the reader', () => {
  it('clips every refusal message it returns', async () => {
    const dir = tempFolder();
    writeFileSync(put(join(dir, 'Scripts', 'many.fadein'), ''), trapZip(longNamed()));
    const ctx = await contextFor([join(dir, 'Scripts')]);
    const result = await handle(
      { tool: 'script_overview', args: { script: 'Scripts/many.fadein' } },
      ctx.data,
    );
    if (!('refused' in result)) throw new Error('not refused');
    expect(result.refused.length).toBeLessThanOrEqual(MAX_REFUSAL_CHARS);
    expect(result.refused).toMatch(/…$/);
  });
});

describe('the server’s guard on the way out', () => {
  /** A server whose reader answers `result` to every call. */
  async function serving(result: Awaited<ReturnType<ReaderPool['run']>>) {
    const logged: string[] = [];
    const pool = { run: async () => result, close: async () => {} } as unknown as ReaderPool;
    const server = createServer({
      roots: [],
      options: { folders: [], notes: false, boneyard: false, wordsPerMinute: 150 },
      pool,
      version: '0.0.0-test',
      log: (line) => logged.push(line),
    });
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
    const call = async () =>
      client.callTool({ name: 'read_scene', arguments: { script: 'S/a.fountain', scene: '1' } });
    return { call, logged, close: () => client.close() };
  }

  it('turns an answer over the cap into a short refusal, and logs only its length', async () => {
    const big = await serving({ ok: { scenes: [{ text: 'x'.repeat(MAX_ANSWER_CHARS) }] } });
    const result = await big.call();
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(JSON.parse(text)).toEqual({ about: ABOUT, error: TOO_LONG });
    expect(big.logged.join('\n')).not.toContain('xxxx');
    expect(big.logged.join('\n')).toMatch(/\d+ characters/);
    await big.close();
  });

  it('turns a refusal over the cap into the same short refusal', async () => {
    const big = await serving({ refused: 'y'.repeat(MAX_ANSWER_CHARS) });
    const result = await big.call();
    expect(JSON.parse(textOf(result))).toEqual({ about: ABOUT, error: TOO_LONG });
    expect(big.logged.join('\n')).not.toContain('yyyy');
    await big.close();
  });

  it('a log line is clipped, whatever it is given', () => {
    expect(logLine('z'.repeat(100_000)).length).toBeLessThanOrEqual(LOG_LINE_CHARS);
    expect(logLine('\u0007'.repeat(100_000)).length).toBeLessThanOrEqual(LOG_LINE_CHARS);
    expect(logLine('short')).toBe('short');
  });
});
