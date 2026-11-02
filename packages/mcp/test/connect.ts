// A client connected to a real server through the SDK's in-memory transport: the tests (and the
// trap suite) call tools the way an AI app does.
import { randomBytes } from 'node:crypto';
import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import type { CallToolResult } from '@modelcontextprotocol/client';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { ABOUT, MAX_ANSWER_CHARS } from '../src/envelope';
import { ReaderPool, type WorkerSpec } from '../src/pool';
import { resolveRoots } from '../src/roots';
import { createServer } from '../src/server';
import type { ToolName } from '../src/tools/index';

export interface Connected {
  client: Client;
  call(name: ToolName, args: object): Promise<CallToolResult>;
  close(): Promise<void>;
  /** How many times the server asked the client for its roots (it never should). */
  rootsAsked(): number;
  /** The lines the server wrote to standard error. */
  logged: string[];
}

export async function connect(options: {
  folders: string[];
  notes?: boolean;
  boneyard?: boolean;
  worker?: WorkerSpec;
}): Promise<Connected> {
  const platform = process.platform;
  const roots = await resolveRoots(options.folders, platform);
  const settings = {
    folders: options.folders,
    notes: options.notes ?? false,
    boneyard: options.boneyard ?? false,
    wordsPerMinute: DEFAULT_WORDS_PER_MINUTE,
  };
  const pool = new ReaderPool(options.worker ?? 'inline', {
    roots,
    options: settings,
    key: new Uint8Array(randomBytes(32)),
    platform,
  });
  const logged: string[] = [];
  const server = createServer({
    roots,
    options: settings,
    pool,
    version: '0.0.0-test',
    log: (line) => logged.push(line),
  });
  // The client offers roots, so a server that asked for them would be heard.
  const client = new Client(
    { name: 'drafter-mcp-tests', version: '0.0.0' },
    { capabilities: { roots: { listChanged: true } } },
  );
  let asked = 0;
  client.setRequestHandler('roots/list', () => {
    asked++;
    return { roots: [] };
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  return {
    client,
    call: (name, args) =>
      client.callTool({
        name,
        arguments: args as Record<string, unknown>,
      }) as Promise<CallToolResult>,
    close: async () => {
      await client.close();
      await server.close();
      await pool.close();
    },
    rootsAsked: () => asked,
    logged,
  };
}

/** A successful answer's structured content, checked: its text is the same JSON, under the cap. */
export function answerOf<T = Record<string, unknown>>(result: CallToolResult): T {
  if (result.isError) throw new Error(`refused: ${(result.content[0] as { text: string }).text}`);
  const text = (result.content[0] as { text: string }).text;
  if (text.length > MAX_ANSWER_CHARS) throw new Error(`answer of ${text.length} characters`);
  const parsed = JSON.parse(text);
  if (JSON.stringify(parsed) !== JSON.stringify(result.structuredContent))
    throw new Error('the text and the structured content differ');
  if (parsed.about !== ABOUT) throw new Error('no about');
  return parsed as T;
}

/** A refusal's body: `{ about, error, …extra }`. */
export function refusalOf(result: CallToolResult): {
  about: string;
  error: string;
  [key: string]: unknown;
} {
  if (!result.isError) throw new Error('not refused');
  return JSON.parse((result.content[0] as { text: string }).text);
}
