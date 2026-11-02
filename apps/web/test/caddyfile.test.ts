import { describe, expect, test } from 'vitest';
import { caddyfile } from '../scripts/caddyfile.mjs';
import { headersFile } from '../scripts/csp.mjs';

// The self-hosted container's Caddyfile comes from the same `_headers` drafter.dev serves.
describe('the Caddyfile', () => {
  const text = caddyfile(headersFile(["'sha256-a'"]));

  test('sends drafter.dev’s policy on every path, and no analytics host', () => {
    expect(text).toMatch(/^\theader Content-Security-Policy "default-src 'self';/m);
    expect(text).toContain("'sha256-a'");
    expect(text).toContain('header X-Content-Type-Options "nosniff"');
    expect(text).not.toContain('plausible');
  });

  test('keeps each path’s caching to that path', () => {
    expect(text).toMatch(/@(rule\d+) path \/sw\.js\n\theader @\1 Cache-Control "no-cache"/);
    expect(text).toMatch(/@(rule\d+) path \/_nuxt\/\*\n\theader @\1 Cache-Control "public/);
  });

  test('serves plain HTTP on 8080 with no admin port, and a 404 page', () => {
    expect(text).toContain('admin off');
    expect(text).toContain('auto_https off');
    expect(text).toContain(':8080 {');
    expect(text).toContain('rewrite * /404.html');
  });

  test('escapes a quote in a value', () => {
    expect(caddyfile('/*\n  X-Test: a"b\n')).toContain('header X-Test "a\\"b"');
  });
});
