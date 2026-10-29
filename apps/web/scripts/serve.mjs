// A static server for the generated site that applies Netlify's `_headers`
// file, so the end-to-end tests run under the same headers, the content
// security policy included, that drafter.dev sends.
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Reads Netlify's `_headers` format: a path pattern on its own line, then
 * indented `Name: value` lines. Blank lines and `#` comments are skipped.
 * @param {string} text
 * @returns {Array<{ pattern: string, headers: Record<string, string> }>}
 */
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: trimmed, headers: {} };
      rules.push(current);
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (current && colon > 0) {
      current.headers[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
    }
  }
  return rules;
}

function matches(pattern, path) {
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
}

async function readRules(root) {
  try {
    return parseHeaders(await readFile(resolve(root, '_headers'), 'utf8'));
  } catch {
    return [];
  }
}

// The file a URL path names inside `root`, or null. Like Netlify, a directory
// serves its index.html, and `/name` also finds `name.html`. A path that
// resolves outside `root` finds nothing.
async function findFile(root, path) {
  const candidates = path.endsWith('/')
    ? [`${path}index.html`]
    : [path, `${path}.html`, `${path}/index.html`];
  for (const candidate of candidates) {
    const full = resolve(root, `.${candidate}`);
    if (!full.startsWith(root + sep)) return null;
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {
      // Not there; try the next candidate.
    }
  }
  return null;
}

/**
 * @param {string} root the directory to serve
 * @returns {import('node:http').Server}
 */
export function createStaticServer(root) {
  const base = resolve(root);
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = null;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      // A malformed escape names no file.
    }
    const headers = {};
    for (const rule of await readRules(base)) {
      if (matches(rule.pattern, url.pathname)) Object.assign(headers, rule.headers);
    }
    const file = path === null ? null : await findFile(base, path);
    if (file) {
      // A rule's Content-Type names the file's type, as Netlify's does (the dictionaries').
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        ...headers,
      });
      createReadStream(file).pipe(res);
      return;
    }
    const notFound = await findFile(base, '/404.html');
    res.writeHead(404, { ...headers, 'Content-Type': TYPES['.html'] });
    if (notFound) createReadStream(notFound).pipe(res);
    else res.end('Not found');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root = '.output/public', port = '4173'] = process.argv.slice(2);
  createStaticServer(root).listen(Number(port), () => {
    process.stdout.write(`Serving ${root} at http://localhost:${port}\n`);
  });
}
