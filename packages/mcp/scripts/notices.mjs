// The third-party licences that travel inside dist/drafter-mcp.js. tsdown.config.ts calls
// appendNotices once the file is written, with the modules the bundle was built from; this appends
// one comment block, "Third-party licences", to the file, and writes nothing else.
//
// Two kinds of third-party code are in the bundle:
//   - packages bundled from node_modules (the MCP SDK's @modelcontextprotocol/server and
//     @modelcontextprotocol/core, and zod): each one's own LICENSE file, read from its installed
//     folder;
//   - code the SDK's own dist files carry inline, which has no folder of its own: the SDK's build
//     marks each inlined module with a `//#region …/node_modules/.pnpm/<name>@<version>/…` line
//     (2.4.0 inlines the JSON Schema validators Ajv, with ajv-formats, fast-deep-equal, fast-uri,
//     and json-schema-traverse, in ajvProvider-*.mjs, and @cfworker/json-schema in
//     cfWorkerProvider-*.mjs). Their licences are kept in scripts/licences/<name>@<version>.txt,
//     taken from each version's npm package (@cfworker/json-schema's has no LICENSE file; its
//     text is the LICENSE.md of its repository, github.com/cfworker/cfworker), and their SPDX
//     names from each one's npm metadata (INLINE below).
// Anything the script doesn't know stops the build: a package with no licence file, inlined code
// with no kept licence, or a NOTICE file (Apache-2.0 asks for a NOTICE to be passed on; 2.4.0 of
// the SDK has none, so one appearing needs a person to look).
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';

const HERE = import.meta.dirname;

/** Inlined code the build may meet: its licence's SPDX name, from its npm metadata. */
export const INLINE = {
  'ajv@8.18.0': 'MIT',
  'ajv-formats@3.0.1': 'MIT',
  'fast-deep-equal@3.1.3': 'MIT',
  'fast-uri@3.1.8': 'BSD-3-Clause',
  'json-schema-traverse@1.0.0': 'MIT',
  '@cfworker/json-schema@4.1.1': 'MIT',
  'content-type@1.0.5': 'MIT',
};

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;

/** The folder of the package a module belongs to, and its manifest; undefined for Drafter's own. */
function packageOf(id) {
  if (!id.split(/[\\/]/).includes('node_modules')) return undefined;
  let dir = dirname(id);
  while (dir !== dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      // A folder inside a package may have a package.json of its own with no name (zod/v4 has).
      if (pkg.name && pkg.version) return { dir, pkg };
    }
    dir = dirname(dir);
  }
  throw new Error(`No package.json above ${id}`);
}

/** The packages a dist file of the SDK carries inline, as `name@version`, from its regions. */
export function inlinedIn(code) {
  const found = new Set();
  for (const match of code.matchAll(
    /^\/\/#region (?:\.\.\/)*node_modules\/\.pnpm\/[^/\n]+\/node_modules\/((?:@[^/\n]+\/)?[^/\n]+)\//gm,
  )) {
    const name = match[1];
    // The .pnpm folder's name is `<name with / as +>@<version>`, then `_<peers>` if any.
    const folder = match[0].split('/.pnpm/')[1].split('/')[0];
    const version = folder.slice(name.replace('/', '+').length + 1).split('_')[0];
    found.add(`${name}@${version}`);
  }
  return found;
}

/** Each third-party package in the bundle, with its licence's name and full text, by name. */
export function thirdParty(moduleIds) {
  const packages = new Map();
  for (const raw of moduleIds) {
    // Rolldown's own helpers and virtual modules aren't files.
    if (raw.startsWith('\0')) continue;
    const id = normalize(raw.split('?')[0]);
    if (!isAbsolute(id)) continue;
    const owner = packageOf(id);
    if (!owner) continue;
    const { dir, pkg } = owner;
    const key = `${pkg.name}@${pkg.version}`;
    if (!packages.has(key)) {
      const files = readdirSync(dir);
      const notice = files.find((file) => NOTICE_FILE.test(file));
      if (notice)
        throw new Error(`${key} has a NOTICE file (${notice}): pass it on, then allow it here`);
      const licence = files.find((file) => LICENCE_FILE.test(file));
      if (!licence) throw new Error(`${key} has no licence file in ${dir}`);
      packages.set(key, {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        text: readFileSync(join(dir, licence), 'utf8'),
      });
    }
    // Code the SDK's build put inside its own files.
    if (pkg.name.startsWith('@modelcontextprotocol/') && /\.m?js$/.test(id)) {
      for (const inline of inlinedIn(readFileSync(id, 'utf8'))) {
        if (packages.has(inline)) continue;
        const license = INLINE[inline];
        const kept = join(HERE, 'licences', `${inline.replace('/', '+')}.txt`);
        if (!license || !existsSync(kept))
          throw new Error(
            `${pkg.name} carries ${inline} inline, and its licence isn't kept in scripts/licences: read its npm package, then add it`,
          );
        const at = inline.lastIndexOf('@');
        packages.set(inline, {
          name: inline.slice(0, at),
          version: inline.slice(at + 1),
          license,
          text: readFileSync(kept, 'utf8'),
          inside: pkg.name,
        });
      }
    }
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The comment block: every package's name, version, licence, and full text. */
export function noticeBlock(packages) {
  const lines = [
    '',
    '/*',
    ' * Third-party licences',
    ' *',
    ' * This file is Drafter for Claude (drafter-mcp), MIT, https://github.com/cschweda/drafter,',
    ' * with the code of the packages below inside it. Each one’s licence follows, in full.',
  ];
  for (const each of packages) {
    lines.push(
      ' *',
      ` * ${'-'.repeat(70)}`,
      ` * ${each.name} ${each.version} (${each.license})${each.inside ? `, carried inside ${each.inside}` : ''}`,
      ' *',
    );
    // A licence's own `*/` would end the comment early.
    for (const line of each.text.replaceAll('*/', '* /').trimEnd().split(/\r?\n/))
      lines.push(line ? ` * ${line}` : ' *');
  }
  lines.push(' */', '');
  return lines.join('\n');
}

/** Appends the block to the bundle. */
export function appendNotices(file, moduleIds) {
  const packages = thirdParty(moduleIds);
  for (const required of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'])
    if (!packages.some((each) => each.name === required))
      throw new Error(`${required} isn't in the bundle's modules: the licences would be wrong`);
  appendFileSync(file, noticeBlock(packages));
  return packages;
}
