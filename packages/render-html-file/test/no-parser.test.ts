// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// A document's file is built from the tree the caller parsed: the package takes the footnote walk
// and the word count from `@drafter/markdown`'s parser-free subpaths, so importing it in Node (as
// `drafter build --html` will, for a script) loads no Markdown parser. Checked as Node runs it,
// against the built packages: a resolve hook lists every module the import reaches.

const dist = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const RENDER_HTML_FILE = dist('render-html-file/dist/index.js');
const MARKDOWN = dist('markdown/dist/index.js');

/** Every module URL Node resolves while importing `file`. */
function modulesLoadedBy(file: string): string[] {
  const script = `
    import { registerHooks } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const seen = [];
    registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); seen.push(r.url); return r; } });
    await import(pathToFileURL(${JSON.stringify(file)}).href);
    console.log(JSON.stringify(seen));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as string[];
}

const PARSER = /mdast-util-from-markdown|micromark/;

beforeAll(() => {
  for (const file of [RENDER_HTML_FILE, MARKDOWN]) {
    if (!existsSync(file)) {
      throw new Error('The packages are not built. Run `pnpm -r build` before these tests.');
    }
  }
});

describe('the package, imported in Node', () => {
  it('loads the footnote walk and the word count, and no Markdown parser', () => {
    const loaded = modulesLoadedBy(RENDER_HTML_FILE);
    expect(loaded.some((url) => url.endsWith('/markdown/dist/notes.js'))).toBe(true);
    expect(loaded.some((url) => url.endsWith('/markdown/dist/words.js'))).toBe(true);
    expect(loaded.filter((url) => PARSER.test(url))).toEqual([]);
  }, 30_000);

  it('would see the parser if it were loaded: the markdown package’s main entry loads it', () => {
    expect(modulesLoadedBy(MARKDOWN).some((url) => PARSER.test(url))).toBe(true);
  }, 30_000);
});
