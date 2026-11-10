// The worker a trap runs in (pool.ts): Node alone, with hooks.mjs resolving the packages to their
// source as the tests do. A trap that loops or grows without end is stopped from outside, by
// `terminate()`, which no in-process timeout can do to synchronous code. Each job is one trap at
// one entry point; the answer is what happened, how long it took, and what it kept once garbage
// is collected.

import { readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { parentPort } from 'node:worker_threads';
import {
  ArchiveError,
  embeddedSource,
  fromFadeIn,
  fromHighland,
  isUtf16,
  listZip,
  readEntry,
  SNIFF_BYTES,
} from '@drafter/archive';
import { run } from '@drafter/cli';
import { FdxError, fromFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { mergeCuts, readCutsBytes, readDraftBytes, skippedLine } from '@drafter/history';
import { paginate } from '@drafter/layout';
import {
  findMarkdownMeta,
  MarkedTooDensely,
  NestedTooDeeply,
  parseMarkdown,
} from '@drafter/markdown';
import {
  downTarget,
  type ManuscriptDetails,
  manuscriptOf,
  moveNode,
  novelStructure,
  orphanedFacts,
  readFacts,
  resolveDetails,
  upTarget,
} from '@drafter/novel';
import { decodeBaseline, readProduction } from '@drafter/production';
import { renderManuscriptDocx } from '@drafter/render-docx';
import { renderDocumentHtml, renderScriptHtml } from '@drafter/render-html-file';
import { MANUSCRIPT_FONT_FILES, renderManuscriptPdf } from '@drafter/render-pdf';
import {
  buildStoryMap,
  renderStoryMap,
  type StoryMapFonts,
  storyMapMeta,
} from '@drafter/story-map';
import { builtins, type Template } from '@drafter/templates';
import { JSDOM } from 'jsdom';
import { currentWriter, readModulesFolder } from '../../../apps/desktop/src/module-folder';
import type { ToolName } from '../../../packages/mcp/src/tools/index';
import type { Happened } from '../check';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

const used = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers;
};

export type Job =
  | { kind: 'package'; format: string; bytes: Uint8Array; inert: boolean }
  | { kind: 'cli'; cwd: string; args: string[] }
  | { kind: 'modules'; dir: string }
  | { kind: 'beside'; format: string; bytes: Uint8Array }
  | { kind: 'novel'; bytes: Uint8Array }
  | { kind: 'manuscript'; bytes: Uint8Array; details?: Record<string, unknown> }
  | { kind: 'production'; bytes: Uint8Array }
  | McpJob;

/**
 * One trap through Drafter for Claude: a real server (packages/mcp) given `folders`, connected
 * through the SDK's in-memory transport, its reader inline in this worker (which is stopped from
 * outside at the trap's limit), and `tool` called with `args`.
 */
export interface McpJob {
  kind: 'mcp';
  /** The trap's own folder, holding the writer's folder and anything outside it. */
  dir: string;
  /** The path the tool is given. */
  path: string;
  tool: ToolName;
  args: object;
  folders: string[];
  /** Each call's arguments in turn, in place of `args`. */
  calls?: object[];
  /** Follow each answer's `next` until there is none. */
  pages?: boolean;
  /** A call made first, whose `next` is the cursor of the call that is checked. */
  cursorFrom?: { tool: ToolName; args: object };
  /** An mcp trap whose `swap` runs once its path is checked and before it is read. */
  swap?: string;
  /** The guard's own check: after the calls, try each kind of call it must stop, through ESM imports. */
  probe?: boolean;
  /** The guard's own check, in a new worker: try each kind of call while the server is imported. */
  probeFirst?: boolean;
}

/** Tries a fetch, a socket, a name lookup, and a program run, each as an ESM import sees it. */
async function probe(): Promise<void> {
  const attempts: Array<() => unknown> = [
    () => fetch('http://example.invalid/'),
    async () => (await import('node:net')).createConnection({ port: 9 }),
    async () => (await import('node:dns')).lookup('example.invalid', () => {}),
    async () => (await import('node:dns/promises')).lookup('example.invalid'),
    async () => (await import('node:child_process')).execFileSync('true'),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
    } catch {
      // Each one throws: what was tried is in `tried`.
    }
  }
}

/** One tool call's result, as the AI app gets it. */
export interface McpResult {
  isError: boolean;
  /** `content[0].text`. */
  text: string;
  structured?: Record<string, unknown>;
  /** The client threw rather than returning a result. */
  threw?: true;
}

export interface Answer {
  happened: Happened;
  /** For `cli`: the exit code and what it printed. */
  cli?: { code: number; out: string; err: string };
  /** Drafter's HTML export of the opened text, for an inert trap; null when the export refuses it. */
  html?: string | null;
  /** The opened text's story map, for an inert trap. */
  storyMap?: string;
  /** For `mcp`: every call's result, and every network or process call that was tried (none). */
  mcp?: { results: McpResult[]; calls: string[]; guard: string[] };
  /** For `novel`: what was found in Open's text, and whether a move was made. */
  novel?: NovelReport;
  /** For `manuscript`: what the two files came to. */
  manuscript?: ManuscriptReport;
  /** For `production`: whether the block read, and whether it is a lock (its baseline decoded too). */
  production?: { read: boolean; locked: boolean };
  ms: number;
  kept: number;
}

export interface ManuscriptReport {
  /** The PDF's pages, as a PDF reader counts them. */
  pdfPages: number;
  /** Every part of the Word file that is not well-formed XML. */
  badParts: string[];
  /** The parts of the Word file, and the ones holding a `w:fldSimple`, with how many. */
  parts: string[];
  fldSimple: Record<string, number>;
  /** `w:instrText` and `w:fldChar` in the whole Word file. */
  complexFields: number;
}

export interface NovelReport {
  parts: number;
  chapters: number;
  sections: number;
  moved: boolean;
}

/**
 * Text as Open decodes it: not UTF-16, no NUL in the first 8 KB, strict UTF-8, a BOM off, line
 * breaks as `\n`. The `package` entry point decodes with this copy, so each reader is tried on its
 * own; the app's real decoding is what `web-open` and `desktop-open` run (trap-open.test.ts).
 */
function decoded(bytes: Uint8Array): Happened | string {
  if (isUtf16(bytes)) return { kind: 'refused', message: 'isn’t UTF-8 text' };
  if (bytes.subarray(0, SNIFF_BYTES).includes(0))
    return { kind: 'refused', message: 'holds more than text' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  } catch {
    return { kind: 'refused', message: 'isn’t UTF-8 text' };
  }
}

const noted = (mapped: readonly { count: number }[]) => {
  const n = mapped.reduce((sum, m) => sum + m.count, 0);
  return n === 0 ? '' : n === 1 ? '1 item came in as a note' : `${n} items came in as notes`;
};

const refusedBy = (error: unknown): Happened => {
  if (
    error instanceof FdxError ||
    error instanceof ArchiveError ||
    error instanceof NestedTooDeeply ||
    error instanceof MarkedTooDensely
  )
    return { kind: 'refused', message: error.message };
  throw error;
};

async function readPackage(format: string, bytes: Uint8Array): Promise<Happened> {
  switch (format) {
    case 'fountain': {
      const text = decoded(bytes);
      if (typeof text !== 'string') return text;
      const doc = parse(text);
      if (doc.source !== text) throw new Error('parse changed the source');
      return { kind: 'opened', text, message: '' };
    }
    case 'markdown': {
      const text = decoded(bytes);
      if (typeof text !== 'string') return text;
      try {
        parseMarkdown(text);
      } catch (error) {
        if (!(error instanceof NestedTooDeeply || error instanceof MarkedTooDensely)) throw error;
        return { kind: 'opened', text, message: error.message };
      }
      return { kind: 'opened', text, message: '' };
    }
    case 'fdx': {
      const text = decoded(bytes);
      if (typeof text !== 'string') return text;
      try {
        const result = fromFdx(text);
        return { kind: 'opened', text: result.text, message: noted(result.mapped) };
      } catch (error) {
        return refusedBy(error);
      }
    }
    case 'highland':
    case 'fadein':
      try {
        const result = await (format === 'highland' ? fromHighland(bytes) : fromFadeIn(bytes));
        return { kind: 'opened', text: result.text, message: noted(result.mapped) };
      } catch (error) {
        return refusedBy(error);
      }
    case 'html':
    case 'epub': {
      // Bigger than the cap is refused before the reader (Open's own check); the reader's null
      // carries no words, so the app's are used for the comparison.
      const found = await embeddedSource(bytes);
      const what = format === 'html' ? 'a web page' : 'an e-book';
      if (bytes.length > 32 * 1024 * 1024)
        return { kind: 'refused', message: 'too big to open (over 32 MB)' };
      if (!found) return { kind: 'refused', message: `Drafter can’t open ${what}` };
      const text = decoded(found.bytes);
      return typeof text === 'string' ? { kind: 'opened', text, message: '' } : text;
    }
    case 'forever':
      // The harness's own check that a trap that never ends is stopped (harness.test.ts).
      for (;;);
    default:
      throw new Error(`no reader for ${format}`);
  }
}

const FONTS = Object.fromEntries(
  (['regular', 'bold', 'italic', 'boldItalic'] as const).map((style, i) => [
    style,
    new Uint8Array([0, 1, 0, 0, i]),
  ]),
);

/** Drafter's HTML export of opened text, as a writer would make it; null when it refuses the text. */
function exported(text: string, markdown: boolean): string | null {
  try {
    if (markdown) {
      return renderDocumentHtml({
        tree: parseMarkdown(text),
        title: 'Trap',
        lang: 'en',
        generator: 'Drafter traps',
        source: text,
      });
    }
    const doc = parse(text);
    const template = builtins['us-screenplay'] as Template;
    return renderScriptHtml({
      doc,
      layout: paginate(doc, template),
      template,
      notes: 'include',
      fonts: FONTS,
      title: 'Trap',
      lang: 'en',
      generator: 'Drafter traps',
      kindLine: 'Screenplay',
      source: text,
    });
  } catch (error) {
    // The export refuses a tree nested past its own limit, in words: nothing is written at all.
    if (error instanceof RangeError && /nested too deeply/.test(error.message)) return null;
    throw error;
  }
}

/** Stand-ins that start as WOFF2 does, each face its own: the story map checks only the kind. */
const MAP_FONTS: StoryMapFonts = {
  anton: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1]),
  archivo: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 2]),
  archivoSemiBold: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 3]),
  courier: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 4]),
};

/** A title page field's text, its lines joined, or null. */
function titleField(doc: ReturnType<typeof parse>, key: string): string | null {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === key);
  return field ? field.value.join(' ') : null;
}

/**
 * The opened text's story map, as a writer would make it with every choice that carries their own
 * words on: the title page's logline, its contact (Your contact on), and the metadata block's
 * planned length and edited hooks.
 */
function storyMapOf(text: string): string {
  const doc = parse(text);
  const meta = storyMapMeta(doc.meta);
  const template = builtins['us-screenplay'] as Template;
  const map = buildStoryMap({
    doc,
    template,
    layout: paginate(doc, template),
    options: {
      status: null,
      plannedPages: meta.plannedPages,
      logline: titleField(doc, 'logline'),
      greeting: "What I'm writing",
      explain: null,
      include: { summaries: true, lines: true, threads: true, contact: true },
      contact: titleField(doc, 'contact'),
      hooks: meta.hooks,
      rates: { minutesPerPage: 1, wordsPerMinute: 150 },
      draft: { number: 1, id: '0123456789abcdef' },
      updated: null,
      title: 'Trap',
    },
  });
  return renderStoryMap({ map, fonts: MAP_FONTS, lang: 'en', generator: 'Drafter traps' });
}

async function drafter(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (data) => out.push(typeof data === 'string' ? data : new TextDecoder().decode(data)),
    err: (text) => err.push(text),
    cwd,
  });
  return { code, out: out.join(''), err: err.join('') };
}

/** The fixed moment the beside traps are read at, so a date's place in time never drifts. */
const BESIDE_NOW = new Date('2026-11-01T12:00:00.000Z');

/**
 * The app's reading of a file beside the work (packages/history/src/beside-read.ts): a cuts file's entries
 * checked and merged into none, given as their titles, one a line, with what the lists say was
 * left out; a draft file's text, with "changed outside Drafter" when its ID no longer holds.
 */
async function readBeside(format: string, bytes: Uint8Array): Promise<Happened> {
  if (format === 'cuts') {
    const read = await readCutsBytes(bytes, 'fountain');
    if (read.problem) return { kind: 'refused', message: read.problem };
    const merged = mergeCuts([], read.entries, { kind: 'fountain', now: BESIDE_NOW });
    return {
      kind: 'opened',
      text: merged.map((entry) => entry.title).join('\n'),
      message: skippedLine(read.skipped, 'Boca.fountain.cuts.md'),
    };
  }
  const read = await readDraftBytes(bytes, 'fountain');
  if (read.facts === null) return { kind: 'refused', message: read.problem };
  return {
    kind: 'opened',
    text: read.text,
    message: read.matches ? '' : 'changed outside Drafter',
  };
}

// ---- Drafter for Claude ------------------------------------------------------------------------

/** Every network, process, or socket call tried since the guard went in: each one also throws. */
const tried: string[] = [];
/**
 * The guard's own failures, kept for the worker's life and reported with every answer: a function
 * it couldn't replace, and any call tried while the server was being imported.
 */
const guardFailures: string[] = [];
let guarded = false;

/**
 * Replaces `fetch`, `WebSocket`, and every function of Node's network and process modules with
 * one that records the call and throws, so nothing in the server can fetch, listen, look a name
 * up, or run a program unseen. `syncBuiltinESMExports` makes the ESM imports see the same.
 * Installed before the server is first imported, and kept for the worker's life, so the `mcp`
 * blocks run last in harness.test.ts (the runner reuses the worker for every trap after them).
 */
function guardNetwork(): void {
  if (guarded) return;
  guarded = true;
  const trip = (name: string) =>
    function tripped() {
      tried.push(name);
      throw new Error(`${name} was called`);
    };
  const g = globalThis as Record<string, unknown>;
  g.fetch = trip('fetch');
  g.WebSocket = trip('WebSocket');
  const require = createRequire(import.meta.url);
  const replaceAll = (mod: Record<string, unknown>, name: string, keys = Object.keys(mod)) => {
    for (const key of keys) {
      if (typeof mod[key] !== 'function') continue;
      const tripped = trip(`${name}.${key}`);
      try {
        mod[key] = tripped;
      } catch {
        // A getter (`http.WebSocket`, `net.BlockList`): replaced by a plain value, if it may be.
        try {
          Object.defineProperty(mod, key, { value: tripped, writable: true, configurable: true });
        } catch {
          // Reported below.
        }
      }
      if (mod[key] !== tripped) guardFailures.push(`${name}.${key} couldn’t be replaced`);
    }
  };
  for (const id of [
    'node:net',
    'node:tls',
    'node:http',
    'node:https',
    'node:http2',
    'node:dgram',
    'node:dns',
    'node:dns/promises',
    'node:child_process',
  ])
    replaceAll(require(id) as Record<string, unknown>, id);
  // `dns.promises` (the same object as `node:dns/promises` today; replaced again if it isn't), and
  // the shared agents that make the sockets for `http` and `https`.
  const dns = require('node:dns') as { promises: Record<string, unknown> };
  if (dns.promises !== require('node:dns/promises')) replaceAll(dns.promises, 'node:dns.promises');
  for (const id of ['node:http', 'node:https']) {
    const agent = (require(id) as { globalAgent: Record<string, unknown> }).globalAgent;
    replaceAll(agent, `${id}.globalAgent`, ['createConnection', 'addRequest', 'createSocket']);
  }
  syncBuiltinESMExports();
}

type Kit = {
  connect: typeof import('../../../packages/mcp/test/connect').connect;
  afterCheck: typeof import('../../../packages/mcp/src/load').__afterCheckForTests;
  traps: typeof import('../mcp-traps').MCP_TRAPS;
};
let kit: Promise<Kit> | undefined;

/**
 * The server and its client, imported once the guard is in. Anything tried while they load is a
 * guard failure, reported with every answer from then on. (`probeFirst`, the guard's own test,
 * tries each kind of call there, in a new worker.)
 */
function mcpKit(probeFirst: boolean): Promise<Kit> {
  guardNetwork();
  kit ??= (async () => {
    tried.length = 0;
    if (probeFirst) await probe();
    const [connected, load, traps] = await Promise.all([
      import('../../../packages/mcp/test/connect'),
      import('../../../packages/mcp/src/load'),
      import('../mcp-traps'),
    ]);
    for (const call of tried.splice(0)) guardFailures.push(`${call}, while the server loaded`);
    return {
      connect: connected.connect,
      afterCheck: load.__afterCheckForTests,
      traps: traps.MCP_TRAPS,
    };
  })();
  return kit;
}

async function runMcp(job: McpJob): Promise<Omit<Answer, 'ms' | 'kept'>> {
  tried.length = 0;
  const { connect, afterCheck, traps } = await mcpKit(job.probeFirst === true);
  if (job.swap) {
    // The trap's setup is made again (the same files) for its swap, which runs here, once.
    let swap = traps.find((trap) => trap.id === job.swap)?.setup(job.dir).swap;
    if (!swap) throw new Error(`no swap for ${job.swap}`);
    afterCheck(() => {
      const once = swap;
      swap = undefined;
      once?.();
    });
  }
  const server = await connect({ folders: job.folders });
  const call = async (tool: ToolName, args: object): Promise<McpResult> => {
    try {
      const result = await server.call(tool, args);
      const first = result.content[0] as { text?: string } | undefined;
      return {
        isError: result.isError === true,
        text: first?.text ?? '',
        ...(result.structuredContent
          ? { structured: result.structuredContent as Record<string, unknown> }
          : {}),
      };
    } catch (error) {
      return {
        isError: true,
        text: error instanceof Error ? error.message : String(error),
        threw: true,
      };
    }
  };
  try {
    let args = job.args;
    if (job.cursorFrom) {
      const first = await call(job.cursorFrom.tool, job.cursorFrom.args);
      const next = first.structured?.next;
      if (typeof next !== 'string') throw new Error('the first call gave no cursor');
      args = { ...args, cursor: next };
    }
    const results: McpResult[] = [];
    for (const each of job.calls ?? [args]) {
      let result = await call(job.tool, each);
      results.push(result);
      for (let page = 0; job.pages && page < 1_000; page++) {
        const next = result.structured?.next;
        if (result.isError || typeof next !== 'string') break;
        result = await call(job.tool, { ...each, cursor: next });
        results.push(result);
      }
    }
    if (job.probe) await probe();
    return {
      happened: { kind: 'refused', message: '' },
      mcp: { results, calls: [...tried], guard: [...guardFailures] },
    };
  } finally {
    afterCheck(undefined);
    await server.close();
  }
}

/** Parts, chapters, and sections in a tree, counted. */
function shapeOf(nodes: ReturnType<typeof novelStructure>['nodes']) {
  const shape = { parts: 0, chapters: 0, sections: 0 };
  const stack = [...nodes];
  for (let node = stack.pop(); node; node = stack.pop()) {
    shape[node.kind === 'part' ? 'parts' : node.kind === 'chapter' ? 'chapters' : 'sections']++;
    for (const child of node.children) stack.push(child);
  }
  return shape;
}

/** A text's non-blank lines, split on `\n` only (a `\r` stays on its line), sorted: a multiset. */
const linesOf = (t: string) =>
  t
    .split('\n')
    .filter((line) => line.trim() !== '')
    .sort();

/**
 * A Markdown file read as a novel: its structure, its kept facts, and one move of the first node
 * that has a legal target (down, else up; a chapter inside a part counts). The move must keep every
 * non-blank line (compared on `\n` only, so a CRLF file keeps its `\r`), keep a CRLF file's line
 * breaks all CRLF, and leave the metadata comment as it was, last. Tried on the text Open makes and,
 * if it has other line breaks, on the raw text. Reports the structure it found in Open's text.
 */
function readNovel(bytes: Uint8Array): { happened: Happened; novel?: NovelReport } {
  const text = decoded(bytes);
  if (typeof text !== 'string') return { happened: text };
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const report: NovelReport = { parts: 0, chapters: 0, sections: 0, moved: false };
  for (const each of text === raw ? [text] : [text, raw]) {
    const tree = novelStructure(each);
    orphanedFacts(readFacts(each), tree);
    if (each === text) Object.assign(report, shapeOf(tree.nodes));
    const order: ReturnType<typeof novelStructure>['nodes'] = [];
    const stack = [...tree.nodes].reverse();
    for (let node = stack.pop(); node; node = stack.pop()) {
      order.push(node);
      for (let k = node.children.length - 1; k >= 0; k--) stack.push(node.children[k] as never);
    }
    let moved: string | null = null;
    for (const node of order) {
      const target = downTarget(tree, node.id) ?? upTarget(tree, node.id);
      const move = target ? moveNode(each, tree, node.id, target) : null;
      if (!move) continue;
      moved = each;
      for (const change of [...move.changes].reverse())
        moved = moved.slice(0, change.from) + change.insert + moved.slice(change.to);
      break;
    }
    if (moved === null) {
      if (report.moved) throw new Error('the raw text could not be moved as Open\u2019s text was');
      continue;
    }
    if (each === text) report.moved = true;
    const before = linesOf(each);
    const after = linesOf(moved);
    if (before.length !== after.length || before.some((line, i) => line !== after[i]))
      throw new Error('a move changed the lines of the book');
    if (each.includes('\r\n') && /(^|[^\r])\n/.test(moved))
      throw new Error('a move broke a CRLF line break');
    const wasMeta = findMarkdownMeta(each);
    const nowMeta = findMarkdownMeta(moved);
    if (wasMeta) {
      if (
        !nowMeta ||
        each.slice(wasMeta.from, wasMeta.to) !== moved.slice(nowMeta.from, nowMeta.to)
      )
        throw new Error('a move changed the metadata comment');
      if (moved.slice(nowMeta.to).trim() !== '')
        throw new Error('the metadata comment is not last');
    }
  }
  return { happened: { kind: 'opened', text, message: '' }, novel: report };
}

const FONT_DIR = new URL('../../../packages/render-pdf/fonts/', import.meta.url);

/**
 * A novel's manuscript made as a PDF and as a Word file, as the app makes them: the Markdown read
 * with `parseMarkdown`, the details the trap gives resolved, the PDF in the real fonts. The PDF is
 * opened by a PDF reader (pdf.js); the Word file is unzipped and every part parsed as XML.
 */
async function makeManuscript(
  bytes: Uint8Array,
  given: Record<string, unknown> | undefined,
): Promise<{ happened: Happened; manuscript?: ManuscriptReport }> {
  // Not Open's check: a NUL can come into the editor by pasting, and the book must still be made.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const details = resolveDetails(text, 'Trap', (given ?? {}) as ManuscriptDetails);
  const ms = manuscriptOf(text, parseMarkdown(text), details);
  const files = MANUSCRIPT_FONT_FILES[ms.font];
  const fonts = Object.fromEntries(
    (['regular', 'italic', 'bold', 'boldItalic'] as const).map((face) => [
      face,
      new Uint8Array(readFileSync(new URL(files[face], FONT_DIR))),
    ]),
  ) as Parameters<typeof renderManuscriptPdf>[1]['fonts'];
  const pdf = await renderManuscriptPdf(ms, { fonts, paper: 'letter', lang: 'en-US' });
  if (new TextDecoder().decode(pdf.bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error('the PDF does not start with %PDF-');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: pdf.bytes.slice(),
    useSystemFonts: false,
    verbosity: 0,
  });
  const pdfPages = (await task.promise).numPages;
  await task.destroy();

  const docx = renderManuscriptDocx(ms, { paper: 'letter', lang: 'en-US' });
  const parser = new new JSDOM('').window.DOMParser();
  const report: ManuscriptReport = {
    pdfPages,
    badParts: [],
    parts: [],
    fldSimple: {},
    complexFields: 0,
  };
  for (const entry of listZip(docx)) {
    report.parts.push(entry.name);
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(await readEntry(docx, entry));
    if (parser.parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length)
      report.badParts.push(entry.name);
    const simple = xml.split('<w:fldSimple').length - 1;
    if (simple) report.fldSimple[entry.name] = simple;
    report.complexFields += xml.split('<w:instrText').length + xml.split('<w:fldChar').length - 2;
  }
  return { happened: { kind: 'opened', text, message: '' }, manuscript: report };
}

/**
 * A script's production block read as the web app reads it (use-production.ts): the block, then
 * the open set's baseline, decoded within its cap. The bytes are read whole, past Open's size check,
 * so a block past its own caps is tried on them. Locked only when both read.
 */
async function readLock(
  bytes: Uint8Array,
): Promise<{ happened: Happened; production: { read: boolean; locked: boolean } }> {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const production = readProduction(parse(text).meta);
  const baseline = production ? await decodeBaseline(production.baseline) : null;
  return {
    happened: { kind: 'opened', text, message: '' },
    production: { read: production !== null, locked: baseline !== null },
  };
}

async function work(job: Job): Promise<Omit<Answer, 'ms' | 'kept'>> {
  if (job.kind === 'production') return readLock(job.bytes);
  if (job.kind === 'mcp') return runMcp(job);
  if (job.kind === 'novel') return readNovel(job.bytes);
  if (job.kind === 'manuscript') return makeManuscript(job.bytes, job.details);
  if (job.kind === 'beside') return { happened: await readBeside(job.format, job.bytes) };
  if (job.kind === 'package') {
    const happened = await readPackage(job.format, job.bytes);
    if (!job.inert || happened.kind !== 'opened') return { happened };
    const html = exported(happened.text, job.format === 'markdown');
    return { happened, html, storyMap: storyMapOf(happened.text) };
  }
  if (job.kind === 'cli') {
    const cli = await drafter(job.cwd, job.args);
    return { happened: { kind: 'refused', message: '' }, cli };
  }
  const { modules, problems } = readModulesFolder(job.dir, [], currentWriter());
  return {
    happened:
      modules.length === 1
        ? { kind: 'opened', text: '', message: '' }
        : { kind: 'refused', message: problems.join(' ') },
  };
}

parentPort?.on('message', async (job: Job) => {
  try {
    gc();
    const before = used();
    const start = performance.now();
    const answer = await work(job);
    const ms = performance.now() - start;
    gc();
    parentPort?.postMessage({ ok: { ...answer, ms, kept: Math.max(0, used() - before) } });
  } catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.stack : String(error) });
  }
});
parentPort?.postMessage({ ready: true });
