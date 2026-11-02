// The trap documents through every entry point that runs in Node: each format's reader on its own
// (`package`), `drafter convert` and `drafter build`, and the desktop app's modules folder. Each
// trap runs in a worker thread (pool.ts), stopped at its time limit or when its heap passes the
// bound, so a hang or an unbounded parse fails its test rather than stalling the runner; the
// special files (pipes, devices, links) go to the built `drafter`, killed after 10 seconds. The
// web app's Open and the desktop app's open run in apps/web/test/trap-open.test.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { checkOutcome, checkRan, type Happened, PEAK_BOUND } from './check';
import { ENTRY_POINTS } from './entry-points';
import { TrapRunner } from './pool';
import { LIMIT_MS, type Outcome, TRAPS, type Trap, trapsFor, via } from './traps';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(ROOT, 'packages/cli/dist/index.js');
const posix = process.platform !== 'win32';

let tmp = '';
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'drafter-trap-'));
});
const runner = new TrapRunner();
afterAll(async () => {
  await runner.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** Runs a job for `trap` in the worker, within its limit and the peak bound. */
const ran = (trap: Trap, job: Parameters<TrapRunner['run']>[0]) =>
  runner.run(job, trap.limitMs ?? LIMIT_MS, PEAK_BOUND);

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

  test('a trap that never ends is stopped at its limit, and fails', async () => {
    const forever = TRAPS[0] as Trap;
    const stopped = await runner.run(
      { kind: 'package', format: 'forever', bytes: new Uint8Array(), inert: false },
      200,
      PEAK_BOUND,
    );
    expect(stopped.timedOut ?? stopped.error, forever.id).toBeTruthy();
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

/**
 * Reads Drafter's HTML export of a hostile text back (made in the worker, worker/run.ts): nothing
 * in it may be live but Drafter's own one script and the inert block that carries the source.
 */
function expectInert(trap: Trap, html: string) {
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

/**
 * Reads a story map of a hostile text back (worker/run.ts, and `drafter build --story-map`): it
 * has no script at all, nothing that loads or embeds, no event handler or style attribute, no
 * link but to its own parts or a `mailto:`, and one `h1`.
 */
function expectInertStoryMap(trap: Trap, html: string) {
  const { document } = new JSDOM(html).window;
  for (const tag of [
    'script',
    'iframe',
    'object',
    'embed',
    'img',
    'form',
    'base',
    'link',
    'foreignObject',
  ]) {
    expect(document.getElementsByTagName(tag).length, `${trap.id}: story map <${tag}>`).toBe(0);
  }
  expect(document.querySelectorAll('meta[http-equiv="refresh" i]').length, trap.id).toBe(0);
  for (const el of document.querySelectorAll('*')) {
    for (const attr of el.getAttributeNames()) {
      expect(/^on/i.test(attr), `${trap.id}: story map ${el.tagName} ${attr}`).toBe(false);
      expect(attr.toLowerCase(), `${trap.id}: story map ${el.tagName}`).not.toBe('style');
      if (attr === 'href' || attr === 'xlink:href') {
        const value = el.getAttribute(attr) ?? '';
        expect(/^(?:#|mailto:)/.test(value), `${trap.id}: story map ${attr}=${value}`).toBe(true);
      }
    }
  }
  expect(document.querySelectorAll('h1').length, `${trap.id}: story map h1`).toBe(1);
}

/**
 * What the story-map traps say they test, checked in the page's text: the hostile file's logline,
 * contact, and edited hook are there as words, and the huge name is drawn whole.
 */
function expectStoryMapWords(trap: Trap, html: string) {
  // The page keeps a line's last words together with no-break spaces.
  const text = (new JSDOM(html).window.document.body.textContent ?? '').replace(/\u00a0/g, ' ');
  if (trap.id === 'fountain-story-map-hostile') {
    // Its U+2028 stays in it, as the writer's.
    expect(text, 'logline').toContain(
      'A keeper writes </style> on the lamp\u2028and nobody minds.',
    );
    expect(text, 'contact').toContain('wren@example.com </title><script>alert(1)</script>');
    expect(text, 'edited hook').toContain('a ringer who writes </text><script>alert(1)</script>');
  }
  if (trap.id === 'fountain-story-map-huge-name') {
    expect(/QUILL(?:LONGNAME){12500}/i.test(text), 'the whole name').toBe(true);
  }
}

// The `package` entry point decodes the bytes with the worker's own `decoded()`, a copy of Open's
// rules, so each reader is tried on its own; the app's real decoding and routing are what
// `web-open` and `desktop-open` run (apps/web/test/trap-open.test.ts).
describe('package: each format’s reader on its own', () => {
  test.each(trapsFor('package').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    const bytes = trap.bytes?.() as Uint8Array;
    const job = { kind: 'package', format: trap.format, bytes, inert: !!trap.inert } as const;
    const answer = checkRan(trap, bytes.length, await ran(trap, job), 'package');
    const outcome = trap.expect.package;
    if (!outcome) throw new Error('no outcome');
    // The reader for HTML and EPUB returns no words; the app's are compared for those.
    checkOutcome(trap, outcome, answer.happened, 'package');
    if (answer.html) expectInert(trap, answer.html);
    if (trap.inert && answer.happened.kind === 'opened') {
      expect(answer.storyMap, `${trap.id}: a story map`).toBeTypeOf('string');
      expectInertStoryMap(trap, answer.storyMap as string);
      expectStoryMapWords(trap, answer.storyMap as string);
    }
  });
});

// ---- The command line ----------------------------------------------------------------------------

interface CliRun {
  code: number;
  out: string;
  err: string;
}

/** The built `drafter`, for the special files: a separate process, killed after 10 seconds. */
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

/** `drafter` with `args`: in the worker for a trap's own file, the built one for a special file. */
async function drafter(trap: Trap, cwd: string, args: string[], where: string): Promise<CliRun> {
  if (trap.place) {
    const start = performance.now();
    const result = drafterBinary(cwd, args);
    expect(performance.now() - start, `${trap.id} at ${where}`).toBeLessThan(
      trap.limitMs ?? LIMIT_MS,
    );
    return result;
  }
  const answer = checkRan(trap, sizeOf(trap), await ran(trap, { kind: 'cli', cwd, args }), where);
  return answer.cli as CliRun;
}

describe('cli-convert: drafter convert', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error('The CLI is not built. Run `pnpm -r build` first.');
  });

  test.for(trapsFor('cli-convert').map((t) => [t.id, t] as const))(
    '%s',
    async ([, trap], { skip }) => {
      if (trap.place && !posix) skip('a special file of POSIX’s');
      const path = onDisk(trap, 'convert');
      const dir = join(path, '..');
      const outDir = join(dir, 'out');
      const name = path.slice(dir.length + 1);
      const { out, err } = await drafter(
        trap,
        dir,
        ['convert', '--out', outDir, '--', name],
        'cli-convert',
      );
      const converted = / → (.+?)(?: \((\d+ items? came in as (?:a )?notes?)\))?$/m.exec(out);
      let happened: Happened;
      if (converted) {
        const target = resolve(dir, converted[1] as string);
        happened = {
          kind: 'opened',
          text: readFileSync(target, 'utf8')
            .replace(/^\uFEFF/, '')
            .replace(/\r\n?/g, '\n'),
          message: converted[2] ?? '',
        };
      } else happened = { kind: 'refused', message: `${out}${err}` };
      checkOutcome(trap, trap.expect['cli-convert'] as never, happened, 'cli-convert');
    },
  );
});

describe('cli-build: drafter build', () => {
  test.for(trapsFor('cli-build').map((t) => [t.id, t] as const))(
    '%s',
    async ([, trap], { skip }) => {
      if (trap.place && !posix) skip('a special file of POSIX’s');
      const path = onDisk(trap, 'build');
      const dir = join(path, '..');
      const name = path.slice(dir.length + 1);
      // A hostile text's story map is written too, and read back for anything live.
      const map = trap.inert ? join(tmp, `${trap.id}.map.html`) : null;
      const args = ['build', '--txt', join(tmp, `${trap.id}.txt`)];
      if (map) args.push('--story-map', map);
      args.push('--', name);
      const { code, err } = await drafter(trap, dir, args, 'cli-build');
      const outcome = trap.expect['cli-build'];
      if (!outcome) throw new Error('no outcome');
      if (map && code === 0) expectInertStoryMap(trap, readFileSync(map, 'utf8'));
      // `build` lays the script out rather than showing its text: whether it was built is compared.
      if (outcome.kind === 'refused') {
        expect(code, `${trap.id} at cli-build: should be refused`).not.toBe(0);
        expect(err, trap.id).toContain(outcome.says);
      } else expect(code, `${trap.id} at cli-build: ${err}`).toBe(0);
    },
  );
});

// ---- The desktop app's modules folder ------------------------------------------------------------

describe('desktop-modules: the modules folder', () => {
  test.for(trapsFor('desktop-modules').map((t) => [t.id, t] as const))(
    '%s',
    async ([, trap], { skip }) => {
      if (!posix) skip('the folder’s permissions are checked as POSIX’s');
      const modules = join(tmp, `${trap.id}-modules`);
      const folder = join(modules, 'trap-module');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'index.js'), 'export default {};\n');
      if (trap.place) trap.place(folder);
      else writeFileSync(join(folder, 'module.json'), trap.bytes?.() ?? new Uint8Array());
      const answer = checkRan(
        trap,
        sizeOf(trap),
        await ran(trap, { kind: 'modules', dir: modules }),
        'desktop-modules',
      );
      checkOutcome(
        trap,
        trap.expect['desktop-modules'] as never,
        answer.happened,
        'desktop-modules',
      );
    },
  );
});

// ---- Drafts and cuts read back from beside the work -------------------------------------------

describe('beside-read: drafts and cuts beside the work', () => {
  test.each(trapsFor('beside-read').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    const bytes = trap.bytes?.() as Uint8Array;
    const job = { kind: 'beside', format: trap.format, bytes } as const;
    const answer = checkRan(trap, bytes.length, await ran(trap, job), 'beside-read');
    checkOutcome(trap, trap.expect['beside-read'] as Outcome, answer.happened, 'beside-read');
  });
});
