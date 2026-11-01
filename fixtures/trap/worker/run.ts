// The worker a trap runs in (pool.ts): Node alone, with hooks.mjs resolving the packages to their
// source as the tests do. A trap that loops or grows without end is stopped from outside, by
// `terminate()`, which no in-process timeout can do to synchronous code. Each job is one trap at
// one entry point; the answer is what happened, how long it took, and what it kept once garbage
// is collected.

import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { parentPort } from 'node:worker_threads';
import {
  ArchiveError,
  embeddedSource,
  fromFadeIn,
  fromHighland,
  isUtf16,
  SNIFF_BYTES,
} from '@drafter/archive';
import { run } from '@drafter/cli';
import { FdxError, fromFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { mergeCuts } from '@drafter/history';
import { paginate } from '@drafter/layout';
import { NestedTooDeeply, parseMarkdown } from '@drafter/markdown';
import { renderDocumentHtml, renderScriptHtml } from '@drafter/render-html-file';
import { builtins, type Template } from '@drafter/templates';
import { currentWriter, readModulesFolder } from '../../../apps/desktop/src/module-folder';
import { readCutsBytes, readDraftBytes, skippedLine } from '../../../apps/web/app/beside/read';
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
  | { kind: 'beside'; format: string; bytes: Uint8Array };

export interface Answer {
  happened: Happened;
  /** For `cli`: the exit code and what it printed. */
  cli?: { code: number; out: string; err: string };
  /** Drafter's HTML export of the opened text, for an inert trap; null when the export refuses it. */
  html?: string | null;
  ms: number;
  kept: number;
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
    error instanceof NestedTooDeeply
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
        if (!(error instanceof NestedTooDeeply)) throw error;
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
 * The app's reading of a file beside the work (apps/web/app/beside/read.ts): a cuts file's entries
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

async function work(job: Job): Promise<Omit<Answer, 'ms' | 'kept'>> {
  if (job.kind === 'beside') return { happened: await readBeside(job.format, job.bytes) };
  if (job.kind === 'package') {
    const happened = await readPackage(job.format, job.bytes);
    if (!job.inert || happened.kind !== 'opened') return { happened };
    return { happened, html: exported(happened.text, job.format === 'markdown') };
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
