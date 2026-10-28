// The modules folder (docs/drafter-desktop-design.md §6; docs/plans/2026-10-27-desktop-modules-folder.md):
// script modules a writer adds to `<userData>/modules`, read once when the app starts, each served
// at its own origin, drafter-module://<id>/, from its own folder only. A module's code runs in a
// sandboxed frame there, never in the app's page. Pure Node (no Electron), so the unit tests run it
// as it is: main.ts registers the scheme and hands `moduleHandler` to `protocol.handle`.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { APP_URL, contentTypeOf, navigationFor, resolveRawPath, within } from './protocol';

/** Set by the build (tsdown.config.ts, from scripts/built-in-modules.mjs); undefined in the unit tests. */
declare const __DRAFTER_BUILT_IN_MODULES__: readonly string[] | undefined;

/**
 * The ids of the modules built into Drafter. A module in the folder may not take one: it would share
 * the built-in's switch, its consent to the network, and its storage in the page.
 */
export const BUILT_IN_IDS: readonly string[] =
  typeof __DRAFTER_BUILT_IN_MODULES__ !== 'undefined' ? __DRAFTER_BUILT_IN_MODULES__ : [];

/** The scheme (registered as privileged in main.ts: standard, secure, fetch, CORS; never `bypassCSP`). */
export const MODULE_SCHEME = 'drafter-module';
/** The frame runtime's path on every module's origin (`dist/module-runtime.js`). */
export const RUNTIME_PATH = '/__drafter__/runtime.js';

/** Lowercase letters and digits, joined by single hyphens, at most 63 characters: a valid host name. */
const NAME = /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The most modules read, the largest module.json, and the largest file served. */
export const LIMITS = {
  modules: 50,
  manifest: 64 * 1024,
  file: 20 * 1024 * 1024,
  module: 64 * 1024 * 1024,
  name: 80,
  description: 400,
  origins: 16,
} as const;

/** What `module.json` says: who the module is, and what it may reach. Read without running its code. */
export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  permissions: { network: string[] };
}

/** A module the app loaded: its manifest, the name of its folder, and the folder's real path. */
export interface LoadedModule extends ModuleManifest {
  folder: string;
  root: string;
  /**
   * A short hash of the folder's name and every file in it, its code included: it changes when a
   * different module takes the id (I1) or the module changes at all, so the writer agrees again.
   */
  fingerprint: string;
  /** Each file's real path and the SHA-256 of what it held at start: only those files, unchanged, are served. */
  files: ReadonlyMap<string, string>;
}

export interface ModulesFolder {
  modules: LoadedModule[];
  /** One sentence for each folder skipped, naming it. */
  problems: string[];
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** A host name: lowercase labels of letters, digits, and inner hyphens, joined by single dots. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_NAME = `${LABEL}(?:\\.${LABEL})*`;
const IPV4 =
  '(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV6 = '\\[[0-9a-f:.]+\\]';
/** A port of 1 to 65535, written without leading zeros. */
const PORT = '(?::(?:6553[0-5]|655[0-2]\\d|65[0-4]\\d{2}|6[0-4]\\d{3}|[1-5]\\d{4}|[1-9]\\d{0,3}))?';
const HTTPS_ORIGIN = new RegExp(`^https://(?:${HOST_NAME}|${IPV4}|${IPV6})${PORT}$`);
const LOCAL_ORIGIN = new RegExp(`^http://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])${PORT}$`);

/**
 * Whether `value` is an origin a module may ask for: https to a plain host name or address, or
 * plain http to this computer, written exactly as the browser writes the origin (lowercase, no
 * default port, no user, path, query, or fragment). Checked character by character, not only by
 * the URL parser: the origin goes into the frame's CSP, where `*` is a wildcard and `;`, `,`, or a
 * space would end or split the source list.
 */
function isOrigin(value: string): boolean {
  if (!HTTPS_ORIGIN.test(value) && !LOCAL_ORIGIN.test(value)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** Why `value` is not a module.json, or undefined when it is one. */
export function manifestProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'its module.json is not an object';
  }
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string' || !NAME.test(m.id)) {
    return 'its id must be lowercase letters and digits, joined by single hyphens, at most 63 characters';
  }
  if (!isText(m.name)) return 'its module.json has no name';
  if (m.name.length > LIMITS.name) return `its name is longer than ${LIMITS.name} characters`;
  if (/^\s*drafter\b/i.test(m.name)) return 'its name can’t be “Drafter” or start with it';
  if (!isText(m.description)) return 'its module.json has no description';
  if (m.description.length > LIMITS.description) {
    return `its description is longer than ${LIMITS.description} characters`;
  }
  const permissions = m.permissions as Record<string, unknown> | null | undefined;
  if (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)) {
    return 'its module.json has no permissions object';
  }
  const network = permissions.network;
  if (network !== undefined) {
    if (!Array.isArray(network) || !network.every((o) => typeof o === 'string')) {
      return 'permissions.network must be a list of origins';
    }
    if (network.length > LIMITS.origins) {
      return `permissions.network may list at most ${LIMITS.origins} origins`;
    }
    const bad = network.find((origin) => !isOrigin(origin));
    if (bad !== undefined) {
      return `“${bad}” in permissions.network is not an origin (https://host, or http://localhost)`;
    }
  }
  return undefined;
}

/** Who is running Drafter, and whether their primary group is provably theirs alone. */
export interface Writer {
  uid: number;
  gid: number;
  /** True only on Linux when `groupIsPrivate` proved it; group-write is then the writer's alone. */
  groupIsPrivate: boolean;
}

/** The reason a group-writable entry is refused (the one a `chmod g-w` fixes). */
export const GROUP_PROBLEM = 'a group other than yours alone can change it';

/**
 * Why another user could change an entry with this mode and owner, or undefined when only the
 * writer can (POSIX). Refused: writable by anyone (`o+w`), owned by another user, or group-writable
 * unless the group is the writer's own primary group and provably private to them (Linux's
 * user-private groups: Ubuntu, Debian, and Fedora give each user one, with a umask of 002).
 */
export function accessProblem(
  entry: { mode: number; uid: number; gid: number },
  me: Writer,
): string | undefined {
  if ((entry.mode & 0o002) !== 0) return 'anyone on this computer can change it';
  if (entry.uid !== me.uid) return 'it is owned by another user';
  if ((entry.mode & 0o020) !== 0 && !(me.groupIsPrivate && entry.gid === me.gid)) {
    return GROUP_PROBLEM;
  }
  return undefined;
}

/**
 * Whether group `gid` is private to `username`, from the text of /etc/group and /etc/passwd: the
 * group's name is the user's, it lists no members, the user's own account has it as its primary
 * group, and no other account does. Anything not found (an LDAP or SSSD group, an account not in
 * the files) is doubt, and doubt is false.
 */
export function groupIsPrivate(
  gid: number,
  username: string,
  groupText: string,
  passwdText: string,
): boolean {
  const fields = (text: string) =>
    text
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => line.split(':'));
  const group = fields(groupText).find((f) => Number(f[2]) === gid);
  if (!group || group[0] !== username || (group[3] ?? '').trim() !== '') return false;
  const accounts = fields(passwdText).filter((f) => Number(f[3]) === gid);
  return accounts.length === 1 && accounts[0]?.[0] === username;
}

/**
 * The writer, for the checks below; null on Windows, where mode bits and owners mean nothing to
 * Node (every file reads as 0o666 or 0o444) and none are compared. There the modules folder is
 * `%APPDATA%\Drafter\modules`, inside the writer's profile folder, which Windows gives only the
 * writer, SYSTEM, and the administrators; Drafter relies on that, refuses a modules folder that is
 * a link to somewhere else (outside that protection), and still walks every module for links out
 * of it and anything it can't read (docs/DECISIONS.md, "The modules folder on Windows"). Only on
 * Linux can a group-writable file be accepted, and only when its group is provably private; on
 * macOS every user's primary group is the shared `staff`, so group-write is always refused there.
 */
export function currentWriter(
  platform: string = process.platform,
  ids: { uid: number; gid: number; username: string } | null = typeof process.getuid ===
    'function' && typeof process.getgid === 'function'
    ? { uid: process.getuid(), gid: process.getgid(), username: userInfo().username }
    : null,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Writer | null {
  if (platform === 'win32' || ids === null) return null;
  let groupPrivate = false;
  if (platform === 'linux') {
    try {
      groupPrivate = groupIsPrivate(ids.gid, ids.username, read('/etc/group'), read('/etc/passwd'));
    } catch {
      groupPrivate = false;
    }
  }
  return { uid: ids.uid, gid: ids.gid, groupIsPrivate: groupPrivate };
}

/**
 * The first thing under `root` another user could change, or that Drafter can't vouch for. With no
 * writer (Windows), owners and modes aren't compared, and the rest of the walk is as strict.
 */
interface Finding {
  /** The module folder's name, or a path relative to it. */
  path: string;
  /** Why: an `accessProblem`, or that it can't be read or leaves the folder. */
  why: string;
}

/**
 * The first path inside `root` (its own name, or a child's path relative to it) that another user
 * could change, or null when the whole tree is the writer's own and locked down. Fails closed: a
 * path that can't be lstat'd or read, a dangling symlink, and a symlink whose target leaves the
 * module's real folder are all treated as insecure, so a module Drafter can't fully vouch for is
 * skipped, not loaded. A module's code and every file it serves live here, so one writable or
 * unreadable file anywhere is enough for someone else to change what Drafter runs.
 */
function firstInsecure(root: string, folder: string, me: Writer | null): Finding | null {
  const unsure = (path: string): Finding => ({ path, why: 'unsure' });
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return unsure(folder);
  }
  const scan = (path: string, rel: string): Finding | null => {
    const here = rel === '' ? folder : rel;
    let info: import('node:fs').Stats;
    try {
      info = lstatSync(path);
    } catch {
      return unsure(here);
    }
    if (info.isSymbolicLink()) {
      let real: string;
      try {
        real = realpathSync(path);
      } catch {
        return unsure(here); // A dangling link.
      }
      if (!within(realRoot, real)) return unsure(here); // A link out of the module's folder.
      try {
        info = statSync(path);
      } catch {
        return unsure(here);
      }
    }
    const problem = me ? accessProblem(info, me) : undefined;
    if (problem) return { path: here, why: problem };
    if (info.isDirectory()) {
      let entries: import('node:fs').Dirent[];
      try {
        entries = readdirSync(path, { withFileTypes: true });
      } catch {
        return unsure(here); // A folder Drafter can't read.
      }
      for (const entry of entries) {
        const found = scan(
          join(path, entry.name),
          rel === '' ? entry.name : `${rel}/${entry.name}`,
        );
        if (found) return found;
      }
    }
    return null;
  };
  return scan(root, '');
}

/** Control characters (newlines, escapes, bells), which a folder name could use to forge a message. */
const CONTROL = /\p{Cc}/gu;

/** Text for a message, with every control character shown as `?`: a name can't forge a line or a terminal escape. */
export function shownText(text: string): string {
  return text.replace(CONTROL, '?');
}

/** A path quoted for a POSIX shell: in single quotes, each `'` written `'\''`, so nothing in it runs. */
export function shellQuote(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * The advice for a group-writable path: the exact command, quoted, or (for a path with a control
 * character, which no command should be built from) just what to do.
 */
function groupFix(command: string, path: string): string {
  CONTROL.lastIndex = 0;
  return CONTROL.test(path)
    ? 'Remove group write access from it'
    : `Run: ${command} ${shellQuote(path)}`;
}

const skipped = (folder: string, why: string) =>
  shownText(`Drafter skipped the folder “${folder}”: ${why}.`);

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/**
 * Every file under a module's real folder, by its path in the folder, with the SHA-256 of what it
 * holds now; null when the module is larger than `LIMITS.module` or something can't be read.
 * `firstInsecure` has already checked that every link stays in the folder.
 */
function hashFiles(root: string): Map<string, { real: string; hash: string }> | null {
  const found = new Map<string, { real: string; hash: string }>();
  let total = 0;
  const walk = (path: string, rel: string): boolean => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      const name = rel === '' ? entry.name : `${rel}/${entry.name}`;
      try {
        const real = realpathSync(child);
        if (!within(root, real)) return false;
        const info = statSync(real);
        if (info.isDirectory()) {
          if (entry.isSymbolicLink()) continue; // Its files are read where the folder really is.
          if (!walk(child, name)) return false;
        } else if (info.isFile()) {
          total += info.size;
          if (total > LIMITS.module) return false;
          found.set(name, { real, hash: sha256(readFileSync(real)) });
        }
      } catch {
        return false;
      }
    }
    return true;
  };
  return walk(root, '') ? found : null;
}

/** Reads one folder's module, or says why it can't. */
function readOne(dir: string, folder: string): LoadedModule | string {
  const path = join(dir, folder);
  let root: string;
  try {
    // A link to a folder elsewhere would put the module's real home, and the folders above it,
    // outside what Drafter checks: the module's own folder must be here.
    if (lstatSync(path).isSymbolicLink()) {
      return 'it is a link to a folder elsewhere; put the module’s own folder here instead';
    }
    root = realpathSync(path);
    if (!statSync(root).isDirectory()) return 'it is not a folder';
  } catch {
    return 'it can’t be read';
  }
  const manifestPath = join(root, 'module.json');
  let text: string;
  try {
    const info = lstatSync(manifestPath);
    if (!info.isFile()) return 'it has no module.json';
    if (info.size > LIMITS.manifest) return 'its module.json is larger than 64 KB';
    text = readFileSync(manifestPath, 'utf8');
  } catch {
    return 'it has no module.json';
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return 'its module.json isn’t valid JSON';
  }
  const problem = manifestProblem(value);
  if (problem) return problem;
  try {
    const code = realpathSync(join(root, 'index.js'));
    if (!within(root, code)) return 'its index.js is outside its folder';
    if (!statSync(code).isFile()) return 'it has no index.js';
  } catch {
    return 'it has no index.js';
  }
  const hashed = hashFiles(root);
  if (hashed === null) return 'it is larger than 64 MB, or Drafter can’t read all of it';
  const listing = [...hashed]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, { hash }]) => `${name}\0${hash}\n`)
    .join('');
  const m = value as {
    id: string;
    name: string;
    description: string;
    permissions: { network?: string[] };
  };
  return {
    id: m.id,
    name: m.name.trim(),
    description: m.description.trim(),
    permissions: { network: [...(m.permissions.network ?? [])] },
    folder,
    root,
    fingerprint: sha256(`${folder}\n${listing}`).slice(0, 16),
    files: new Map([...hashed.values()].map(({ real, hash }) => [real, hash])),
  };
}

/**
 * The modules in `dir` (the app's `modules` folder), in order of their folders' names. A missing
 * folder has none. Loose files and folders whose names start with a dot are not modules and are
 * passed over in silence; any other folder that isn't a module is skipped with a sentence naming it.
 */
export function readModulesFolder(
  dir: string,
  reserved: readonly string[] = BUILT_IN_IDS,
  me: Writer | null = currentWriter(),
  platform: string = process.platform,
): ModulesFolder {
  // On Windows the profile folder's protection is what keeps other users out (`currentWriter`), so
  // the modules folder must be in it, not a link (a junction, say) to a folder somewhere else.
  if (platform === 'win32') {
    let linked = false;
    try {
      linked = lstatSync(dir).isSymbolicLink();
    } catch {
      return { modules: [], problems: [] };
    }
    if (linked) {
      return {
        modules: [],
        problems: [
          'Drafter skipped the modules folder: it is a link to a folder elsewhere, which your Windows profile folder’s protection may not cover. Put the modules in the folder itself.',
        ],
      };
    }
  }
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .filter((entry) => {
        if (entry.isDirectory()) return true;
        if (!entry.isSymbolicLink()) return false;
        try {
          return statSync(join(dir, entry.name)).isDirectory();
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { modules: [], problems: [] };
  }
  if (me) {
    let problem: string | undefined;
    try {
      problem = accessProblem(statSync(dir), me);
    } catch {
      problem = undefined; // Read above, so it exists; a failure here leaves nothing to load anyway.
    }
    if (problem === GROUP_PROBLEM) {
      return {
        modules: [],
        problems: [
          shownText(
            `Drafter skipped the modules folder: ${GROUP_PROBLEM}. ${groupFix('chmod g-w', dir)}.`,
          ),
        ],
      };
    }
    if (problem) {
      return {
        modules: [],
        problems: [
          'Drafter skipped the modules folder: anyone on this computer can change it, so Drafter won’t run anything in it. Make it writable only by you.',
        ],
      };
    }
  }
  const modules: LoadedModule[] = [];
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const folder of names) {
    if (modules.length >= LIMITS.modules) {
      problems.push(skipped(folder, `Drafter reads at most ${LIMITS.modules} modules`));
      continue;
    }
    const open = firstInsecure(join(dir, folder), folder, me);
    if (open !== null) {
      problems.push(
        skipped(
          folder,
          open.why === GROUP_PROBLEM
            ? `${GROUP_PROBLEM} (${open.path}). ${groupFix('chmod -R g-w', join(dir, folder))}`
            : `something under it (${open.path}) isn’t yours alone, or Drafter can’t read it, so Drafter won’t run it`,
        ),
      );
      continue;
    }
    const read = readOne(dir, folder);
    if (typeof read === 'string') {
      problems.push(skipped(folder, read));
      continue;
    }
    if (reserved.includes(read.id)) {
      problems.push(
        skipped(folder, `it uses the id “${read.id}”, which a module built into Drafter has`),
      );
      continue;
    }
    const first = seen.get(read.id);
    if (first !== undefined) {
      problems.push(skipped(folder, `it has the id “${read.id}”, which the folder “${first}” has`));
      continue;
    }
    seen.set(read.id, folder);
    modules.push(read);
  }
  return { modules, problems };
}

/** The scheme, a host, and the raw path; no user, no port. Case-insensitive, as a URL's scheme and host are. */
const MODULE_URL = /^drafter-module:\/\/([a-z0-9-]+)(\/[^?#]*)?(?:[?#].*)?$/i;

/** The module a URL on the scheme names (`drafter-module://tidy/…` → `tidy`), or null. */
export function moduleIdOf(url: string): string | null {
  const id = MODULE_URL.exec(url)?.[1]?.toLowerCase();
  return id && NAME.test(id) ? id : null;
}

/** What a drafter-module:// URL asks for. */
export interface ModuleTarget {
  id: string;
  /** The frame's page, the runtime, or a file in the module's folder. */
  file: 'page' | 'runtime' | string;
}

/**
 * Maps a drafter-module:// URL to what it asks for: the frame's page (`/`), the runtime, or a file
 * under the module's folder (`roots`: id → folder), by app://'s path rules. Null for a module that
 * wasn't loaded, or a path that leaves the folder. The file need not exist.
 */
export function resolveModuleUrl(
  url: string,
  roots: ReadonlyMap<string, string>,
): ModuleTarget | null {
  const match = MODULE_URL.exec(url);
  if (!match) return null;
  const id = match[1]?.toLowerCase() ?? '';
  const root = roots.get(id);
  if (root === undefined) return null;
  const raw = match[2] ?? '/';
  if (raw === '/') return { id, file: 'page' };
  if (raw === RUNTIME_PATH) return { id, file: 'runtime' };
  const file = resolveRawPath(raw, root);
  return file === null || file === root ? null : { id, file };
}

/**
 * The policy of a module's frame: its own folder for code, styles, images, fonts, and fetches; the
 * network only to the origins the writer agreed to; framed by the app's page alone; and sandboxed
 * with scripts only, even if the frame's own attribute were dropped.
 */
export function moduleCsp(id: string, origins: readonly string[]): string {
  const self = `${MODULE_SCHEME}://${id}`;
  return [
    "default-src 'none'",
    `script-src ${self}`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self}`,
    [`connect-src ${self}`, ...origins.filter(isOrigin)].join(' '),
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${APP_URL.replace(/\/$/, '')}`,
    'sandbox allow-scripts',
  ].join('; ');
}

/** The frame's page: a root for a tab or settings to draw in, and the runtime, which loads the module. */
export function framePage(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Module</title></head>',
    '<body><div id="drafter-module-root"></div>',
    `<script type="module" src="${RUNTIME_PATH}"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });

export interface ModuleHandlerOptions {
  /** The loaded modules: id → the folder's real path. */
  modules: ReadonlyMap<string, string>;
  /**
   * Each module's files as they were at start (real path → SHA-256). When given, a file missing
   * from it, or changed since, is a 404: the code the writer agreed to is the code that runs.
   */
  files?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** The frame runtime's file (`dist/module-runtime.js`). */
  runtime: string;
  /** The origins the writer agreed to for a module, now. */
  origins(id: string): readonly string[];
}

/**
 * The handler for `protocol.handle('drafter-module', …)`: a module's frame page (with its policy),
 * the runtime, or a file in its folder, readable by the frame's opaque origin. A symlink is followed
 * only while it stays in the module's folder (the real path is checked), and anything else is a 404.
 */
export function moduleHandler(
  options: ModuleHandlerOptions,
): (request: Request) => Promise<Response> {
  const realRoots = new Map<string, Promise<string>>();
  const common = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const target = resolveModuleUrl(request.url, options.modules);
    if (target === null) return notFound();
    const body = (data: BodyInit | null) => (request.method === 'HEAD' ? null : data);
    if (target.file === 'page') {
      return new Response(body(framePage()), {
        status: 200,
        headers: {
          ...common,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': moduleCsp(target.id, options.origins(target.id)),
        },
      });
    }
    try {
      const file = target.file === 'runtime' ? options.runtime : target.file;
      let pinned: string | undefined;
      if (target.file !== 'runtime') {
        const root = options.modules.get(target.id) as string;
        let real = realRoots.get(target.id);
        if (!real) {
          real = realpath(root);
          realRoots.set(target.id, real);
        }
        const realFile = await realpath(file);
        if (!within(await real, realFile)) return notFound();
        if (options.files) {
          pinned = options.files.get(target.id)?.get(realFile);
          if (pinned === undefined) return notFound();
        }
      }
      const info = await stat(file);
      if (!info.isFile() || info.size > LIMITS.file) return notFound();
      const data = await readFile(file);
      if (pinned !== undefined && sha256(data) !== pinned) return notFound();
      return new Response(body(data), {
        status: 200,
        headers: {
          ...common,
          'Content-Type': contentTypeOf(file),
          // The module's own policy on every file, the runtime included (defense in depth).
          'Content-Security-Policy': moduleCsp(target.id, options.origins(target.id)),
          // A sandboxed frame's origin is opaque, so its module scripts are cross-origin requests.
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return notFound();
    }
  };
}

/**
 * Whether a frame may navigate to `url`: only a sub-frame, only to a loaded module's page
 * (`drafter-module://<id>/`), and only when the app's own page started it. A module's frame can't
 * navigate itself or another frame, to another module or anywhere else.
 */
export function allowsModuleFrame(
  url: string,
  initiatorUrl: string | undefined,
  isMainFrame: boolean,
  known: (id: string) => boolean,
): boolean {
  if (isMainFrame || initiatorUrl === undefined) return false;
  if (navigationFor(initiatorUrl) !== 'app') return false;
  const target = MODULE_URL.exec(url);
  if (!target || (target[2] ?? '/') !== '/') return false;
  const id = moduleIdOf(url);
  return id !== null && known(id);
}

/**
 * The origins the page says the writer agreed to for a module (`asked`, from the page), kept only
 * where the module's module.json declares them: the page can't widen what a module may reach.
 */
export function agreedOrigins(declared: readonly string[], asked: unknown): string[] {
  if (!Array.isArray(asked)) return [];
  return declared.filter((origin) => asked.includes(origin));
}

/**
 * The app's page policy, with its modules' frames allowed (`frame-src`; the policy's default would
 * refuse them). Only the desktop app adds this, and only when it loaded a module: drafter.dev's
 * policy is not changed.
 */
export function appCspWithModules(csp: string): string {
  return `${csp.replace(/;\s*$/, '')}; frame-src ${MODULE_SCHEME}:`;
}
