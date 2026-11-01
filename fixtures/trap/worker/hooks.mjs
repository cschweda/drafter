// Resolves what the tests' Vite aliases resolve (vitest.shared.ts), for a worker that runs a trap
// on Node alone: `@drafter/<name>` to its package's source, and a relative import without an
// extension to its `.ts` file (or its folder's `index.ts`). Node itself strips the types.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGES = new URL('../../../packages/', import.meta.url);
const entry = (name) => (name === 'cli' ? 'cli' : 'index');

function file(url) {
  const path = fileURLToPath(url);
  if (existsSync(`${path}.ts`)) return pathToFileURL(`${path}.ts`).href;
  if (existsSync(path) && statSync(path).isDirectory() && existsSync(`${path}/index.ts`))
    return pathToFileURL(`${path}/index.ts`).href;
  return null;
}

export async function resolve(specifier, context, next) {
  const own = /^@drafter\/([a-z-]+)(?:\/(notes|words))?$/.exec(specifier);
  if (own) {
    const url = new URL(`${own[1]}/src/${own[2] ?? entry(own[1])}.ts`, PACKAGES);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    if (!/\.[cm]?[jt]sx?$|\.json$/.test(url.pathname)) {
      const found = file(url);
      if (found) return { url: found, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

/** A JSON import without `with { type: 'json' }`, which Vite allows and Node doesn't. */
export async function load(url, context, next) {
  if (url.endsWith('.json') && !context.importAttributes?.type) {
    return next(url, {
      ...context,
      importAttributes: { ...context.importAttributes, type: 'json' },
    });
  }
  return next(url, context);
}
