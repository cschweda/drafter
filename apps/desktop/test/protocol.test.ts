import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  appHandler,
  cspFromHeaders,
  headersFor,
  navigationFor,
  resolveAppUrl,
} from '../src/protocol';

const ROOT = join(tmpdir(), 'drafter-web');
const CSP = "default-src 'self'; connect-src 'self'";

describe('resolveAppUrl', () => {
  test('resolves files under the root', () => {
    expect(resolveAppUrl('app://drafter/', ROOT)).toBe(ROOT);
    expect(resolveAppUrl('app://drafter/index.html', ROOT)).toBe(join(ROOT, 'index.html'));
    expect(resolveAppUrl('app://drafter/_nuxt/entry.abc.js', ROOT)).toBe(
      join(ROOT, '_nuxt', 'entry.abc.js'),
    );
    // A directory, with or without its slash; the query and the fragment are not part of the path.
    expect(resolveAppUrl('app://drafter/docs/saving/', ROOT)).toBe(join(ROOT, 'docs', 'saving'));
    expect(resolveAppUrl('app://drafter/docs/saving', ROOT)).toBe(join(ROOT, 'docs', 'saving'));
    expect(resolveAppUrl('app://drafter/docs/_payload.json?_b=123#top', ROOT)).toBe(
      join(ROOT, 'docs', '_payload.json'),
    );
    // Percent-encoded names are decoded: a space, an accent.
    expect(resolveAppUrl('app://drafter/fonts/A%20B%C3%A9.ttf', ROOT)).toBe(
      join(ROOT, 'fonts', 'A Bé.ttf'),
    );
    // The scheme and host are case-insensitive, as in any URL.
    expect(resolveAppUrl('APP://Drafter/index.html', ROOT)).toBe(join(ROOT, 'index.html'));
  });

  test('refuses paths that leave the root', () => {
    for (const url of [
      'app://drafter/../etc/passwd',
      'app://drafter/docs/../../etc/passwd',
      'app://drafter/%2e%2e/etc/passwd',
      'app://drafter/%2E%2E/%2E%2E/etc/passwd',
      'app://drafter/docs/%2e%2e/%2e%2e/secret',
      'app://drafter/..%2fetc%2fpasswd',
      'app://drafter/..%2Fetc%2Fpasswd',
      'app://drafter/..%5cetc%5cpasswd',
      'app://drafter/..\\etc\\passwd',
      'app://drafter//etc/passwd',
      'app://drafter/C:/Windows/win.ini',
      'app://drafter/index.html%00.png',
      'app://drafter/%E0%A4%A',
      'app://evil/index.html',
      'app://drafter.evil/index.html',
      'app://drafter:8080/index.html',
      'app://user@drafter/index.html',
      'https://drafter/index.html',
      'file:///etc/passwd',
      '/etc/passwd',
      'not a url',
    ]) {
      expect(resolveAppUrl(url, ROOT), url).toBeNull();
    }
  });
});

describe('headersFor', () => {
  test('sends the CSP on pages and scripts only', () => {
    expect(headersFor('/w/index.html', CSP)).toEqual({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
    });
    // A worker takes its policy from its own script's response, not the page's, so scripts carry it
    // too (as drafter.dev sends it on every path).
    expect(headersFor('/w/_nuxt/export.worker.js', CSP)['Content-Security-Policy']).toBe(CSP);
    for (const file of ['a.css', 'a.woff2', 'a.ttf', 'a.png', 'a.svg', 'a.json', 'OFL.txt', 'x']) {
      expect(headersFor(`/w/${file}`, CSP), file).not.toHaveProperty('Content-Security-Policy');
      expect(headersFor(`/w/${file}`, CSP)['X-Content-Type-Options']).toBe('nosniff');
    }
    expect(headersFor('/w/a.css', CSP)['Content-Type']).toBe('text/css; charset=utf-8');
    expect(headersFor('/w/a.woff2', CSP)['Content-Type']).toBe('font/woff2');
    expect(headersFor('/w/unknown.bin', CSP)['Content-Type']).toBe('application/octet-stream');
  });
});

describe('cspFromHeaders', () => {
  test('reads the policy of the rule for every path', () => {
    const text = [
      '/*',
      `  Content-Security-Policy: ${CSP}`,
      '  X-Content-Type-Options: nosniff',
      '/_nuxt/*',
      '  Cache-Control: public, max-age=31536000, immutable',
    ].join('\n');
    expect(cspFromHeaders(text)).toBe(CSP);
    expect(cspFromHeaders('/_nuxt/*\n  Content-Security-Policy: nope\n')).toBeNull();
    expect(cspFromHeaders('')).toBeNull();
  });
});

describe('appHandler', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'drafter-protocol-'));
    await mkdir(join(root, 'docs', 'saving'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<p>app</p>');
    await writeFile(join(root, 'docs', 'index.html'), '<p>docs</p>');
    await writeFile(join(root, 'docs', 'saving', 'index.html'), '<p>saving</p>');
    await writeFile(join(root, 'a.js'), 'export {}');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));
  const get = (url: string, method = 'GET') => appHandler(root, CSP)(new Request(url, { method }));

  test('serves files, and a directory from its index.html', async () => {
    const app = await get('app://drafter/');
    expect(app.status).toBe(200);
    expect(await app.text()).toBe('<p>app</p>');
    expect(app.headers.get('content-security-policy')).toBe(CSP);
    expect(await (await get('app://drafter/docs/saving/')).text()).toBe('<p>saving</p>');
    expect(await (await get('app://drafter/docs/saving')).text()).toBe('<p>saving</p>');
    expect(await (await get('app://drafter/docs')).text()).toBe('<p>docs</p>');
    const script = await get('app://drafter/a.js');
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  });

  test('answers anything else with a 404, never the app', async () => {
    for (const url of [
      'app://drafter/nope',
      'app://drafter/docs/nope/',
      'app://drafter/nope.js',
      'app://drafter/../etc/passwd',
      'app://evil/index.html',
    ]) {
      expect((await get(url)).status, url).toBe(404);
    }
    expect((await get('app://drafter/index.html', 'POST')).status).toBe(405);
  });
});

describe('navigationFor', () => {
  test('keeps the app in the app, sends https to the browser, and refuses the rest', () => {
    expect(navigationFor('app://drafter/docs/saving/')).toBe('app');
    expect(navigationFor('https://drafter.dev/')).toBe('external');
    for (const url of [
      'http://example.com/',
      'file:///etc/passwd',
      'data:text/html,x',
      'javascript:alert(1)',
      'app://evil/',
      'https://user:pass@example.com/',
      'mailto:a@example.com',
      'not a url',
    ]) {
      expect(navigationFor(url), url).toBe('refuse');
    }
  });
});
