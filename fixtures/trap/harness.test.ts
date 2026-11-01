// The trap documents through every entry point that runs in Node: each format's reader on its own
// (`package`), `drafter convert` and `drafter build` (in process, and the built `drafter` for the
// special files, where a hang would otherwise hang the test runner), and the desktop app's modules
// folder. The web app's Open and the desktop app's open run in apps/web/test/trap-open.test.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { paginate } from '@drafter/layout';
import { NestedTooDeeply, parseMarkdown } from '@drafter/markdown';
import { renderDocumentHtml, renderScriptHtml } from '@drafter/render-html-file';
import { builtins, type Template } from '@drafter/templates';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { currentWriter, readModulesFolder } from '../../apps/desktop/src/module-folder';
import { checkCost, checkOutcome, type Happened, measured } from './check';
import { ENTRY_POINTS } from './entry-points';
import { type Outcome, TRAPS, type Trap, trapsFor, via } from './traps';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(ROOT, 'packages/cli/dist/index.js');
const posix = process.platform !== 'win32';

let tmp = '';
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'drafter-trap-'));
});
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** A folder of the trap's own, holding its file (or its special file); the file's path. */
function onDisk(trap: Trap, entry: string): string {
  const dir = join(tmp, `${trap.id}-${entry}`);
  mkdirSync(dir, { recursive: true });
  if (trap.place) return trap.place(dir);
  const path = join(dir, trap.name);
  writeFileSync(path, trap.bytes?.() ?? new Uint8Array());
  return path;
}

const sizeOf = (trap: Trap) => (trap.bytes ? trap.bytes().length : 0);

// ---- The manifest itself ------------------------------------------------------------------------

describe('the manifest', () => {
  test('every trap has a unique id, a sentence of what it tests, and at least one entry point', () => {
    const ids = TRAPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const trap of TRAPS) {
      expect(trap.tests.length, trap.id).toBeGreaterThan(20);
      expect(via(trap).length, trap.id).toBeGreaterThan(0);
      expect(!!trap.bytes !== !!trap.place, `${trap.id}: bytes or a place, not both`).toBe(true);
      for (const entry of via(trap)) {
        expect(
          ENTRY_POINTS.some((e) => e.id === entry),
          `${trap.id}: ${entry}`,
        ).toBe(true);
      }
    }
  });

  test('the generator is deterministic: the same bytes every time', () => {
    for (const trap of TRAPS.filter((t) => t.bytes && !t.large)) {
      const a = trap.bytes?.() as Uint8Array;
      const b = trap.bytes?.() as Uint8Array;
      expect(Buffer.from(a).equals(Buffer.from(b)), trap.id).toBe(true);
    }
  });

  test('memory is measured as what a trap keeps: the runner exposes gc', () => {
    expect(typeof (globalThis as { gc?: unknown }).gc).toBe('function');
  });

  test('MANIFEST.md is the manifest, as a table for each format', async () => {
    await expect(manifestMarkdown()).toMatchFileSnapshot('./MANIFEST.md');
  });

  test('the docs give the number of traps there are', () => {
    for (const doc of [
      'README.md',
      'fixtures/trap/README.md',
      'apps/web/app/about/tech.ts',
      'docs/technical-details.md',
    ]) {
      const text = readFileSync(join(ROOT, doc), 'utf8');
      expect(text.includes(`${TRAPS.length} `), `${doc} says ${TRAPS.length}`).toBe(true);
    }
  });

  test('TRAP_OUT=<folder> writes every trap to that folder, to open by hand', () => {
    const out = process.env.TRAP_OUT;
    if (!out) return;
    for (const trap of TRAPS) {
      if (!trap.bytes) continue;
      const dir = join(out, trap.format);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${trap.id}--${trap.name}`), trap.bytes());
    }
  });

  test('every committed fixture is small, and every one is a trap', () => {
    const files = new URL('./files/', import.meta.url);
    const listed = spawnSync('git', ['ls-files', '--others', '--cached', '--exclude-standard'], {
      cwd: fileURLToPath(files),
      encoding: 'utf8',
    }).stdout.trim();
    const found = listed.split('\n').filter(Boolean);
    expect(found.length).toBeGreaterThan(20);
    const source = readFileSync(new URL('./traps.ts', import.meta.url), 'utf8');
    for (const name of found) {
      expect(readFileSync(new URL(name, files)).length, name).toBeLessThan(50 * 1024);
      expect(source.includes(`'${name}'`), `${name} is used by a trap`).toBe(true);
    }
  });
});

/** An outcome in a few words, for the table. */
function said(outcome: Outcome): string {
  const quoted = (text: string) => (text === '' ? '(nothing said)' : `“${text}”`);
  if (outcome.kind === 'refused') return `refused: ${quoted(outcome.says)}`;
  const shown =
    outcome.text !== undefined
      ? outcome.text.length > 60
        ? `${outcome.text.length} characters, exactly`
        : 'exactly its text'
      : outcome.chars !== undefined
        ? `${outcome.chars} characters`
        : outcome.lines?.length
          ? `with ${outcome.lines.length} key line${outcome.lines.length === 1 ? '' : 's'}`
          : '';
  const head = outcome.kind === 'opens' ? 'opens' : `opens with a warning: ${quoted(outcome.says)}`;
  return shown ? `${head}, ${shown}` : head;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The manifest as Markdown: one table for each format, every trap with its outcome at each entry point. */
function manifestMarkdown(): string {
  const formats = [...new Set(TRAPS.map((t) => t.format))];
  const out = [
    '# The trap documents: manifest',
    '',
    'Generated from `traps.ts` by `harness.test.ts` (run `pnpm vitest run --project trap -u` after changing a trap). Each row is one file; each entry point it goes through has the outcome it must give. See README.md for the entry points.',
    '',
    `${TRAPS.length} traps: ${formats.map((f) => `${f} ${TRAPS.filter((t) => t.format === f).length}`).join(', ')}.`,
    '',
  ];
  for (const format of formats) {
    out.push(
      `## ${format}`,
      '',
      '| id | file | what it tests | entry points and outcomes |',
      '| --- | --- | --- | --- |',
    );
    for (const trap of TRAPS.filter((t) => t.format === format)) {
      const outcomes = via(trap)
        .map((entry) => `**${entry}**: ${said(trap.expect[entry] as Outcome)}`)
        .join('<br>');
      out.push(
        `| \`${trap.id}\` | \`${cell(trap.name)}\`${trap.large ? ' (generated, large)' : ''} | ${cell(trap.tests)} | ${cell(outcomes)} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

// ---- Package level -------------------------------------------------------------------------------

/** Text as Open decodes it: not UTF-16, no NUL in the first 8 KB, strict UTF-8, a BOM off, line breaks as `\n`. */
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

async function readPackage(trap: Trap, bytes: Uint8Array): Promise<Happened> {
  const refusedBy = (error: unknown): Happened => {
    if (
      error instanceof FdxError ||
      error instanceof ArchiveError ||
      error instanceof NestedTooDeeply
    )
      return { kind: 'refused', message: error.message };
    throw error;
  };
  switch (trap.format) {
    case 'fountain': {
      const text = decoded(bytes);
      if (typeof text !== 'string') return text;
      const doc = parse(text);
      expect(doc.source, trap.id).toBe(text);
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
        const result = await (trap.format === 'highland' ? fromHighland(bytes) : fromFadeIn(bytes));
        return { kind: 'opened', text: result.text, message: noted(result.mapped) };
      } catch (error) {
        return refusedBy(error);
      }
    case 'html':
    case 'epub': {
      // Bigger than the cap is refused before the reader (Open's own check); the reader's null
      // carries no words, so the app's are used for the comparison.
      const found = await embeddedSource(bytes);
      const what = trap.format === 'html' ? 'a web page' : 'an e-book';
      if (bytes.length > 32 * 1024 * 1024)
        return { kind: 'refused', message: 'too big to open (over 32 MB)' };
      if (!found) return { kind: 'refused', message: `Drafter can’t open ${what}` };
      const text = decoded(found.bytes);
      return typeof text === 'string' ? { kind: 'opened', text, message: '' } : text;
    }
    default:
      throw new Error(`${trap.id}: no reader for ${trap.format}`);
  }
}

const FONTS = Object.fromEntries(
  (['regular', 'bold', 'italic', 'boldItalic'] as const).map((style, i) => [
    style,
    new Uint8Array([0, 1, 0, 0, i]),
  ]),
);

/** Drafter's HTML export of opened text, as a writer would make it (notes and source included). */
function exported(text: string, markdown: boolean): string {
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
}

/**
 * Writes opened text into Drafter's HTML export and reads it back: nothing in it may be live but
 * Drafter's own one script and the inert block that carries the source.
 */
function expectInert(trap: Trap, text: string, markdown: boolean) {
  let html: string;
  try {
    html = exported(text, markdown);
  } catch (error) {
    // The export refuses a tree nested past its own limit, in words: nothing is written at all.
    if (error instanceof RangeError && /nested too deeply/.test(error.message)) return;
    throw error;
  }
  const { document } = new JSDOM(html).window;
  const scripts = [...document.querySelectorAll('script')];
  // Drafter's own: the one in the head, and the source block (text/plain, never run).
  expect(scripts.length, trap.id).toBe(2);
  expect(scripts[0]?.parentElement?.tagName, trap.id).toBe('HEAD');
  expect(scripts[1]?.getAttribute('type'), trap.id).toBe('text/plain');
  expect(scripts[1]?.id, trap.id).toBe('drafter-source');
  for (const tag of ['iframe', 'object', 'embed', 'img', 'svg', 'form', 'base', 'link']) {
    expect(document.querySelectorAll(tag).length, `${trap.id}: <${tag}>`).toBe(0);
  }
  expect(document.querySelectorAll('meta[http-equiv="refresh"]').length, trap.id).toBe(0);
  for (const el of document.querySelectorAll('*')) {
    for (const attr of el.getAttributeNames()) {
      expect(/^on/i.test(attr), `${trap.id}: ${el.tagName} ${attr}`).toBe(false);
      const value = el.getAttribute(attr) ?? '';
      if (['href', 'src', 'action', 'xlink:href'].includes(attr)) {
        expect(
          /^\s*(?:javascript|data|vbscript):/i.test(value),
          `${trap.id}: ${attr}=${value}`,
        ).toBe(false);
      }
    }
  }
}

describe('package: each format’s reader on its own', () => {
  test.each(trapsFor('package').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    const bytes = trap.bytes?.() as Uint8Array;
    const cost = await measured(() => readPackage(trap, bytes));
    const outcome = trap.expect.package;
    if (!outcome) throw new Error('no outcome');
    // The reader for HTML and EPUB returns no words; the app's are compared for those.
    checkOutcome(trap, outcome, cost.value, 'package');
    checkCost(trap, bytes.length, cost, 'package');
    if (trap.inert && cost.value.kind === 'opened') {
      const markdown = trap.format === 'markdown';
      expectInert(trap, cost.value.text, markdown);
    }
  });
});

// ---- The command line ----------------------------------------------------------------------------

interface CliRun {
  code: number;
  out: string;
  err: string;
}

async function drafter(cwd: string, args: string[]): Promise<CliRun> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (data) => out.push(typeof data === 'string' ? data : new TextDecoder().decode(data)),
    err: (text) => err.push(text),
    cwd,
  });
  return { code, out: out.join(''), err: err.join('') };
}

/** The built `drafter`, for the files that could hang it: killed after 10 seconds. */
function drafterBinary(cwd: string, args: string[]): CliRun {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.signal) return { code: -1, out: result.stdout, err: `killed by ${result.signal}` };
  return { code: result.status ?? -1, out: result.stdout, err: result.stderr };
}

describe('cli-convert: drafter convert', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error('The CLI is not built. Run `pnpm -r build` first.');
  });

  test.each(trapsFor('cli-convert').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    if (trap.place && !posix) return;
    const path = onDisk(trap, 'convert');
    const dir = join(path, '..');
    const outDir = join(dir, 'out');
    const name = path.slice(dir.length + 1);
    const cost = await measured(async () =>
      trap.format === 'files'
        ? drafterBinary(dir, ['convert', '--out', outDir, '--', name])
        : drafter(dir, ['convert', '--out', outDir, name]),
    );
    const { out } = cost.value;
    const converted = / → (.+?)(?: \((\d+ items? came in as (?:a )?notes?)\))?$/m.exec(out);
    let happened: Happened;
    if (converted) {
      const target = resolve(dir, converted[1] as string);
      happened = {
        kind: 'opened',
        text: readFileSync(target, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n'),
        message: converted[2] ?? '',
      };
    } else happened = { kind: 'refused', message: `${out}${cost.value.err}` };
    checkOutcome(trap, trap.expect['cli-convert'] as never, happened, 'cli-convert');
    checkCost(trap, trap.bytes ? sizeOf(trap) : 0, cost, 'cli-convert');
  });
});

describe('cli-build: drafter build', () => {
  test.each(trapsFor('cli-build').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    if (trap.place && !posix) return;
    const path = onDisk(trap, 'build');
    const dir = join(path, '..');
    const name = path.slice(dir.length + 1);
    const args = ['build', '--txt', join(tmp, `${trap.id}.txt`), '--', name];
    const cost = await measured(async () =>
      trap.format === 'files' ? drafterBinary(dir, args) : drafter(dir, args),
    );
    const { code, err } = cost.value;
    const outcome = trap.expect['cli-build'];
    if (!outcome) throw new Error('no outcome');
    // `build` lays the script out rather than showing its text: whether it was built is compared.
    if (outcome.kind === 'refused') {
      expect(code, `${trap.id} at cli-build: should be refused`).not.toBe(0);
      expect(err, trap.id).toContain(outcome.says);
    } else expect(code, `${trap.id} at cli-build: ${err}`).toBe(0);
    checkCost(trap, trap.bytes ? sizeOf(trap) : 0, cost, 'cli-build');
  });
});

// ---- The desktop app's modules folder ------------------------------------------------------------

describe('desktop-modules: the modules folder', () => {
  test.each(trapsFor('desktop-modules').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    if (!posix) return;
    const modules = join(tmp, `${trap.id}-modules`);
    const folder = join(modules, 'trap-module');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'index.js'), 'export default {};\n');
    if (trap.place) trap.place(folder);
    else writeFileSync(join(folder, 'module.json'), trap.bytes?.() ?? new Uint8Array());
    const cost = await measured(async () => readModulesFolder(modules, [], currentWriter()));
    const { modules: loaded, problems } = cost.value;
    const happened: Happened =
      loaded.length === 1
        ? { kind: 'opened', text: '', message: '' }
        : { kind: 'refused', message: problems.join(' ') };
    checkOutcome(trap, trap.expect['desktop-modules'] as never, happened, 'desktop-modules');
    checkCost(trap, trap.bytes ? sizeOf(trap) : 0, cost, 'desktop-modules');
  });
});
