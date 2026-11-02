// Writes the Caddyfile for a self-hosted Drafter (Dockerfile) from the build's `_headers`, so the
// container sends exactly the content security policy and caching drafter.dev does, with one list
// to keep. Plain HTTP on 8080: HTTPS, if it's wanted, is the writer's own proxy.
// Run as `node scripts/caddyfile.mjs .output/public <out>`.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeaders } from './serve.mjs';

/** A value in a Caddyfile's double quotes. */
const quoted = (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/**
 * @param {string} headersText the build's `_headers`
 * @returns {string} the Caddyfile
 */
export function caddyfile(headersText) {
  const lines = [];
  parseHeaders(headersText).forEach((rule, i) => {
    const matcher = rule.pattern === '/*' ? '' : `@rule${i} `;
    if (matcher) lines.push(`\t@rule${i} path ${rule.pattern}`);
    for (const [name, value] of Object.entries(rule.headers)) {
      lines.push(`\theader ${matcher ? `@rule${i} ` : ''}${name} ${quoted(value)}`);
    }
  });
  return [
    '{',
    '\tadmin off',
    '\tauto_https off',
    '\tpersist_config off',
    '}',
    '',
    ':8080 {',
    '\troot * /srv',
    '\tencode zstd gzip',
    ...lines,
    '\ttry_files {path} {path}.html {path}/index.html',
    '\tfile_server',
    '\thandle_errors {',
    '\t\trewrite * /404.html',
    '\t\tfile_server',
    '\t}',
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [publicDir = '.output/public', out = 'Caddyfile'] = process.argv.slice(2);
  await writeFile(out, caddyfile(await readFile(resolve(publicDir, '_headers'), 'utf8')));
}
