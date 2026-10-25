import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { contentSecurityPolicy, headersFile, inlineHashes, writeHeaders } from '../scripts/csp.mjs';

const ALERT = "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"; // alert(1)
const LOG = "'sha256-VdIjA7RcGlAMlha0KwNIywkhItnIinF5FbBU63ckpoc='"; // console.log("drafter")

describe('inlineHashes', () => {
  test('hashes an inline script by its exact text', () => {
    expect(inlineHashes('<script>alert(1)</script>').scripts).toEqual([ALERT]);
  });

  test('hashes module scripts and import maps, skips external and JSON scripts', () => {
    const html =
      '<script src="/a.js"></script><script type="application/json">{}</script>' +
      '<script type="module">console.log("drafter")</script><script type="importmap">alert(1)</script>';
    expect(inlineHashes(html).scripts).toEqual([LOG, ALERT]);
  });

  test('collects inline styles separately from scripts', () => {
    expect(inlineHashes('<style id="x">alert(1)</style><script>alert(1)</script>')).toEqual({
      scripts: [ALERT],
      styles: [ALERT],
    });
  });
});

describe('contentSecurityPolicy', () => {
  test('builds the policy with every script hash and no unsafe-inline for scripts', () => {
    const csp = contentSecurityPolicy(["'sha256-a'", "'sha256-b'"]);
    expect(csp).toContain("script-src 'self' 'sha256-a' 'sha256-b';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self';");
  });

  test('is exactly the policy the plan sets out', () => {
    expect(contentSecurityPolicy(["'sha256-a'"])).toBe(
      "default-src 'self'; script-src 'self' 'sha256-a'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; " +
        "manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; " +
        "frame-ancestors 'none'",
    );
  });
});

describe('headersFile', () => {
  test('sends the policy and the other headers for every path, and caches the build assets', () => {
    expect(headersFile(["'sha256-a'"])).toBe(
      [
        '/*',
        `  Content-Security-Policy: ${contentSecurityPolicy(["'sha256-a'"])}`,
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: no-referrer',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        '  Cross-Origin-Opener-Policy: same-origin',
        '/_nuxt/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '/fonts/*',
        '  Cache-Control: public, max-age=604800',
        '',
      ].join('\n'),
    );
  });
});

describe('writeHeaders', () => {
  test('writes _headers once for every page in the publish directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'drafter-csp-'));
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'index.html'), '<script>alert(1)</script>');
    await writeFile(
      join(root, 'docs', 'saving.html'),
      '<script>alert(1)</script><script type="module">console.log("drafter")</script>',
    );
    const hashes = await writeHeaders(root);
    expect(hashes).toEqual([LOG, ALERT].sort());
    expect(await readFile(join(root, '_headers'), 'utf8')).toBe(headersFile(hashes));
  });
});
