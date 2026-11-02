import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CALL_LIMIT_MS,
  callLimitMs,
  ReaderPool,
  STOPPED,
  TOO_LONG,
  type WorkerData,
} from '../src/pool';
import type { ToolName } from '../src/tools/index';

const SPIN = {
  url: new URL('./fixtures/spin-worker.ts', import.meta.url),
  execArgv: ['--experimental-transform-types', '--no-warnings'],
};
const DATA: WorkerData = {
  roots: [],
  options: { folders: [], notes: false, boneyard: false, wordsPerMinute: 150 },
  key: new Uint8Array(32),
  platform: process.platform,
};
const job = (tool: string) => ({ tool: tool as ToolName, args: {} });

let pool: ReaderPool | undefined;
afterEach(async () => {
  await pool?.close();
  pool = undefined;
});

describe('the reader pool', () => {
  it('a call past the limit is stopped and refused, and the next call gets a new worker', async () => {
    pool = new ReaderPool(SPIN, DATA, 200);
    const first = (await pool.run(job('thread'))) as { ok: { threadId: number } };
    const started = Date.now();
    expect(await pool.run(job('spin'))).toEqual({ refused: TOO_LONG });
    expect(Date.now() - started).toBeLessThan(5_000);
    const next = (await pool.run(job('thread'))) as { ok: { threadId: number } };
    expect(next.ok.threadId).not.toBe(first.ok.threadId);
  });

  it('the worker is reused between calls', async () => {
    pool = new ReaderPool(SPIN, DATA);
    const a = (await pool.run(job('thread'))) as { ok: { threadId: number } };
    const b = (await pool.run(job('thread'))) as { ok: { threadId: number } };
    expect(a.ok.threadId).toBeGreaterThan(0);
    expect(b.ok.threadId).toBe(a.ok.threadId);
  });

  it('calls at once are answered one after another, each its own', async () => {
    pool = new ReaderPool(SPIN, DATA);
    const answers = await Promise.all([pool.run(job('thread')), pool.run(job('thread'))]);
    expect(answers.every((answer) => 'ok' in answer)).toBe(true);
  });

  it('the limit is ten seconds', async () => {
    const { CALL_LIMIT_MS } = await import('../src/pool');
    expect(CALL_LIMIT_MS).toBe(10_000);
  });
});

describe('the reader pool, in a program of its own', () => {
  it('a waiting worker doesn’t keep the program running', () => {
    // The program ends when the AI app closes its standard input; a reader left waiting for the
    // next call must not hold it open.
    const hooks = new URL('../../../fixtures/trap/worker/register.mjs', import.meta.url).href;
    const pool = new URL('../src/pool.ts', import.meta.url).href;
    const script = `
      const { ReaderPool } = await import(${JSON.stringify(pool)});
      const spec = { url: new URL(${JSON.stringify(SPIN.url.href)}), execArgv: ${JSON.stringify(SPIN.execArgv)} };
      const data = ${JSON.stringify({ ...DATA, key: [] })};
      const answer = await new ReaderPool(spec, data).run({ tool: 'thread', args: {} });
      console.log(JSON.stringify(answer));
    `;
    const ran = spawnSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--no-warnings',
        '--import',
        hooks,
        '--input-type=module',
        '-e',
        script,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
    expect(ran.signal).toBeNull();
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout).ok.threadId).toBeGreaterThan(0);
  });
});

describe('closing the reader pool', () => {
  it('a call still running when the pool closes is refused, not left waiting', async () => {
    const closing = new ReaderPool(SPIN, DATA, 60_000);
    // Started once, so the next call is the one in flight.
    await closing.run(job('thread'));
    const spinning = closing.run(job('spin'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await closing.close();
    expect(await spinning).toEqual({ refused: STOPPED });
  });

  it('a call waiting for the reader to start is refused too', async () => {
    const closing = new ReaderPool(SPIN, DATA, 60_000);
    const first = closing.run(job('thread'));
    await closing.close();
    expect(await first).toEqual({ refused: STOPPED });
  });
});

describe('the call limit', () => {
  it('is 10 seconds, shortened by DRAFTER_MCP_LIMIT_MS only in a test', () => {
    expect(CALL_LIMIT_MS).toBe(10_000);
    expect(callLimitMs({})).toBe(CALL_LIMIT_MS);
    expect(callLimitMs({ DRAFTER_MCP_LIMIT_MS: '200' })).toBe(CALL_LIMIT_MS);
    expect(callLimitMs({ NODE_ENV: 'production', DRAFTER_MCP_LIMIT_MS: '200' })).toBe(
      CALL_LIMIT_MS,
    );
    expect(callLimitMs({ NODE_ENV: 'test', DRAFTER_MCP_LIMIT_MS: '200' })).toBe(200);
  });

  it('a value that isn’t a whole number of milliseconds from 1 to 10 seconds is ignored', () => {
    for (const value of ['', '0', '-5', '1.5', 'abc', '20000', '1e3'])
      expect(callLimitMs({ NODE_ENV: 'test', DRAFTER_MCP_LIMIT_MS: value })).toBe(CALL_LIMIT_MS);
  });
});
