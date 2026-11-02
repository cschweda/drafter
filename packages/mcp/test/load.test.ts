import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { notAScript, refusalMessage, zipStored } from '@drafter/archive';
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
import { EPISODE_101, EXPORT, LIBRARY, makeLibrary } from './library';
import { put, tempFolder } from './temp';

const SCREENPLAY = builtins['us-screenplay'] as Template;

function writeBytes(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

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

describe('every file is judged by what is inside it, as Open does', () => {
  const PDF = new TextEncoder().encode('%PDF-1.7\nINT. HALL - DAY\n');
  const RTF = new TextEncoder().encode('{\\rtf1\\ansi INT. HALL - DAY\\par A lever waits.}');
  const WORD = zipStored([{ name: 'word/document.xml', data: new TextEncoder().encode('<w/>') }]);
  const said = (name: string, bytes: Uint8Array) =>
    refusalMessage(name, notAScript(name, bytes) as NonNullable<ReturnType<typeof notAScript>>);
  const epubWith = (entries: Array<{ name: string; text: string }>) =>
    zipStored([
      { name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') },
      ...entries.map((e) => ({ name: e.name, data: new TextEncoder().encode(e.text) })),
    ]);

  it('a PDF, an RTF, and a Word file are refused by their bytes whatever their names', async () => {
    const dir = tempFolder();
    const files: Array<[string, Uint8Array]> = [
      ['printed.fountain', PDF],
      ['printed.md', PDF],
      ['rich.fountain', RTF],
      ['rich.txt', RTF],
      ['packed.md', WORD],
      ['packed.txt', WORD],
      ['packed.fdx', WORD],
    ];
    for (const [name, bytes] of files) writeBytes(join(dir, 'Lib', name), bytes);
    open = await connect({ folders: [join(dir, 'Lib')] });
    for (const [name, bytes] of files) {
      for (const [tool, args] of [
        ['script_overview', { script: `Lib/${name}` }],
        ['read_scene', { script: `Lib/${name}`, scene: '1' }],
        ['search_scripts', { words: 'hall', script: `Lib/${name}` }],
      ] as const) {
        const body = refusalOf(await open.call(tool, args));
        expect(body.error, `${name} at ${tool}`).toBe(said(name, bytes));
        expect(body.error).not.toContain(dir);
      }
    }
    expect(said('printed.fountain', PDF)).toMatch(
      /^Drafter can’t open a PDF \(printed\.fountain\)/,
    );
  });

  it('a Drafter HTML export named .fountain is read as the export, like Open', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'export.fountain'), EXPORT);
    const ctx = await contextFor([join(dir, 'Lib')]);
    const loaded = script(await load('Lib/export.fountain', ctx));
    expect(loaded.content).toBe('html export');
    expect(loaded.index.scenes.map((s) => s.heading)).toEqual(['INT. JUNE’S KITCHEN - NIGHT']);
    expect(loaded.map.title).toBe('Read From The Export');
  });

  it('an e-book named .txt is read as the export or refused as Open does', async () => {
    const dir = tempFolder();
    const book = epubWith([
      {
        name: 'EPUB/drafter-source.fountain',
        text: 'Title: Booked\n\nINT. HALL - DAY\n\nA lever.\n',
      },
    ]);
    const bare = epubWith([{ name: 'EPUB/chapter.xhtml', text: '<p>INT. HALL - DAY</p>' }]);
    writeBytes(join(dir, 'Lib', 'book.txt'), book);
    writeBytes(join(dir, 'Lib', 'bare.txt'), bare);
    const ctx = await contextFor([join(dir, 'Lib')]);
    const loaded = script(await load('Lib/book.txt', ctx));
    expect(loaded.content).toBe('epub export');
    expect(loaded.index.scenes.map((s) => s.heading)).toEqual(['INT. HALL - DAY']);
    open = await connect({ folders: [join(dir, 'Lib')] });
    const body = refusalOf(await open.call('script_overview', { script: 'Lib/bare.txt' }));
    expect(body.error).toBe(said('bare.txt', bare));
    expect(body.error).toMatch(/^Drafter can’t open an e-book \(bare\.txt\)/);
  });

  it('a web page that isn’t a Drafter export is refused, whatever its name', async () => {
    const dir = tempFolder();
    const page = '<!DOCTYPE html>\n<html><body><p>INT. HALL - DAY</p></body></html>\n';
    for (const name of ['page.fountain', 'page.md', 'page.txt', 'page.html'])
      put(join(dir, 'Lib', name), page);
    open = await connect({ folders: [join(dir, 'Lib')] });
    for (const name of ['page.fountain', 'page.md', 'page.txt', 'page.html']) {
      const body = refusalOf(await open.call('script_overview', { script: `Lib/${name}` }));
      expect(body.error, name).toBe(said(name, new TextEncoder().encode(page)));
      expect(body.error).toMatch(/^Drafter can’t open a web page/);
    }
  });

  it('a real Fountain file named .txt still opens', async () => {
    const dir = tempFolder();
    const text = readFileSync(join(LIBRARY, EPISODE_101), 'utf8');
    put(join(dir, 'Lib', 'episode.txt'), text);
    put(join(dir, 'Lib', 'episode.fountain'), text);
    const ctx = await contextFor([join(dir, 'Lib')]);
    const txt = script(await load('Lib/episode.txt', ctx));
    const fountain = script(await load('Lib/episode.fountain', ctx));
    expect(txt.content).toBe('fountain');
    expect(fountain.content).toBe('fountain');
    expect(txt.index.scenes).toHaveLength(13);
  });
});
