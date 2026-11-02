import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderScriptHtml, stylesUsed } from '@drafter/render-html-file';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_MAX } from '../src/cache';
import { __parsesForTests, type Loaded, load } from '../src/load';
import { type Connected, connect, refusalOf } from './connect';
import { contextFor } from './context';
import { EPISODE_101, LIBRARY, makeLibrary } from './library';
import { put, tempFolder } from './temp';

const SCREENPLAY = builtins['us-screenplay'] as Template;

const script = (loaded: Loaded) => {
  if (loaded.kind !== 'script') throw new Error('not a script');
  return loaded;
};

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe('load', () => {
  it('a Fountain, a .txt, an FDX, and a reopenable export load alike', async () => {
    const dir = tempFolder();
    const text = readFileSync(join(LIBRARY, EPISODE_101), 'utf8');
    const doc = parse(text);
    const layout = paginate(doc, SCREENPLAY);
    put(join(dir, 'Lib', 'a.fountain'), text);
    put(join(dir, 'Lib', 'b.txt'), text);
    put(join(dir, 'Lib', 'c.fdx'), toFdx(doc, SCREENPLAY));
    const files = {
      regular: 'CourierPrime-Regular.ttf',
      bold: 'CourierPrime-Bold.ttf',
      italic: 'CourierPrime-Italic.ttf',
      boldItalic: 'CourierPrime-BoldItalic.ttf',
    };
    const fonts = Object.fromEntries(
      [...stylesUsed(layout)].map((style) => [
        style,
        new Uint8Array(
          readFileSync(join(import.meta.dirname, '../../render-pdf/fonts', files[style])),
        ),
      ]),
    );
    put(
      join(dir, 'Lib', 'd.html'),
      renderScriptHtml({
        doc,
        layout,
        template: SCREENPLAY,
        notes: 'leave-out',
        fonts,
        title: 'Signal Hill',
        lang: 'en',
        generator: 'Drafter test',
        kindLine: 'Screenplay',
        source: text,
      }),
    );
    const ctx = await contextFor([join(dir, 'Lib')]);
    const a = script(await load('Lib/a.fountain', ctx));
    const b = script(await load('Lib/b.txt', ctx));
    const c = script(await load('Lib/c.fdx', ctx));
    const d = script(await load('Lib/d.html', ctx));
    expect([a.format, b.format, c.format, d.format]).toEqual(['fountain', 'text', 'fdx', 'html']);
    expect(a.file.shown).toBe('Lib/a.fountain');
    expect(b.text).toBe(a.text);
    expect(d.text).toBe(text);
    const headings = (l: typeof a) => l.index.scenes.map((s) => s.heading);
    expect(headings(a)).toHaveLength(13);
    for (const other of [b, c, d]) {
      expect(headings(other)).toEqual(headings(a));
      expect(other.cast.characters.map((ch) => ch.key)).toEqual(
        a.cast.characters.map((ch) => ch.key),
      );
      expect(other.template.id).toBe('us-screenplay');
    }
    expect(a.map.title).toBe('Signal Hill');
    expect(a.map.contact).toBeNull();
    expect(a.importNotes).toBe(0);
  });

  it('a Markdown document has its sections', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const ctx = await contextFor([scripts]);
    const loaded = await load('Scripts/Signal Hill/Series bible.md', ctx);
    expect(loaded.kind).toBe('markdown');
    if (loaded.kind !== 'markdown') return;
    expect(loaded.title).toBe('Signal Hill: the bible');
    expect(loaded.sections.map((s) => s.title)).toEqual(['Signal Hill: the bible', 'June', 'Eli']);
    expect(loaded.text.slice(loaded.sections[1]?.from, loaded.sections[1]?.to)).toBe(
      '## June\n\nSeventy-one, a retired schoolteacher, still up at four.\n\n',
    );
  });

  it('a script that isn’t UTF-8 is refused in the CLI’s words', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'x.fountain'));
    writeFileSync(
      join(dir, 'Lib', 'x.fountain'),
      Buffer.from([0x49, 0x4e, 0x54, 0x2e, 0x20, 0x43, 0x41, 0x46, 0xc9, 0x0a]),
    );
    open = await connect({ folders: [join(dir, 'Lib')] });
    const body = refusalOf(await open.call('script_overview', { script: 'Lib/x.fountain' }));
    expect(body.error).toBe('Can’t read that file: it isn’t UTF-8 text.');
    expect(body.error).not.toContain(dir);
  });

  it('a file of a kind Drafter doesn’t read is refused', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'notes.docx'), 'not a script');
    open = await connect({ folders: [join(dir, 'Lib')] });
    const body = refusalOf(await open.call('read_scene', { script: 'Lib/notes.docx', scene: '1' }));
    expect(body.error).toMatch(/doesn’t read/);
  });

  it('the same file is parsed once while it is unchanged', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const ctx = await contextFor([scripts]);
    const path = `Scripts/Signal Hill/${EPISODE_101}`;
    const before = __parsesForTests();
    await load(path, ctx);
    await load(path, ctx);
    await load(path, ctx);
    expect(__parsesForTests() - before).toBe(1);
    const real = join(scripts, 'Signal Hill', EPISODE_101);
    utimesSync(real, new Date('2026-11-02T12:00:00Z'), new Date('2026-11-02T12:00:00Z'));
    await load(path, ctx);
    expect(__parsesForTests() - before).toBe(2);
  });

  it('the cache keeps 20', async () => {
    const dir = tempFolder();
    for (let i = 0; i <= CACHE_MAX; i++)
      put(join(dir, 'Lib', `${String(i).padStart(2, '0')}.fountain`), `INT. ROOM ${i} - DAY\n`);
    const ctx = await contextFor([join(dir, 'Lib')]);
    const before = __parsesForTests();
    for (let i = 0; i <= CACHE_MAX; i++)
      await load(`Lib/${String(i).padStart(2, '0')}.fountain`, ctx);
    expect(__parsesForTests() - before).toBe(CACHE_MAX + 1);
    // The last is still kept; the first went when the 21st came.
    await load(`Lib/${String(CACHE_MAX).padStart(2, '0')}.fountain`, ctx);
    expect(__parsesForTests() - before).toBe(CACHE_MAX + 1);
    await load('Lib/00.fountain', ctx);
    expect(__parsesForTests() - before).toBe(CACHE_MAX + 2);
  });
});
