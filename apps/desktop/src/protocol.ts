// The app's own scheme, app://drafter/, which serves the static web build from `web/` inside the
// app. Pure Node (no Electron), so the unit tests run it as it is: main.ts registers the scheme
// and hands `appHandler` to `protocol.handle`.
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The scheme (registered as privileged in main.ts: standard, secure, fetch, CORS). */
export const SCHEME = 'app';
/** The one host it answers. */
export const HOST = 'drafter';
/** The app's origin, and where the window starts. */
export const APP_URL = `${SCHEME}://${HOST}/`;

/** Content types by extension: what the web build has, and a little more. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/**
 * What the CSP governs: a page, and a script (a worker's policy comes from its own script's
 * response, not the page's, as drafter.dev sends the policy on every path).
 */
const POLICED = new Set(['.html', '.js', '.mjs']);

/** The scheme, the host, and the raw path; no user, no port. The query and fragment are dropped. */
const APP_URL_PATTERN = /^app:\/\/drafter(\/[^?#]*)?(?:[?#].*)?$/i;

/**
 * Maps an app://drafter/ URL to a file under `root`, or null for anything outside it (.., absolute,
 * other hosts). The path is checked before and after percent-decoding: a `..` segment, an encoded
 * slash or backslash, a NUL, an empty segment (`//`), or a drive letter is refused, and the result
 * must still be inside `root`. The file need not exist.
 */
export function resolveAppUrl(url: string, root: string): string | null {
  const match = APP_URL_PATTERN.exec(url);
  if (!match) return null;
  const raw = match[1] ?? '/';
  // Encoded separators and NULs would change what the decoded path means.
  if (/%(?:2f|5c|00)|\\/i.test(raw)) return null;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const segments = path.split('/').slice(1);
  // A trailing slash leaves one empty segment at the end; any other empty segment is `//`.
  const inner = segments.at(-1) === '' ? segments.slice(0, -1) : segments;
  for (const segment of inner) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (/^[a-z]:$/i.test(segment)) return null;
  }
  const base = resolve(root);
  const file = resolve(base, ...inner);
  const within = relative(base, file);
  if (within === '') return base;
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return null;
  return file;
}

/** The response headers for a file: Content-Type by extension, and the CSP on pages and scripts. */
export function headersFor(path: string, csp: string): Record<string, string> {
  const extension = extname(path).toLowerCase();
  const headers: Record<string, string> = {
    'Content-Type': TYPES[extension] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  };
  if (POLICED.has(extension)) headers['Content-Security-Policy'] = csp;
  return headers;
}

/**
 * The Content-Security-Policy of the rule for every path (`/*`) in Netlify's `_headers` file, as
 * apps/web/scripts/csp.mjs writes it for each build (its script hashes change with the build).
 */
export function cspFromHeaders(text: string): string | null {
  let everyPath = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      everyPath = trimmed === '/*';
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (everyPath && trimmed.slice(0, colon).trim().toLowerCase() === 'content-security-policy') {
      return trimmed.slice(colon + 1).trim() || null;
    }
  }
  return null;
}

const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });

/**
 * The handler for `protocol.handle('app', …)`: a file under `root`, or a directory's `index.html`
 * (`/docs/saving/` and `/docs/saving` are the prerendered help page). Anything else is a 404: the
 * app is one page, so there is no fallback to it, and a missing file never becomes the app.
 */
export function appHandler(root: string, csp: string): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let file = resolveAppUrl(request.url, root);
    if (file === null) return notFound();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: headersFor(file, csp),
      });
    } catch {
      return notFound();
    }
  };
}

/** What a navigation to `url` may do: stay in the app, go to the system browser, or nothing. */
export function navigationFor(url: string): 'app' | 'external' | 'refuse' {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'refuse';
  }
  if (parsed.protocol === `${SCHEME}:` && parsed.host === HOST) return 'app';
  // Only a web page goes to the browser, and only over https: never a file, a custom scheme
  // another program registered, or a plain-http address.
  if (parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '') {
    return 'external';
  }
  return 'refuse';
}
