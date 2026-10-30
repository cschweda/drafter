import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listZip, readEntry } from '@drafter/archive';
import { parseMarkdown } from '@drafter/markdown';
import { describe, expect, it } from 'vitest';
import {
  type DocumentEpubInput,
  epubIdentifier,
  renderDocumentEpub,
  renderScriptEpub,
  type ScriptEpubInput,
  scriptAuthor,
} from '../src/epub';
import { readingHtml } from '../src/reading';
import { BARE, FONTS, type Laid, lay, SCREENPLAY, STAGE_PLAY, stagePlay } from './scripts';

// Original text throughout.

const MODIFIED = new Date(Date.UTC(2026, 9, 30, 14, 5, 9, 750));
const ID = 'urn:uuid:0f8f2a4e-6b1c-5d3e-9a7b-2c4d6e8f0a1b';

function scriptInput(laid: Laid, over: Partial<ScriptEpubInput> = {}): ScriptEpubInput {
  return {
    ...laid,
    notes: 'leave-out',
    fonts: FONTS,
    title: 'The Salt Road',
    lang: 'en',
    generator: 'Drafter 0.22.0',
    author: 'Wren Okafor',
    modified: MODIFIED,
    id: ID,
    ...over,
  };
}

function documentInput(source: string, over: Partial<DocumentEpubInput> = {}): DocumentEpubInput {
  return {
    tree: parseMarkdown(source),
    title: 'The Lantern Keeper',
    lang: 'en-GB',
    generator: 'Drafter 0.22.0',
    modified: MODIFIED,
    id: ID,
    ...over,
  };
}

/** An EPUB's entries, in order, read back with the archive's own reader. */
async function unzip(epub: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of listZip(epub)) files.set(entry.name, await readEntry(epub, entry));
  return files;
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const xml = (source: string, type: DOMParserSupportedType = 'application/xml') =>
  new DOMParser().parseFromString(source, type);
const XHTML = 'http://www.w3.org/1999/xhtml';
const OPS = 'http://www.idpf.org/2007/ops';

/** The package's manifest and spine, with each item's path inside the zip. */
async function opened(epub: Uint8Array) {
  const files = await unzip(epub);
  const container = xml(text(files.get('META-INF/container.xml')));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path') ?? '';
  const opf = xml(text(files.get(opfPath)));
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = [...opf.querySelectorAll('manifest > item')].map((item) => ({
    id: item.getAttribute('id') ?? '',
    path: base + (item.getAttribute('href') ?? ''),
    type: item.getAttribute('media-type') ?? '',
    properties: item.getAttribute('properties') ?? '',
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const spine = [...opf.querySelectorAll('spine > itemref')].map(
    (ref) => byId.get(ref.getAttribute('idref') ?? '')?.path ?? '?',
  );
  const docs = new Map<string, Document>();
  for (const item of items) {
    if (item.type === 'application/xhtml+xml') {
      docs.set(item.path, xml(text(files.get(item.path)), 'application/xhtml+xml'));
    }
  }
  const nav = items.find((item) => item.properties.split(' ').includes('nav'));
  return { files, container, opfPath, opf, base, items, spine, docs, nav };
}

/** Where a nav or content link lands: the document and the element, or undefined. */
function land(
  docs: Map<string, Document>,
  base: string,
  from: string,
  href: string,
): Element | undefined {
  const [file, id] = href.split('#');
  const path = file ? base + file : from;
  const doc = docs.get(path);
  if (!doc) return undefined;
  if (!id) return doc.documentElement;
  return doc.getElementById(id) ?? undefined;
}

describe('the container', () => {
  it('mimetype is the first entry, stored, exactly application/epub+zip', async () => {
    const epub = renderScriptEpub(scriptInput(lay(SCREENPLAY)));
    const [first] = listZip(epub);
    expect(first?.name).toBe('mimetype');
    expect(first?.method).toBe(0);
    // Readers look at fixed offsets: "mimetype" at 30, its content at 38, no extra field.
    expect(text(epub.subarray(30, 38))).toBe('mimetype');
    expect(epub[28]).toBe(0);
    expect(epub[29]).toBe(0);
    expect(text(epub.subarray(38, 58))).toBe('application/epub+zip');
    expect(first?.size).toBe(20);
  });

  it('container.xml points at the package', async () => {
    const { container, opfPath, files, opf } = await opened(
      renderScriptEpub(scriptInput(lay(SCREENPLAY))),
    );
    const rootfile = container.querySelector('rootfile');
    expect(rootfile?.getAttribute('media-type')).toBe('application/oebps-package+xml');
    expect(files.has(opfPath)).toBe(true);
    expect(opf.documentElement.getAttribute('version')).toBe('3.0');
    expect([...files.keys()].slice(0, 2)).toEqual(['mimetype', 'META-INF/container.xml']);
  });

  it('every manifest item exists and every file is in the manifest', async () => {
    for (const epub of [
      renderScriptEpub(scriptInput(lay(SCREENPLAY))),
      renderDocumentEpub(documentInput('# One\n\nText.[^a]\n\n# Two\n\nMore.\n\n[^a]: A note.\n')),
    ]) {
      const { files, items, opfPath, spine, nav } = await opened(epub);
      for (const item of items) expect(files.has(item.path), item.path).toBe(true);
      const listed = new Set([...items.map((item) => item.path), opfPath]);
      for (const name of files.keys()) {
        if (name === 'mimetype' || name === 'META-INF/container.xml') continue;
        expect(listed.has(name), name).toBe(true);
      }
      expect(nav).toBeDefined();
      expect(spine.length).toBeGreaterThan(0);
      expect(spine).not.toContain('?');
    }
  });

  it('the package: title, creator, language, the identifier, and the modified time', async () => {
    const { opf } = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY))));
    const uid = opf.documentElement.getAttribute('unique-identifier');
    const identifier = opf.getElementById(uid ?? '');
    expect(identifier?.textContent).toBe(ID);
    const dc = (name: string) =>
      [...opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', name)].map(
        (e) => e.textContent,
      );
    expect(dc('title')).toEqual(['The Salt Road']);
    expect(dc('creator')).toEqual(['Wren Okafor']);
    expect(dc('language')).toEqual(['en']);
    const modified = opf.querySelector('meta[property="dcterms:modified"]');
    expect(modified?.textContent).toBe('2026-10-30T14:05:09Z');

    const none = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY), { author: '' })));
    expect(
      none.opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator'),
    ).toHaveLength(0);
    const odd = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY), { lang: 'not a tag' })));
    expect(
      odd.opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'language')[0]
        ?.textContent,
    ).toBe('en');
  });

  it('says its accessibility, and claims no conformance it has not been audited for', async () => {
    const { opf } = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY))));
    const metas = (property: string) =>
      [...opf.querySelectorAll('meta')]
        .filter((m) => m.getAttribute('property') === property)
        .map((m) => m.textContent);
    expect(metas('schema:accessMode')).toEqual(['textual']);
    expect(metas('schema:accessModeSufficient')).toEqual(['textual']);
    expect(metas('schema:accessibilityFeature')).toEqual([
      'structuralNavigation',
      'tableOfContents',
      'readingOrder',
      'displayTransformability',
    ]);
    expect(metas('schema:accessibilityHazard')).toEqual(['none']);
    const summary = metas('schema:accessibilitySummary');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatch(/table of contents/);
    // A script's names have colors, and the summary says each is printed beside its name.
    expect(summary[0]).toMatch(/character/);
    expect(summary[0]).toMatch(/color/);
    expect(opf.getElementsByTagNameNS('http://purl.org/dc/terms/', 'conformsTo')).toHaveLength(0);
    expect(metas('dcterms:conformsTo')).toEqual([]);
  });

  it("a document's summary says nothing of characters or their colors", async () => {
    const { opf } = await opened(renderDocumentEpub(documentInput('# One\n\nText.')));
    const summary = [...opf.querySelectorAll('meta')]
      .filter((m) => m.getAttribute('property') === 'schema:accessibilitySummary')
      .map((m) => m.textContent ?? '');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatch(/table of contents/);
    expect(summary[0]).not.toMatch(/character|beside its color/i);
  });

  it('an empty title is "Untitled" in the header, as in the package and the contents', async () => {
    for (const epub of [
      renderScriptEpub(scriptInput(lay(BARE), { title: '  ' })),
      renderDocumentEpub(documentInput('Just text.', { title: '' })),
    ]) {
      const { opf, docs, spine, nav } = await opened(epub);
      expect(
        opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent,
      ).toBe('Untitled');
      const first = docs.get(spine[0] ?? '');
      expect(first?.querySelector('header h1')?.textContent).toBe('Untitled');
      expect(first?.querySelector('title')?.textContent).toBe('Untitled');
      const links = [...(docs.get(nav?.path ?? '')?.querySelectorAll('nav a') ?? [])];
      expect(links[0]?.textContent).toBe('Untitled');
    }
  });

  it('refuses a date that is not one', () => {
    expect(() =>
      renderScriptEpub(scriptInput(lay(SCREENPLAY), { modified: new Date(Number.NaN) })),
    ).toThrow(RangeError);
  });

  it('the same export makes the same bytes', () => {
    const a = renderScriptEpub(scriptInput(lay(SCREENPLAY)));
    const b = renderScriptEpub(scriptInput(lay(SCREENPLAY)));
    expect(a).toEqual(b);
  });
});

describe('epubIdentifier', () => {
  const SHAPE = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("is the work's, not its text's: one project is one book across every edit", () => {
    const id = epubIdentifier({ project: 'a1b2c3', title: 'The Salt Road' });
    expect(id).toMatch(SHAPE);
    expect(epubIdentifier({ project: 'a1b2c3', title: 'The Salt Road' })).toBe(id);
    // A retitled script, or one with a new author, is still the same project and the same book.
    expect(epubIdentifier({ project: 'a1b2c3', title: 'Salt Road', author: 'W. Okafor' })).toBe(id);
    // Another project is another book, even under the same title.
    expect(epubIdentifier({ project: 'd4e5f6', title: 'The Salt Road' })).not.toBe(id);
  });

  it('without a project, is the title and the author: the same for the same, else different', () => {
    const id = epubIdentifier({ title: 'The Salt Road', author: 'Wren Okafor' });
    expect(id).toMatch(SHAPE);
    expect(epubIdentifier({ title: 'The Salt Road', author: 'Wren Okafor' })).toBe(id);
    expect(epubIdentifier({ title: 'The Salt Roads', author: 'Wren Okafor' })).not.toBe(id);
    expect(epubIdentifier({ title: 'The Salt Road' })).not.toBe(id);
    expect(epubIdentifier({ title: 'The Salt Road', author: '' })).toBe(
      epubIdentifier({ title: 'The Salt Road' }),
    );
    // The title and the author are kept apart, so moving a character between them changes it.
    expect(epubIdentifier({ title: 'ab', author: 'c' })).not.toBe(
      epubIdentifier({ title: 'a', author: 'bc' }),
    );
    // A project id never names the same book as a title that happens to equal it.
    expect(epubIdentifier({ project: 'x', title: 'x' })).not.toBe(epubIdentifier({ title: 'x' }));
  });
});

describe('scriptAuthor', () => {
  it("is the title page's Author, else empty", () => {
    expect(scriptAuthor(lay(SCREENPLAY).doc)).toBe('Wren Okafor');
    expect(scriptAuthor(lay(BARE).doc)).toBe('');
  });
});

describe('the content', () => {
  it('every content document parses as XHTML', async () => {
    for (const epub of [
      renderScriptEpub(scriptInput(lay(SCREENPLAY), { notes: 'include' })),
      renderScriptEpub(scriptInput(lay(STAGE_PLAY, stagePlay))),
      renderScriptEpub(scriptInput(lay(BARE))),
      renderScriptEpub(scriptInput(lay(''))),
      renderDocumentEpub(
        documentInput(
          '# One\n\nA line<br>\n\n---\n\n![a gull](g.png) and `code`.[^a]\n\n<div onclick="x()">raw</div>\n\n# Two\n\n> quoted\n\n1. one\n2. two\n\n[^a]: A *note*.\n',
        ),
      ),
      renderDocumentEpub(documentInput('')),
    ]) {
      const { docs, files } = await opened(epub);
      expect(docs.size).toBeGreaterThan(1);
      for (const [path, doc] of docs) {
        expect(doc.getElementsByTagName('parsererror'), path).toHaveLength(0);
        expect(doc.documentElement.namespaceURI, path).toBe(XHTML);
        expect(doc.documentElement.localName).toBe('html');
        const source = text(files.get(path));
        expect(source.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(source).toContain(`xmlns:epub="${OPS}"`);
        // None of the web page's own parts: no CSP, no switches, nothing hidden.
        expect(source).not.toContain('Content-Security-Policy');
        expect(source).not.toContain('data-toggle');
        expect(doc.querySelector('[hidden]'), path).toBeNull();
        expect(doc.querySelector('[style]'), path).toBeNull();
        expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toMatch(/\.css$/);
      }
      for (const name of ['META-INF/container.xml']) {
        expect(xml(text(files.get(name))).getElementsByTagName('parsererror')).toHaveLength(0);
      }
    }
  });

  it('the nav lists every act and, for a script, its scenes', async () => {
    const { docs, nav, base, spine } = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY))));
    const navDoc = docs.get(nav?.path ?? '') as Document;
    const toc = navDoc.querySelector('nav') as Element;
    expect(toc.getAttributeNS(OPS, 'type')).toBe('toc');
    const parts = [...toc.querySelectorAll(':scope > ol > li')];
    expect(parts.map((li) => li.querySelector(':scope > a')?.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);
    expect(
      parts.map((li) => [...li.querySelectorAll(':scope > ol > li > a')].map((a) => a.textContent)),
    ).toEqual([
      ['INT. LIGHTHOUSE KITCHEN - NIGHT'],
      ['EXT. CLIFF PATH - CONTINUOUS', 'INT. LANTERN ROOM - LATER'],
    ]);
    // One content document per act, and every link lands.
    expect(spine).toHaveLength(2);
    for (const a of toc.querySelectorAll('a')) {
      const target = land(docs, base, nav?.path ?? '', a.getAttribute('href') ?? '');
      expect(target, a.getAttribute('href') ?? '').toBeDefined();
      if (a.getAttribute('href')?.includes('#'))
        expect(target?.textContent).toContain(a.textContent);
    }
  });

  it("a stage play's acts are its parts, with its scenes' sections under them", async () => {
    const { spine, docs, nav } = await opened(
      renderScriptEpub(scriptInput(lay(STAGE_PLAY, stagePlay))),
    );
    expect(spine).toHaveLength(2);
    const toc = docs.get(nav?.path ?? '')?.querySelector('nav') as Element;
    expect([...toc.querySelectorAll(':scope > ol > li > a')].map((a) => a.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);
  });

  it('a script with no acts is one part, named by its title, with its scenes under it', async () => {
    const source = 'INT. HALL - DAY\n\nA door.\n\nEXT. YARD - NIGHT\n\nRain.\n';
    const { spine, docs, nav } = await opened(renderScriptEpub(scriptInput(lay(source))));
    expect(spine).toHaveLength(1);
    const toc = docs.get(nav?.path ?? '')?.querySelector('nav') as Element;
    expect([...toc.querySelectorAll(':scope > ol > li > a')].map((a) => a.textContent)).toEqual([
      'The Salt Road',
    ]);
    expect([...toc.querySelectorAll('ol ol a')].map((a) => a.textContent)).toEqual([
      'INT. HALL - DAY',
      'EXT. YARD - NIGHT',
    ]);
  });

  it('what comes before the first act is a part of its own, named by the title', async () => {
    const source = 'A gull on the rail.\n\n# ACT ONE\n\nINT. HALL - DAY\n\nA door.\n';
    const { spine, docs, nav } = await opened(renderScriptEpub(scriptInput(lay(source))));
    expect(spine).toHaveLength(2);
    const toc = docs.get(nav?.path ?? '')?.querySelector('nav') as Element;
    expect([...toc.querySelectorAll(':scope > ol > li > a')].map((a) => a.textContent)).toEqual([
      'The Salt Road',
      'ACT ONE',
    ]);
  });

  it("the nav lists a document's chapters (its # headings), else the document as one", async () => {
    const chapters = await opened(
      renderDocumentEpub(
        documentInput(
          '# The Lantern Keeper\n\nIntro.\n\n# One\n\nA.\n\n## A1\n\nx\n\n# Two\n\nB.\n',
        ),
      ),
    );
    // The first # is the title, which the first part's header shows: the intro is that part.
    const toc = chapters.docs.get(chapters.nav?.path ?? '')?.querySelector('nav') as Element;
    expect([...toc.querySelectorAll(':scope > ol > li > a')].map((a) => a.textContent)).toEqual([
      'The Lantern Keeper',
      'One',
      'Two',
    ]);
    expect(chapters.spine).toHaveLength(3);
    for (const a of toc.querySelectorAll('a')) {
      expect(land(chapters.docs, chapters.base, '', a.getAttribute('href') ?? '')).toBeDefined();
    }
    const one = await opened(renderDocumentEpub(documentInput('## Scene\n\nText.\n')));
    expect(one.spine).toHaveLength(1);
  });

  it("a script's EPUB is its Reading view: every speech once, in order", async () => {
    const laid = lay(SCREENPLAY);
    const { spine, docs } = await opened(renderScriptEpub(scriptInput(laid)));
    const host = document.createElement('div');
    host.innerHTML = readingHtml(laid.doc, laid.layout, 'leave-out').html;
    const want = [...host.querySelectorAll('.speech')].map((s) => s.textContent);
    const got = spine.flatMap((path) =>
      [...(docs.get(path) as Document).querySelectorAll('.speech')].map((s) => s.textContent),
    );
    expect(got).toEqual(want);
    expect(got.length).toBe(6);
    // The header, from the title page.
    const first = docs.get(spine[0] as string) as Document;
    expect(first.querySelector('h1')?.textContent).toBe('The Salt Road');
    expect(first.body.textContent).toContain('Written by Wren Okafor');
    // A character's name is printed, in its color's class.
    expect(first.querySelector('.who')?.className).toMatch(/\bk0\b/);
  });

  it('notes are in only with Include notes, and the boneyard never', async () => {
    const off = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY))));
    const on = await opened(renderScriptEpub(scriptInput(lay(SCREENPLAY), { notes: 'include' })));
    const all = (o: typeof on) => o.spine.map((p) => o.docs.get(p)?.body.textContent).join(' ');
    expect(all(off)).not.toContain('Make the rain louder');
    expect(all(on)).toContain('Make the rain louder');
    expect(all(on)).not.toContain('I cut this speech');
  });

  it('footnotes are EPUB footnotes, linked both ways', async () => {
    const source = [
      '# One',
      '',
      'The lamp.[^lamp] The keeper.[^keeper]',
      '',
      '# Two',
      '',
      'The lamp again.[^lamp] The sea.[^sea]',
      '',
      '[^lamp]: Built in 1871.',
      '[^keeper]: Ines, who counts the steps.[^steps]',
      '[^steps]: Ninety-one.',
      '[^sea]: Grey.',
      '',
    ].join('\n');
    const { docs, base, spine } = await opened(renderDocumentEpub(documentInput(source)));
    expect(spine).toHaveLength(2);
    const [one, two] = spine.map((p) => docs.get(p) as Document) as [Document, Document];
    const asideIds = (d: Document) =>
      [...d.getElementsByTagName('aside')]
        .filter((a) => a.getAttributeNS(OPS, 'type') === 'footnote')
        .map((a) => a.id);
    // Each note at the end of the chapter that first refers to it; one referred to inside a note
    // goes with that note.
    expect(asideIds(one)).toEqual(['fn-1', 'fn-2', 'fn-3']);
    expect(asideIds(two)).toEqual(['fn-4']);
    for (const [path, doc] of [
      [spine[0], one],
      [spine[1], two],
    ] as const) {
      const refs = [...doc.getElementsByTagName('a')].filter(
        (a) => a.getAttributeNS(OPS, 'type') === 'noteref',
      );
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        const note = land(docs, base, path as string, ref.getAttribute('href') ?? '');
        expect(note?.localName, ref.getAttribute('href') ?? '').toBe('aside');
        expect(note?.getAttributeNS(OPS, 'type')).toBe('footnote');
      }
      for (const aside of doc.getElementsByTagName('aside')) {
        const back = aside.querySelector('a.back');
        const target = land(docs, base, path as string, back?.getAttribute('href') ?? '');
        expect(target?.textContent).toBe(aside.id.slice(3));
      }
    }
    // The second chapter's reference to the first note goes to the first chapter.
    const again = [...two.getElementsByTagName('a')].find((a) => a.textContent === '1');
    expect(again?.getAttribute('href')).toBe(`${spine[0]?.slice(base.length)}#fn-1`);
  });

  it('hostile text escaped in content, title, and author', async () => {
    const hostile = `"><script>alert(1)</script>&amp; ' </dc:title><x/>]]>`;
    const script = `Title: x\n\nINT. ${hostile}\n\n${hostile}\n\n${hostile.toUpperCase().replace(/[<>]/g, '')}\n${hostile}\n`;
    for (const epub of [
      renderScriptEpub(
        scriptInput(lay(script), { title: hostile, author: hostile, id: `urn:uuid:${hostile}` }),
      ),
      renderDocumentEpub(
        documentInput(`# ${hostile}\n\n${hostile}\n\n<script>alert(2)</script>\n`, {
          title: hostile,
          author: hostile,
        }),
      ),
    ]) {
      const { opf, docs, files, nav } = await opened(epub);
      expect(opf.getElementsByTagName('parsererror')).toHaveLength(0);
      const dc = (name: string) =>
        opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', name)[0]?.textContent;
      expect(dc('title')).toBe(hostile);
      expect(dc('creator')).toBe(hostile);
      expect(opf.getElementsByTagName('x')).toHaveLength(0);
      for (const [path, doc] of docs) {
        expect(doc.getElementsByTagName('parsererror'), path).toHaveLength(0);
        expect(doc.getElementsByTagName('script'), path).toHaveLength(0);
        expect(doc.getElementsByTagName('x'), path).toHaveLength(0);
        expect(doc.title).toBe(hostile);
      }
      const navDoc = docs.get(nav?.path ?? '') as Document;
      expect(navDoc.getElementsByTagName('parsererror')).toHaveLength(0);
      const body = [...docs.values()].map((d) => d.body.textContent).join('');
      expect(body).toContain(hostile);
      expect(text(files.get('META-INF/container.xml'))).not.toContain('script');
    }
  });

  it('no script element and no http(s) reference anywhere', async () => {
    const namespaces = new Set([
      XHTML,
      OPS,
      'http://www.idpf.org/2007/opf',
      'http://purl.org/dc/elements/1.1/',
    ]);
    const check = async (epub: Uint8Array, links: string[]) => {
      const { files, docs } = await opened(epub);
      for (const [name, bytes] of files) {
        if (name.startsWith('EPUB/fonts/')) continue;
        const source = text(bytes);
        expect(source, name).not.toMatch(/<script/i);
        expect(source, name).not.toMatch(/\bon[a-z]+\s*=/i);
        expect(source, name).not.toMatch(/javascript:/i);
        for (const m of source.matchAll(/https?:\/\/[^\s"'<>)]*/g)) {
          const url = m[0];
          if (namespaces.has(url)) continue;
          // Only the writer's own links out, and only as links.
          expect(links, `${name}: ${url}`).toContain(url);
        }
        expect(source).not.toMatch(/url\(\s*["']?(?:https?:|\/\/)/);
      }
      for (const doc of docs.values()) {
        for (const e of doc.querySelectorAll('[src], link[href]')) {
          const url = e.getAttribute('src') ?? e.getAttribute('href') ?? '';
          expect(url).not.toMatch(/^(?:[a-z]+:|\/\/)/i);
        }
      }
    };
    await check(renderScriptEpub(scriptInput(lay(SCREENPLAY), { notes: 'include' })), []);
    await check(
      renderDocumentEpub(documentInput('# One\n\nPlain.\n\n![x](https://example.org/x.png)\n')),
      [],
    );
    await check(
      renderDocumentEpub(
        documentInput('# One\n\n[a site](https://example.org/a) and [bad](javascript:alert(1)).\n'),
      ),
      ['https://example.org/a'],
    );
  });

  it('Courier Prime only for a script, only styles used', async () => {
    const fontsOf = async (epub: Uint8Array) => {
      const { items, files } = await opened(epub);
      const css = items
        .filter((i) => i.type === 'text/css')
        .map((i) => text(files.get(i.path)))
        .join('');
      return {
        fonts: items.filter((i) => i.type.startsWith('font/')).map((i) => i.path),
        faces: [...css.matchAll(/@font-face/g)].length,
        css,
        files,
      };
    };
    const plain = await fontsOf(renderScriptEpub(scriptInput(lay('INT. HALL - DAY\n\nA door.\n'))));
    expect(plain.fonts).toEqual(['EPUB/fonts/courier-prime-regular.ttf']);
    expect(plain.faces).toBe(1);
    expect(plain.files.get('EPUB/fonts/courier-prime-regular.ttf')).toEqual(FONTS.regular);
    expect(plain.css).toContain('Courier Prime');

    const styled = await fontsOf(
      renderScriptEpub(scriptInput(lay('INT. HALL - DAY\n\nA **door**.\n\n~Sing *low*\n'))),
    );
    expect(styled.fonts.sort()).toEqual([
      'EPUB/fonts/courier-prime-bold.ttf',
      'EPUB/fonts/courier-prime-italic.ttf',
      'EPUB/fonts/courier-prime-regular.ttf',
    ]);
    expect(styled.faces).toBe(3);

    const all = await fontsOf(
      renderScriptEpub(scriptInput(lay('INT. HALL - DAY\n\n***All of it.***\n'))),
    );
    expect(all.fonts).toContain('EPUB/fonts/courier-prime-bold-italic.ttf');
    expect(all.fonts).not.toContain('EPUB/fonts/courier-prime-italic.ttf');

    const document = await fontsOf(renderDocumentEpub(documentInput('# One\n\n**Bold** *it*.\n')));
    expect(document.fonts).toEqual([]);
    expect(document.faces).toBe(0);
    expect(document.css).not.toContain('Courier Prime');
  });

  it('refuses a style the script needs that has no bytes', () => {
    expect(() =>
      renderScriptEpub(
        scriptInput(lay('INT. HALL - DAY\n\nA **door**.\n'), { fonts: { regular: FONTS.regular } }),
      ),
    ).toThrow(TypeError);
  });
});

/** The W3C's checker, where it is installed: `epubcheck` on the PATH. */
function epubcheck(): string | undefined {
  try {
    return (
      execFileSync('sh', ['-c', 'command -v epubcheck'], { encoding: 'utf8' }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

const checker = epubcheck();

/** Courier Prime's real files, as the app and the CLI embed them. */
const realFonts = () => {
  const file = (name: string) =>
    new Uint8Array(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../render-pdf/fonts', name)),
    );
  return {
    regular: file('CourierPrime-Regular.ttf'),
    bold: file('CourierPrime-Bold.ttf'),
    italic: file('CourierPrime-Italic.ttf'),
    boldItalic: file('CourierPrime-BoldItalic.ttf'),
  };
};

/** A novel-like document: several chapters, footnotes within and across them, a link out. */
const NOVEL = [
  '# The Lantern Keeper',
  '',
  'A story in three parts.[^tale]',
  '',
  '# One: The Stair',
  '',
  'Ines climbs the ninety-one steps.[^steps] The lamp is *older* than the town.',
  '',
  '## Night',
  '',
  '> The lamp turns, and the sea answers.',
  '',
  '# Two: The Ships',
  '',
  'She logs every ship,[^log] and the ones that never come.[^steps]',
  '',
  '- The *Marrow*, late.',
  '- The *Ost*, never.',
  '',
  '# Three: The Dark',
  '',
  'See [the keepers’ guild](https://example.org/guild) for the rest.[^end]',
  '',
  '```',
  'LAMP OFF 06:10',
  '```',
  '',
  '[^tale]: Told by the keeper’s daughter.',
  '[^steps]: Counted twice, every night.',
  '[^log]: In a ledger with a broken spine.[^ledger]',
  '[^ledger]: Bound in sailcloth.',
  '[^end]: Or so the ledger says.',
  '',
].join('\n');

/** Every message `epubcheck` gives for a book: its fatal errors, errors, and warnings. */
function findings(path: string): string[] {
  const run = spawnSync(checker as string, [path], { encoding: 'utf8' });
  const output = `${run.stdout}\n${run.stderr}`;
  return output.split('\n').filter((line) => /^(FATAL|ERROR|WARNING)\b/.test(line));
}

describe.skipIf(!checker)('epubcheck', () => {
  it('finds no error and no warning in a screenplay, a stage play, an untitled script, a document, and a novel', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drafter-epub-'));
    try {
      const fonts = realFonts();
      const books = {
        'screenplay.epub': renderScriptEpub(
          scriptInput(lay(SCREENPLAY), { notes: 'include', fonts }),
        ),
        'stage-play.epub': renderScriptEpub(scriptInput(lay(STAGE_PLAY, stagePlay), { fonts })),
        // No author and no title: "Untitled" throughout.
        'bare.epub': renderScriptEpub(scriptInput(lay(BARE), { fonts, author: '', title: '' })),
        'document.epub': renderDocumentEpub(
          documentInput(
            '# One\n\nText.[^a] [A link](https://example.org/).\n\n# Two\n\nMore.[^a]\n\n[^a]: A note.\n',
            { author: 'Ines Vale' },
          ),
        ),
        'novel.epub': renderDocumentEpub(
          documentInput(NOVEL, { title: 'The Lantern Keeper', author: 'Ines Vale' }),
        ),
      };
      const all: string[] = [];
      for (const [name, bytes] of Object.entries(books)) {
        const path = join(dir, name);
        writeFileSync(path, bytes);
        all.push(...findings(path).map((line) => `${name}: ${line}`));
      }
      expect(all).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
