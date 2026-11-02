// The MCP server: the tools by name and schema, Drafter's instructions, and nothing else. A call
// is checked against its tool's strict schema, then handed whole to the reader (pool.ts); no tool
// code runs here. It never asks the AI app for roots: the folders come from --folder alone.
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ABOUT, INSTRUCTIONS, MAX_ANSWER_CHARS, ok, refused } from './envelope';
import type { Options } from './options';
import type { ReaderPool } from './pool';
import { registerPrompts } from './prompts';
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

/** The most characters a line for standard error may take. */
export const LOG_LINE_CHARS = 2_000;

/** The refusal sent in place of any answer or refusal over MAX_ANSWER_CHARS. */
export const TOO_LONG = 'That answer was too long. Ask for less at once.';

/**
 * A line for standard error with every control character (C0, DEL, C1, and the line and
 * paragraph separators) written as `\u{…}`, so nothing in a message can start a line of its own;
 * at most LOG_LINE_CHARS long, ending `…` if cut.
 */
export function logLine(text: string): string {
  let line = '';
  for (const c of text) {
    const code = c.codePointAt(0) as number;
    const control =
      code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    const next = control ? `\\u{${code.toString(16)}}` : c;
    if (line.length + next.length > LOG_LINE_CHARS - 1) return `${line}…`;
    line += next;
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
        const sent = 'ok' in result ? ok(result.ok) : refused(result.refused, result.extra);
        // The cap holds on the way out, whatever a tool returned: past it, a short refusal, and
        // only the length is logged.
        const length = (sent.content[0] as { text: string }).text.length;
        if (length > MAX_ANSWER_CHARS) {
          config.log?.(
            logLine(`drafter-mcp: refused ${tool.name}: an answer of ${length} characters`),
          );
          return refused(TOO_LONG);
        }
        // The message only: never a file's text.
        if ('refused' in result)
          config.log?.(logLine(`drafter-mcp: refused ${tool.name}: ${result.refused}`));
        return sent;
      },
    );
  }
  registerPrompts(server);
  return server;
}
