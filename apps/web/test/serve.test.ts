import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createStaticServer, parseHeaders } from '../scripts/serve.mjs';

// Writes `files` under a fresh `public/` directory (with `outside` written next
// to it, beyond the server's root), serves it, and hands `use` the base URL.
async function withServer(
  files: Record<string, string>,
  use: (base: string) => Promise<void>,
  outside: Record<string, string> = {},
) {
  const parent = await mkdtemp(join(tmpdir(), 'drafter-serve-'));
  const root = join(parent, 'public');
  for (const [dir, entries] of [
    [root, files],
    [parent, outside],
  ] as const) {
    for (const [name, body] of Object.entries(entries)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), body);
    }
  }
  const server = createStaticServer(root);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await use(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('parseHeaders', () => {
  test('parses Netlify _headers', () => {
    expect(
      parseHeaders('/*\n  X-A: 1\n  X-B: two words\n/_nuxt/*\n  Cache-Control: immutable\n'),
    ).toEqual([
      { pattern: '/*', headers: { 'X-A': '1', 'X-B': 'two words' } },
      { pattern: '/_nuxt/*', headers: { 'Cache-Control': 'immutable' } },
    ]);
  });

  test('skips comments and blank lines, and keeps colons inside values', () => {
    expect(
      parseHeaders('# headers\n\n/*\n  Content-Security-Policy: default-src https:\n'),
    ).toEqual([{ pattern: '/*', headers: { 'Content-Security-Policy': 'default-src https:' } }]);
  });
});

describe('createStaticServer', () => {
  test('serves index.html for /, 404.html for a missing path, and applies headers', async () => {
    const files = {
      'index.html': '<h1>home</h1>',
      '404.html': '<h1>lost</h1>',
      _headers: '/*\n  X-Test: yes\n',
    };
    await withServer(files, async (base) => {
      const home = await fetch(`${base}/`);
      expect(home.status).toBe(200);
      expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(home.headers.get('x-test')).toBe('yes');
      expect(await home.text()).toBe('<h1>home</h1>');

      const missing = await fetch(`${base}/nope`);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('x-test')).toBe('yes');
      expect(await missing.text()).toBe('<h1>lost</h1>');
    });
  });

  test('applies only the headers whose pattern matches the path', async () => {
    const files = {
      'index.html': 'home',
      '_nuxt/app.js': 'app',
      _headers: '/_nuxt/*\n  Cache-Control: immutable\n',
    };
    await withServer(files, async (base) => {
      expect((await fetch(`${base}/_nuxt/app.js`)).headers.get('cache-control')).toBe('immutable');
      expect((await fetch(`${base}/`)).headers.get('cache-control')).toBeNull();
    });
  });

  test("serves a directory's index.html", async () => {
    await withServer({ 'docs/index.html': 'docs' }, async (base) => {
      expect(await (await fetch(`${base}/docs/`)).text()).toBe('docs');
      expect(await (await fetch(`${base}/docs`)).text()).toBe('docs');
    });
  });

  test('never serves a file outside its root', async () => {
    await withServer(
      { 'index.html': 'home' },
      async (base) => {
        // URL parsing folds `..` and `%2e%2e` segments away before the request is
        // sent; an encoded slash survives it and decodes to `../secret.txt`.
        const escaped = await fetch(`${base}/..%2fsecret.txt`);
        expect(escaped.status).toBe(404);
        expect(await escaped.text()).not.toContain('secret');
      },
      { 'secret.txt': 'secret' },
    );
  });

  test('sends fonts with font content types', async () => {
    await withServer({ 'a.woff2': 'w', 'b.ttf': 't' }, async (base) => {
      expect((await fetch(`${base}/a.woff2`)).headers.get('content-type')).toBe('font/woff2');
      expect((await fetch(`${base}/b.ttf`)).headers.get('content-type')).toBe('font/ttf');
    });
  });
});
