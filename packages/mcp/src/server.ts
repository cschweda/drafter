// The MCP server: the tools by name and schema, Drafter's instructions, and nothing else. A call
// is checked against its tool's strict schema, then handed whole to the reader (pool.ts); no tool
// code runs here. It never asks the AI app for roots: the folders come from --folder alone.
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ABOUT, INSTRUCTIONS, ok, refused } from './envelope';
import type { Options } from './options';
import type { ReaderPool } from './pool';
import type { Root } from './roots';
import { TOOLS } from './tools/index';

export interface ServerConfig {
  roots: Root[];
  options: Options;
  pool: ReaderPool;
  version: string;
  /** Where a refusal is said, a line each (standard error in the program). */
  log?: (line: string) => void;
}

/**
 * A line for standard error with every control character (C0, DEL, C1, and the line and
 * paragraph separators) written as `\u{…}`, so nothing in a message can start a line of its own.
 */
export function logLine(text: string): string {
  let line = '';
  for (const c of text) {
    const code = c.codePointAt(0) as number;
    const control =
      code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    line += control ? `\\u{${code.toString(16)}}` : c;
  }
  return line;
}

/** Every tool only reads, and only the writer's folders (a hint for the app; §7 is the protection). */
const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    { name: 'drafter-mcp', version: config.version },
    { instructions: INSTRUCTIONS, capabilities: { tools: {}, prompts: {} } },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: z.object({ about: z.literal(ABOUT), ...tool.output.shape }),
        annotations: ANNOTATIONS,
      },
      async (args: unknown) => {
        const result = await config.pool.run({ tool: tool.name, args });
        if ('ok' in result) return ok(result.ok);
        // The message only: never a file's text.
        config.log?.(logLine(`drafter-mcp: refused ${tool.name}: ${result.refused}`));
        return refused(result.refused, result.extra);
      },
    );
  }
  return server;
}
