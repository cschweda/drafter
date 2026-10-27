// The modules folder (docs/drafter-desktop-design.md §6; docs/plans/2026-10-27-desktop-modules-folder.md):
// script modules a writer adds to `<userData>/modules`, read once when the app starts, each served
// at its own origin, drafter-module://<id>/, from its own folder only. A module's code runs in a
// sandboxed frame there, never in the app's page. Pure Node (no Electron), so the unit tests run it
// as it is: main.ts registers the scheme and hands `moduleHandler` to `protocol.handle`.
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_URL, contentTypeOf, resolveRawPath, within } from './protocol';

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
}

export interface ModulesFolder {
  modules: LoadedModule[];
  /** One sentence for each folder skipped, naming it. */
  problems: string[];
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** Whether `value` is an origin a module may ask for: https, or plain http to this computer. */
function isOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
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

const skipped = (folder: string, why: string) => `Drafter skipped the folder “${folder}”: ${why}.`;

/** Reads one folder's module, or says why it can't. */
function readOne(dir: string, folder: string): LoadedModule | string {
  const path = join(dir, folder);
  let root: string;
  try {
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
  };
}

/**
 * The modules in `dir` (the app's `modules` folder), in order of their folders' names. A missing
 * folder has none. Loose files and folders whose names start with a dot are not modules and are
 * passed over in silence; any other folder that isn't a module is skipped with a sentence naming it.
 */
export function readModulesFolder(dir: string): ModulesFolder {
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
  const modules: LoadedModule[] = [];
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const folder of names) {
    if (modules.length >= LIMITS.modules) {
      problems.push(skipped(folder, `Drafter reads at most ${LIMITS.modules} modules`));
      continue;
    }
    const read = readOne(dir, folder);
    if (typeof read === 'string') {
      problems.push(skipped(folder, read));
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
    [`connect-src ${self}`, ...origins].join(' '),
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
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });

export interface ModuleHandlerOptions {
  /** The loaded modules: id → the folder's real path. */
  modules: ReadonlyMap<string, string>;
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
      if (target.file !== 'runtime') {
        const root = options.modules.get(target.id) as string;
        let real = realRoots.get(target.id);
        if (!real) {
          real = realpath(root);
          realRoots.set(target.id, real);
        }
        if (!within(await real, await realpath(file))) return notFound();
      }
      const info = await stat(file);
      if (!info.isFile() || info.size > LIMITS.file) return notFound();
      return new Response(body(await readFile(file)), {
        status: 200,
        headers: {
          ...common,
          'Content-Type': contentTypeOf(file),
          // A sandboxed frame's origin is opaque, so its module scripts are cross-origin requests.
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return notFound();
    }
  };
}
