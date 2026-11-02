// The one file people run (the GitHub Release asset, and what npm gets): built by tsdown with every
// dependency inside it, run here as a real AI app runs it, over standard input and output.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { MAX_SCRIPT_BYTES } from '@drafter/archive';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NO_FOLDER } from '../src/options';
import { TOO_LONG } from '../src/pool';
import { EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

const DIST = join(import.meta.dirname, '..', 'dist');
const BUNDLE = join(DIST, 'drafter-mcp.js');

let code = '';
beforeAll(() => {
  if (!existsSync(BUNDLE))
    throw new Error('No dist/drafter-mcp.js: run pnpm --filter drafter-mcp build');
  code = readFileSync(BUNDLE, 'utf8');
});

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** The bundle started as an AI app starts it, and a client connected to it. */
async function start(folders: string[], env: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BUNDLE, ...folders.flatMap((folder) => ['--folder', folder])],
    env: { PATH: process.env.PATH ?? '', ...env },
    stderr: 'pipe',
  });
  client = new Client({ name: 'drafter-mcp-bundle-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

const parsed = (result: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((result.content as Array<{ text: string }>)[0]?.text ?? '{}');

describe('the bundle', () => {
  it('one file, and it imports only Node’s own modules', () => {
    expect(readdirSync(DIST)).toEqual(['drafter-mcp.js']);
    const builtins = new Set(builtinModules);
    const specifiers = [
      // Static imports and re-exports, at the start of a line (the bundle's own).
      ...code.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm),
      ...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
      // Not a JSDoc type (`{import('./types').X}`), which is a comment.
      ...code.matchAll(/(?<![{|<\w.$])import\(\s*['"]([^'"]+)['"]\s*\)/g),
      // Not Ajv's generated code, which names its runtime in a template string (`require("ajv/…")`)
      // that is never run here.
      ...code.matchAll(/(?<![`\w.$])require\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1] as string);
    expect(specifiers.length).toBeGreaterThan(0);
    const foreign = specifiers.filter(
      (name) => !name.startsWith('node:') && !builtins.has(name.split('/')[0] as string),
    );
    expect([...new Set(foreign)]).toEqual([]);
  });

  it('it starts with #!/usr/bin/env node and carries the licences', () => {
    expect(code.split('\n')[0]).toBe('#!/usr/bin/env node');
    const notices = code.slice(code.lastIndexOf('Third-party licences'));
    expect(notices).not.toBe(code);
    for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'])
      expect(notices).toContain(name);
    // The JSON Schema validator the SDK carries inside its own files for Node (Ajv); the one for
    // Cloudflare Workers (@cfworker/json-schema) is in files the bundle never reaches.
    expect(notices).toMatch(
      /^ \* ajv 8\.\d+\.\d+ \(MIT\), carried inside @modelcontextprotocol\/server$/m,
    );
    expect(code).not.toMatch(/deepCompareStrict/);
    expect(notices).not.toMatch(/@cfworker/);
    expect(notices).toMatch(/Apache License/);
    expect(notices).toMatch(/MIT License|Permission is hereby granted/);
  });

  it('it answers over stdio', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const app = await start([scripts]);
    expect((await app.listTools()).tools).toHaveLength(10);
    expect((await app.listPrompts()).prompts).toHaveLength(7);
    const got = parsed(
      await app.callTool({
        name: 'read_scene',
        arguments: { script: `Scripts/Signal Hill/${EPISODE_101}`, scene: '1' },
      }),
    );
    expect(got.scenes).toHaveLength(1);
    expect(got.scenes[0].heading).toMatch(/^INT\. /);
    expect(got.scenes[0].text.length).toBeGreaterThan(0);
  }, 30_000);

  it('it refuses to start without a folder', () => {
    const run = spawnSync(process.execPath, [BUNDLE], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(NO_FOLDER);
    expect(run.stdout).toBe('');
  });

  it('--version prints the version', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    const run = spawnSync(process.execPath, [BUNDLE, '--version'], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(pkg.version);
  });

  it('a call over the limit is stopped, in the reader thread, and the next call answers', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    const unit =
      'INT. ROOM - DAY\n\nA chair sits by the window, and the light comes in slow.\n\nJUNE\nIt is late.\n\n';
    put(
      join(scripts, 'Long.fountain'),
      unit.repeat(Math.floor((MAX_SCRIPT_BYTES - 4096) / unit.length)),
    );
    put(join(scripts, 'Short.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    // The limit is shortened only for a test (NODE_ENV=test), so the stop is quick to see: 20 ms,
    // far less than parsing a 5 MB script takes on any machine (the reader's start isn't counted).
    const app = await start([scripts], { NODE_ENV: 'test', DRAFTER_MCP_LIMIT_MS: '20' });
    const slow = await app.callTool({
      name: 'script_overview',
      arguments: { script: 'Scripts/Long.fountain' },
    });
    expect(slow.isError).toBe(true);
    expect(parsed(slow).error).toBe(TOO_LONG);
    const quick = await app.callTool({
      name: 'read_scene',
      arguments: { script: 'Scripts/Short.fountain', scene: '1' },
    });
    expect(quick.isError).toBeFalsy();
    expect(parsed(quick).scenes[0].heading).toBe('INT. HALL - DAY');
  }, 60_000);

  it('the limit is never shortened outside a test', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    put(join(scripts, 'Short.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    const app = await start([scripts], { DRAFTER_MCP_LIMIT_MS: '1' });
    const quick = await app.callTool({
      name: 'read_scene',
      arguments: { script: 'Scripts/Short.fountain', scene: '1' },
    });
    expect(quick.isError).toBeFalsy();
  }, 30_000);
});
