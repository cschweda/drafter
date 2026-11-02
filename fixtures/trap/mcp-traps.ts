// The traps of the `mcp` entry point's own (Drafter for Claude, packages/mcp): paths a tool is
// given that must never reach a file outside the writer's folder, or anything but a regular file,
// and sizes that must come back in pages under the cap. Every other trap goes through the server
// too, with the outcome it already has (traps.ts, harness.test.ts). Each trap makes its files in
// `dir`: the writer's folder is `dir/Scripts` (the only folder the server is given), and anything
// outside it is in `dir/outside`. All text here is the suite's own.

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ToolName } from '../../packages/mcp/src/tools/index';
import { trapZip } from './zip';

export interface McpTrap {
  id: string;
  /** What it tests, in a sentence. */
  tests: string;
  /**
   * Makes its files in `dir`; the path the tool is given, and, for the swap, what the read meets.
   * Must be idempotent: the worker runs a swap trap's setup again on the same folder to get its
   * `swap` (a function can't be sent to it), so it may only write the same files again.
   */
  setup(dir: string): { path: string; swap?: () => void };
  tool: ToolName;
  args(path: string): object;
  /**
   * `refused`: every call is refused, its message matching (on this system); `ok`: the last
   * page's answer (or, for a trap that pages, every page's, in order, as `{ pages }`) is checked.
   */
  expect: { refused: RegExp } | { ok: (result: object) => void };
  /** Refused by the tool's schema, in the SDK's own plain words, not Drafter's envelope. */
  sdk?: boolean;
  /** What `pathProblem(path, 'win32')` must say, checked on every system (Windows's own names). */
  windows?: RegExp;
  /** A call made first whose `next` is the main call's cursor (a cursor from another file). */
  cursorFrom?(path: string): { tool: ToolName; args: object };
  /** Follow each answer's `next` until there is none: the trap reads the whole thing, page by page. */
  pages?: boolean;
  /** Each call's arguments, in turn, in place of `args` (scenes 1–10, 11–20, …). */
  calls?(path: string): object[];
  /** POSIX only: a link, a pipe, a socket, or a device. */
  posix?: boolean;
  /** The time the whole job may take, in ms (default the suite's LIMIT_MS). */
  limitMs?: number;
}

/** The writer's folder, as the server names it, and as made on disk. */
export const FOLDER = 'Scripts';
export const folderIn = (dir: string) => join(dir, FOLDER);

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

const SMALL = 'Title: The Lamp Room\n\nINT. LAMP ROOM - NIGHT\n\nA keeper trims the wick.\n';
const SECRET = 'Title: Not Yours\n\nINT. VAULT - NIGHT\n\nOUTSIDE-THE-FOLDER-MARKER\n';

/** The folder with one small script in it, and a script outside it. */
function base(dir: string): void {
  put(join(folderIn(dir), 'lamp.fountain'), SMALL);
  put(join(dir, 'outside', 'secret.fountain'), SECRET);
}

const at = (dir: string, ...parts: string[]) => join(folderIn(dir), ...parts);

const PARTS = /A path can’t have an empty part, “\.”, or “\.\.”\./;
const ABSOLUTE = /not a full path/;
const OUTSIDE = /^That file is outside the folders Drafter for Claude may read\.$/;

/** `read_scene`'s first scene of `path`: the call most traps make. */
const readFirst = (path: string) => ({ script: path, scene: '1' });

/** A 300-scene script: each scene a heading and a few lines, with a marker naming the scene. */
export function longScript(scenes: number): string {
  const out = ['Title: The Long Night', ''];
  for (let n = 1; n <= scenes; n++) {
    out.push(
      `INT. ROOM ${n} - NIGHT`,
      '',
      `MARKER-${n}-START. A keeper climbs to the lamp for the ${n}th time, counting the steps.`,
      '',
      'WREN',
      `The lamp is lit, and the ships see it. Number ${n}, and still burning.`,
      '',
      `The stairs creak under her as she goes down. MARKER-${n}-END.`,
      '',
    );
  }
  return out.join('\n');
}

const SPEECH_WORDS = 100_000;
const BELLS = 2_000;

/** Every page's answer, when the trap pages. */
type Pages = { pages: Array<Record<string, unknown>> };

export const MCP_PATH_TRAPS: readonly McpTrap[] = [
  {
    id: 'mcp-dotdot-first',
    tests: 'A path starting with “..” is refused by its text, before the disk is touched.',
    setup: (dir) => (base(dir), { path: '../outside/secret.fountain' }),
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: PARTS },
  },
  {
    id: 'mcp-dotdot-middle',
    tests: 'A “..” in the middle of a path (out and back in) is refused, not resolved.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/../${FOLDER}/lamp.fountain` }),
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: PARTS },
  },
  {
    id: 'mcp-dotdot-last',
    tests: 'A path ending in “..” is refused, whatever it would name.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/lamp.fountain/..` }),
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    expect: { refused: PARTS },
  },
  {
    id: 'mcp-absolute',
    tests:
      'A full path, even to a file inside the folder, is refused: paths start with a folder’s name.',
    setup: (dir) => (base(dir), { path: at(dir, 'lamp.fountain') }),
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: ABSOLUTE },
  },
  {
    id: 'mcp-link-file-out',
    tests:
      'A link in the folder to a file outside it is refused as outside, and nothing of the file is read.',
    setup: (dir) => {
      base(dir);
      symlinkSync(join(dir, 'outside', 'secret.fountain'), at(dir, 'out.fountain'));
      return { path: `${FOLDER}/out.fountain` };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: OUTSIDE },
    posix: true,
  },
  {
    id: 'mcp-link-folder-out',
    tests:
      'A link in the folder to a folder outside it is refused as outside for a file inside it.',
    setup: (dir) => {
      base(dir);
      symlinkSync(join(dir, 'outside'), at(dir, 'elsewhere'));
      return { path: `${FOLDER}/elsewhere/secret.fountain` };
    },
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    expect: { refused: OUTSIDE },
    posix: true,
  },
  {
    id: 'mcp-link-loop',
    tests: 'Two links that lead to each other are refused as a loop, without hanging.',
    setup: (dir) => {
      base(dir);
      symlinkSync('b.fountain', at(dir, 'a.fountain'));
      symlinkSync('a.fountain', at(dir, 'b.fountain'));
      return { path: `${FOLDER}/a.fountain` };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /is a loop of links/ },
    posix: true,
  },
  {
    id: 'mcp-folder-named-file',
    tests: 'A folder named like a script (“x.fountain”) is refused as a folder.',
    setup: (dir) => {
      base(dir);
      mkdirSync(at(dir, 'x.fountain'));
      return { path: `${FOLDER}/x.fountain` };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /is a folder, not a file/ },
  },
  {
    id: 'mcp-fifo',
    tests:
      'A named pipe called “pipe.fountain” is refused before it is opened, so nothing waits on it.',
    setup: (dir) => {
      base(dir);
      const done = spawnSync('mkfifo', [at(dir, 'pipe.fountain')]);
      if (done.status !== 0) throw new Error('mkfifo failed');
      return { path: `${FOLDER}/pipe.fountain` };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /isn’t a file/ },
    posix: true,
  },
  {
    id: 'mcp-socket',
    tests: 'A socket called “socket.fountain” is refused as not a file.',
    setup: (dir) => {
      base(dir);
      // A socket's path is short on some systems: made from inside the folder, by a relative name.
      const done = spawnSync(
        process.execPath,
        [
          '-e',
          "require('node:net').createServer().listen('socket.fountain', () => process.exit(0))",
        ],
        { cwd: folderIn(dir), timeout: 10_000 },
      );
      if (done.status !== 0) throw new Error('the socket wasn’t made');
      return { path: `${FOLDER}/socket.fountain` };
    },
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    expect: { refused: /isn’t a file/ },
    posix: true,
  },
  {
    id: 'mcp-dev-zero',
    tests: 'A link to /dev/zero (endless bytes) is refused as outside, and never read.',
    setup: (dir) => {
      base(dir);
      symlinkSync('/dev/zero', at(dir, 'zero.fountain'));
      return { path: `${FOLDER}/zero.fountain` };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: OUTSIDE },
    posix: true,
  },
  {
    id: 'mcp-swap',
    tests:
      'A file swapped for a link to a file outside, after its path is checked and before it is read, is refused: the read opens no link and only the file that was checked.',
    setup: (dir) => {
      base(dir);
      const path = put(at(dir, 'swap.fountain'), SMALL);
      return {
        path: `${FOLDER}/swap.fountain`,
        swap: () => {
          rmSync(path);
          symlinkSync(join(dir, 'outside', 'secret.fountain'), path);
        },
      };
    },
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /it is a link|it changed while it was being read/ },
    posix: true,
  },
  {
    id: 'mcp-windows-stream',
    tests:
      'A Windows stream (“a.fountain:x”) is refused on Windows for what it is, and names no file anywhere else.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/lamp.fountain:x` }),
    tool: 'read_scene',
    args: readFirst,
    windows: /names a stream inside a file/,
    expect: { refused: /names a stream inside a file|There’s no file at/ },
  },
  {
    id: 'mcp-windows-trailing-dot',
    tests:
      'A trailing dot (“lamp.fountain.”, which Windows reads as “lamp.fountain”) is refused on Windows, and names no file anywhere else.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/lamp.fountain.` }),
    tool: 'read_scene',
    args: readFirst,
    windows: /ends in a dot or a space/,
    expect: { refused: /ends in a dot or a space|There’s no file at/ },
  },
  {
    id: 'mcp-windows-drive-relative',
    tests: 'A drive-relative path (“C:lamp.fountain”) is refused as not starting with a folder.',
    setup: (dir) => (base(dir), { path: 'C:lamp.fountain' }),
    tool: 'read_scene',
    args: readFirst,
    windows: ABSOLUTE,
    expect: { refused: ABSOLUTE },
  },
  {
    id: 'mcp-windows-unc',
    tests: 'A UNC path (“\\\\server\\share\\…”) is refused as a full path, on every system.',
    setup: (dir) => (base(dir), { path: '\\\\server\\share\\lamp.fountain' }),
    tool: 'read_scene',
    args: readFirst,
    windows: ABSOLUTE,
    expect: { refused: ABSOLUTE },
  },
  {
    id: 'mcp-nul',
    tests: 'A NUL in a path (which C would end the name at) is refused by its text.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/lamp.fountain\0.txt` }),
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /a character no file name can hold/ },
  },
  {
    id: 'mcp-long-name',
    tests:
      'A 10,000-character name is refused by the tool’s schema (paths are at most 1,024 characters), in the SDK’s own words.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/${'x'.repeat(10_000)}.fountain` }),
    tool: 'read_scene',
    args: readFirst,
    expect: { refused: /Input validation error|Invalid arguments/i },
    sdk: true,
  },
  {
    id: 'mcp-cursor-other-file',
    tests:
      'A real cursor from another file’s overview, given for this file, starts this file from its beginning (restarted) and never reads the other.',
    setup: (dir) => {
      base(dir);
      put(at(dir, 'long.fountain'), longScript(300));
      return { path: `${FOLDER}/lamp.fountain` };
    },
    cursorFrom: () => ({
      tool: 'script_overview',
      args: { script: `${FOLDER}/long.fountain` },
    }),
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    expect: {
      ok: (result) => {
        const r = result as { restarted?: boolean; scenes?: Array<{ heading: string }> };
        strictEqual(r.restarted, true);
        deepStrictEqual(
          r.scenes?.map((s) => s.heading),
          ['INT. LAMP ROOM - NIGHT'],
        );
      },
    },
  },
  {
    id: 'mcp-cursor-forged',
    tests:
      'A forged cursor (a body that asks for scene 200, signed with a key the server never had) starts again from the beginning.',
    setup: (dir) => (base(dir), { path: `${FOLDER}/lamp.fountain` }),
    tool: 'read_scene',
    args: (path) => {
      const body = Buffer.from(
        JSON.stringify({ tool: 'read_scene', path: 'x', mtimeMs: 0, size: 0, args: 'x', at: 200 }),
      ).toString('base64url');
      return {
        script: path,
        scene: '1',
        cursor: `${body}.${Buffer.alloc(32, 7).toString('base64url')}`,
      };
    },
    expect: {
      ok: (result) => {
        const r = result as { restarted?: boolean; scenes: Array<{ n: number; text: string }> };
        strictEqual(r.restarted, true);
        deepStrictEqual(
          r.scenes.map((s) => s.n),
          [1],
        );
        ok(r.scenes[0]?.text?.includes('A keeper trims the wick.'), 'A keeper trims the wick.');
      },
    },
  },
];

/** Every page's answers, flattened: the `key` list of each. */
const all = <T>(pages: Pages['pages'], key: string) =>
  pages.flatMap((page) => (page[key] as T[] | undefined) ?? []);

export const MCP_SIZE_TRAPS: readonly McpTrap[] = [
  {
    id: 'mcp-300-scenes-overview',
    tests:
      'A 300-scene script’s overview comes in pages, every one under the cap, and together they name every scene once, in order.',
    setup: (dir) => ({
      path: (put(at(dir, 'long.fountain'), longScript(300)), `${FOLDER}/long.fountain`),
    }),
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    pages: true,
    expect: {
      ok: (result) => {
        const { pages } = result as Pages;
        ok(pages.length > 1);
        const scenes = all<{ n: number; heading: string }>(pages, 'scenes');
        deepStrictEqual(
          scenes.map((s) => s.n),
          Array.from({ length: 300 }, (_, i) => i + 1),
        );
        strictEqual(scenes[299]?.heading, 'INT. ROOM 300 - NIGHT');
      },
    },
    limitMs: 20_000,
  },
  {
    id: 'mcp-300-scenes-read',
    tests:
      'A 300-scene script read whole, ten scenes a call (1–10, 11–20, …) and each call’s pages followed: every page under the cap, every scene’s text whole.',
    setup: (dir) => ({
      path: (put(at(dir, 'long.fountain'), longScript(300)), `${FOLDER}/long.fountain`),
    }),
    tool: 'read_scene',
    args: readFirst,
    calls: (path) =>
      Array.from({ length: 30 }, (_, i) => ({
        script: path,
        scene: String(i * 10 + 1),
        through: String(i * 10 + 10),
      })),
    pages: true,
    expect: {
      ok: (result) => {
        const { pages } = result as Pages;
        const scenes = all<{ n: number; text: string }>(pages, 'scenes');
        const text = new Map<number, string>();
        for (const s of scenes) text.set(s.n, (text.get(s.n) ?? '') + s.text);
        deepStrictEqual(
          [...text.keys()],
          Array.from({ length: 300 }, (_, i) => i + 1),
        );
        for (const [n, body] of text) {
          ok(body?.includes(`MARKER-${n}-START.`), `MARKER-${n}-START.`);
          ok(body?.includes(`MARKER-${n}-END.`), `MARKER-${n}-END.`);
        }
      },
    },
    limitMs: 20_000,
  },
  {
    id: 'mcp-long-speech',
    tests:
      'A speech of 100,000 words comes back through character_lines in parts, every page under the cap, and every word of it is there.',
    setup: (dir) => {
      const words = Array.from({ length: SPEECH_WORDS }, (_, i) => `w${i}`).join(' ');
      put(
        at(dir, 'speech.fountain'),
        `Title: The Long Speech\n\nINT. HALL - DAY\n\nA keeper stands.\n\nWREN\n${words}\n\nPIM\nAre you done?\n`,
      );
      return { path: `${FOLDER}/speech.fountain` };
    },
    tool: 'character_lines',
    args: (path) => ({ script: path, character: 'wren' }),
    pages: true,
    expect: {
      ok: (result) => {
        const { pages } = result as Pages;
        ok(pages.length > 1);
        const speeches = all<{ lines: Array<{ kind: string; text: string; continues?: true }> }>(
          pages,
          'speeches',
        );
        // The parts joined: a line cut between parts carries on with `continues`.
        let text = '';
        for (const speech of speeches)
          for (const line of speech.lines)
            if (line.kind === 'dialogue')
              text += (line.continues || text === '' ? '' : '\n') + line.text;
        const words = text.split(/\s+/).filter(Boolean);
        strictEqual(words.length, SPEECH_WORDS);
        strictEqual(words[0], 'w0');
        strictEqual(words.at(-1), `w${SPEECH_WORDS - 1}`);
      },
    },
    limitMs: 20_000,
  },
  {
    id: 'mcp-search-every-word',
    tests:
      'A search whose word is every word of a script stops at 500 hits in all, over its pages, and says it stopped for that.',
    setup: (dir) => {
      const lines = Array.from({ length: BELLS }, (_, i) => `Bell ${i} bell bell.`).join('\n\n');
      put(at(dir, 'bells.fountain'), `Title: Bells\n\nINT. BELFRY - DAY\n\n${lines}\n`);
      return { path: `${FOLDER}/bells.fountain` };
    },
    tool: 'search_scripts',
    args: (path) => ({ words: 'bell', script: path }),
    pages: true,
    expect: {
      ok: (result) => {
        const { pages } = result as Pages;
        strictEqual(all(pages, 'hits').length, 500);
        strictEqual(pages.at(-1)?.stopped, 'hits');
      },
    },
    limitMs: 20_000,
  },
  {
    id: 'mcp-2000-files',
    tests:
      'A folder of 2,000 scripts eight levels deep is listed up to 500 files and said to be cut short, every page under the cap.',
    setup: (dir) => {
      let folder = folderIn(dir);
      for (let level = 1; level <= 8; level++) {
        folder = join(folder, `level ${level}`);
        for (let i = 0; i < 250; i++) put(join(folder, `scene ${level}-${i}.fountain`), SMALL);
      }
      return { path: FOLDER };
    },
    tool: 'list_scripts',
    args: (path) => ({ folder: path, recursive: true }),
    pages: true,
    expect: {
      ok: (result) => {
        const { pages } = result as Pages;
        strictEqual(all(pages, 'files').length, 500);
        strictEqual(pages.at(-1)?.truncated, true);
      },
    },
    limitMs: 30_000,
  },
  {
    id: 'mcp-huge-title',
    tests:
      'A title page whose Title is 120,000 characters is listed under the cap, its title clipped to 1,000 and said to be cut.',
    setup: (dir) => {
      put(
        at(dir, 'tall.fountain'),
        `Title: ${'T'.repeat(120_000)}\n\nINT. HALL - DAY\n\nA keeper stands.\n`,
      );
      return { path: FOLDER };
    },
    tool: 'list_scripts',
    args: (path) => ({ folder: path }),
    expect: {
      ok: (result) => {
        const files = (result as { files: Array<{ title: string; title_cut?: true }> }).files;
        strictEqual(files.length, 1);
        ok((files[0]?.title.length ?? 0) <= 1_000);
        strictEqual(files[0]?.title_cut, true);
      },
    },
  },
  {
    id: 'mcp-huge-ambiguous-heading',
    tests:
      'A scene reference that matches 25 headings of 50,000 characters each is refused under the cap, its matches’ headings clipped.',
    setup: (dir) => {
      const scenes = Array.from(
        { length: 25 },
        (_, i) => `INT. ROOM ${i + 1} ${'W'.repeat(50_000)} - NIGHT\n\nA keeper waits.\n`,
      );
      put(at(dir, 'wide.fountain'), scenes.join('\n'));
      return { path: `${FOLDER}/wide.fountain` };
    },
    tool: 'read_scene',
    args: (path) => ({ script: path, scene: 'room' }),
    expect: { refused: /^More than one scene matches “room”\. Name one by its number\.$/ },
  },
  {
    id: 'mcp-fadein-long-names',
    tests:
      'A Fade In file of six scripts whose entry names are 30,000 characters each is refused under the cap, its message clipped.',
    setup: (dir) => {
      const entries = Array.from({ length: 6 }, (_, i) => ({
        name: `${String(i).repeat(30_000)}.xml`,
        data: '<x/>',
        method: 0,
      }));
      mkdirSync(folderIn(dir), { recursive: true });
      writeFileSync(at(dir, 'many.fadein'), trapZip(entries));
      return { path: `${FOLDER}/many.fadein` };
    },
    tool: 'script_overview',
    args: (path) => ({ script: path }),
    expect: {
      refused: /^This isn’t a Fade In file Drafter can read: it holds more than one script \(0+…$/,
    },
  },
];

/** Every trap of the entry point's own. */
export const MCP_TRAPS: readonly McpTrap[] = [...MCP_PATH_TRAPS, ...MCP_SIZE_TRAPS];
