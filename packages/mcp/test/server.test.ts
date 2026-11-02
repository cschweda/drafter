import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT, INSTRUCTIONS } from '../src/envelope';
import { type Connected, connect } from './connect';
import { makeLibrary } from './library';
import { tempFolder } from './temp';

const REAL_WORKER = {
  url: new URL('../src/worker.ts', import.meta.url),
  execArgv: [
    '--experimental-transform-types',
    '--no-warnings',
    '--import',
    pathToFileURL(new URL('../../../fixtures/trap/worker/register.mjs', import.meta.url).pathname)
      .href,
  ],
};

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function library(worker?: typeof REAL_WORKER): Promise<Connected> {
  const { scripts, plays } = makeLibrary(tempFolder());
  open = await connect({ folders: [scripts, plays], ...(worker ? { worker } : {}) });
  return open;
}

/** A refusal, whether the SDK answers with an error result or a protocol error. */
async function refusedBySchema(call: () => Promise<{ isError?: boolean }>): Promise<boolean> {
  try {
    return (await call()).isError === true;
  } catch {
    return true;
  }
}

describe('the server', () => {
  it('lists the tools with their read-only hints', async () => {
    const { client } = await library();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('list_scripts');
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.additionalProperties).toBe(false);
      const output = tool.outputSchema as { properties: Record<string, unknown> };
      expect(Object.keys(output.properties)[0]).toBe('about');
    }
  });

  it('the instructions are Drafter’s', async () => {
    const { client } = await library();
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
  });

  it('unknown keys and oversized strings are refused by the schema', async () => {
    const { call } = await library();
    for (const args of [
      { bogus: true },
      { folder: 'x'.repeat(1_025) },
      { cursor: 'c'.repeat(2_049) },
      { recursive: 'yes' },
      { folder: '' },
    ])
      expect(await refusedBySchema(() => call('list_scripts', args))).toBe(true);
    // Within the limits, it answers.
    const fine = await call('list_scripts', { folder: 'Scripts', recursive: false });
    expect(fine.isError).toBeFalsy();
  });

  it('the server never asks for roots', async () => {
    // Through the real worker thread, as the program runs.
    const { call, rootsAsked, client } = await library(REAL_WORKER);
    const result = await call('list_scripts', {});
    expect(result.isError).toBeFalsy();
    const body = result.structuredContent as { about: string; files: unknown[] };
    expect(body.about).toBe(ABOUT);
    expect(body.files.length).toBe(5);
    expect(rootsAsked()).toBe(0);
    expect(client.getServerCapabilities()?.tools).toBeDefined();
  });

  it('a refusal is logged by its message only', async () => {
    const { call, logged } = await library();
    const result = await call('list_scripts', { folder: 'Nowhere/Else' });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.about).toBe(ABOUT);
    expect(logged).toEqual([`drafter-mcp: refused list_scripts: ${body.error}`]);
  });
});
