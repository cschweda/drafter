// Writes the generated site's `_headers` file for Netlify, with a content
// security policy that allows exactly the inline scripts the build produced:
// each by the SHA-256 of its text. Styles may be inline (docs/DECISIONS.md),
// so only scripts are hashed into the policy.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Script types a browser runs, and so the policy governs. JSON payloads
// (`application/json`) aren't run and need no hash.
const EXECUTABLE = new Set(['', 'text/javascript', 'module', 'importmap']);

function hash(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * The hashes of the inline scripts and styles in `html`, in document order.
 * @param {string} html
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function inlineHashes(html) {
  const scripts = [];
  for (const [, attributes, text] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1].toLowerCase() ?? '';
    if (EXECUTABLE.has(type)) scripts.push(hash(text));
  }
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, text]) =>
    hash(text),
  );
  return { scripts, styles };
}

/**
 * @param {string[]} scriptHashes
 * @returns {string}
 */
export function contentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The `_headers` file: the policy and the other security headers for every
 * path, long caching for the fingerprinted build assets and the fonts, and none for the service
 * worker and the manifest.
 * @param {string[]} scriptHashes
 * @returns {string}
 */
export function headersFile(scriptHashes) {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(scriptHashes)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '/_nuxt/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/fonts/*',
    '  Cache-Control: public, max-age=604800',
    // The service worker and the manifest are never kept for long: a browser that asks for
    // `sw.js` and is told "no-cache" checks with the server each time, which is how it finds a
    // new version (the worker's own bytes change with the files it precaches).
    '/sw.js',
    '  Cache-Control: no-cache',
    '/manifest.webmanifest',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

/**
 * Hashes the inline scripts of every page under `publicDir` and writes
 * `publicDir/_headers`.
 * @param {string} publicDir
 * @returns {Promise<string[]>} the script hashes, sorted and without repeats
 */
export async function writeHeaders(publicDir) {
  const hashes = new Set();
  for (const file of await htmlFiles(publicDir)) {
    for (const h of inlineHashes(await readFile(file, 'utf8')).scripts) hashes.add(h);
  }
  const sorted = [...hashes].sort();
  await writeFile(join(publicDir, '_headers'), headersFile(sorted));
  return sorted;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const publicDir = process.argv[2] ?? '.output/public';
  const hashes = await writeHeaders(publicDir);
  process.stdout.write(`Wrote ${publicDir}/_headers, allowing ${hashes.length} inline scripts.\n`);
}
