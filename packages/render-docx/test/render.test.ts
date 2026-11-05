import { readFileSync } from 'node:fs';
import { listZip, readEntry } from '@drafter/archive';
import { parseMarkdown } from '@drafter/markdown';
import { type Manuscript, manuscriptOf, resolveDetails, wordsLabel } from '@drafter/novel';
import type { Paper } from '@drafter/templates';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderManuscriptDocx } from '../src/index';

const book = readFileSync(
  new URL('../../novel/test/fixtures/manuscript-book.md', import.meta.url),
  'utf8',
);

const KEPT = {
  byline: 'R. Vale',
  legalName: 'Rosa Vale',
  contact: ['1 Quay Lane', 'Harbourside', 'rosa@vale.example'],
};

const fixture = (kept: object = KEPT): Manuscript =>
  manuscriptOf(book, parseMarkdown(book), resolveDetails(book, 'File', kept));

const PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'docProps/core.xml',
  'docProps/app.xml',
  'word/document.xml',
  'word/styles.xml',
  'word/settings.xml',
  'word/header1.xml',
  'word/_rels/document.xml.rels',
];

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const { DOMParser } = new JSDOM('').window;

/** Every part of the zip, by name, as text. */
async function unzip(bytes: Uint8Array): Promise<Map<string, string>> {
  const parts = new Map<string, string>();
  for (const entry of listZip(bytes)) {
    parts.set(entry.name, new TextDecoder().decode(await readEntry(bytes, entry)));
  }
  return parts;
}

async function render(
  ms: Manuscript,
  opts: { paper?: Paper; lang?: string } = {},
): Promise<Map<string, string>> {
  return unzip(
    renderManuscriptDocx(ms, { paper: opts.paper ?? 'letter', lang: opts.lang ?? 'en-US' }),
  );
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

const attr = (el: Element, name: string) => el.getAttributeNS(W, name);

/** A paragraph's style id, or '' for Normal. */
function styleOf(p: Element): string {
  const s = p.getElementsByTagNameNS(W, 'pStyle')[0];
  return s ? (attr(s, 'val') ?? '') : '';
}

/** A paragraph's text, a tab as '\t'. */
function textOf(p: Element): string {
  let out = '';
  const walk = (n: Element) => {
    for (const c of Array.from(n.children)) {
      if (c.localName === 't') out += c.textContent ?? '';
      else if (c.localName === 'tab' && n.localName === 'r') out += '\t';
      else walk(c);
    }
  };
  walk(p);
  return out;
}

function bodyParagraphs(doc: Document): Element[] {
  const body = doc.getElementsByTagNameNS(W, 'body')[0] as Element;
  return Array.from(body.children).filter((c) => c.localName === 'p');
}

function style(styles: Document, id: string): Element {
  const found = Array.from(styles.getElementsByTagNameNS(W, 'style')).find(
    (s) => attr(s, 'styleId') === id,
  );
  if (!found) throw new Error(`no style ${id}`);
  return found;
}

const child = (el: Element, name: string) => el.getElementsByTagNameNS(W, name)[0];

describe('renderManuscriptDocx: the package', () => {
  let parts: Map<string, string>;
  let bytes: Uint8Array;
  beforeAll(async () => {
    bytes = renderManuscriptDocx(fixture(), { paper: 'letter', lang: 'en-US' });
    parts = await unzip(bytes);
  });

  it('holds exactly the parts a .docx needs, the content types first', () => {
    const names = listZip(bytes).map((e) => e.name);
    expect(names[0]).toBe('[Content_Types].xml');
    expect([...names].sort()).toEqual([...PARTS].sort());
  });

  it('writes every part as well-formed XML', () => {
    for (const [name, xml] of parts) {
      expect(xml.startsWith('<?xml'), name).toBe(true);
      expect(parse(xml).getElementsByTagName('parsererror').length, name).toBe(0);
    }
  });

  it('names every part in the content types and the relationships', () => {
    const types = parts.get('[Content_Types].xml') ?? '';
    for (const name of PARTS.filter((n) => !n.endsWith('.rels') && n !== '[Content_Types].xml')) {
      expect(types, name).toContain(`PartName="/${name}"`);
    }
    expect(types).toContain('Extension="rels"');
    const root = parts.get('_rels/.rels') ?? '';
    for (const target of ['word/document.xml', 'docProps/core.xml', 'docProps/app.xml']) {
      expect(root).toContain(`Target="${target}"`);
    }
    const doc = parts.get('word/_rels/document.xml.rels') ?? '';
    for (const target of ['styles.xml', 'settings.xml', 'header1.xml']) {
      expect(doc).toContain(`Target="${target}"`);
    }
  });

  it('holds one field, the PAGE field in the header, and nothing that makes Word ask to update', () => {
    let fields = 0;
    for (const [name, xml] of parts) {
      const here = xml.split('w:fldSimple').length - 1;
      if (here > 0) expect(name).toBe('word/header1.xml');
      fields += here;
      expect(xml, name).not.toContain('w:instrText');
      expect(xml, name).not.toContain('w:fldChar');
      expect(xml, name).not.toContain('updateFields');
      expect(xml, name).not.toContain('TargetMode="External"');
    }
    // `<w:fldSimple w:instr=" PAGE "/>`: the name once, with no cached number to go stale.
    expect(fields).toBe(1);
    const header = parse(parts.get('word/header1.xml') ?? '');
    const simple = header.getElementsByTagNameNS(W, 'fldSimple');
    expect(simple.length).toBe(1);
    expect(parts.get('word/header1.xml')).toContain('w:instr=" PAGE "');
    expect(attr(simple[0] as Element, 'instr')).toBe(' PAGE ');
  });

  it('is the same bytes for the same manuscript', () => {
    const again = renderManuscriptDocx(fixture(), { paper: 'letter', lang: 'en-US' });
    expect(again).toEqual(bytes);
  });
});

describe('renderManuscriptDocx: settings and styles', () => {
  it('sets Word 2013 compatibility, the language, and no updateFields', async () => {
    const parts = await render(fixture(), { lang: 'en-GB' });
    const settings = parse(parts.get('word/settings.xml') ?? '');
    const compat = Array.from(settings.getElementsByTagNameNS(W, 'compatSetting')).find(
      (c) => attr(c, 'name') === 'compatibilityMode',
    );
    expect(compat && attr(compat, 'val')).toBe('15');
    expect(parts.get('word/settings.xml')).not.toContain('trackRevisions');
    expect(parts.get('word/settings.xml')).not.toContain('documentProtection');
    const styles = parse(parts.get('word/styles.xml') ?? '');
    const lang = child(child(styles.documentElement, 'rPrDefault') as Element, 'lang') as Element;
    expect(attr(lang, 'val')).toBe('en-GB');
  });

  it('defaults to 12 pt Times New Roman, double-spaced, with a half-inch first-line indent', async () => {
    const parts = await render(fixture());
    const styles = parse(parts.get('word/styles.xml') ?? '');
    const rPr = child(styles.documentElement, 'rPrDefault') as Element;
    const pPr = child(styles.documentElement, 'pPrDefault') as Element;
    expect(attr(child(rPr, 'rFonts') as Element, 'ascii')).toBe('Times New Roman');
    expect(attr(child(rPr, 'sz') as Element, 'val')).toBe('24');
    expect(attr(child(pPr, 'spacing') as Element, 'line')).toBe('480');
    // Word's own Double, which the Paragraph dialog names so and which grows with the font.
    expect(attr(child(pPr, 'spacing') as Element, 'lineRule')).toBe('auto');
    expect(attr(child(pPr, 'ind') as Element, 'firstLine')).toBe('720');
    expect(attr(child(rPr, 'lang') as Element, 'val')).toBe('en-US');
  });

  it('falls back to en-US when given no language', async () => {
    const parts = await render(fixture(), { lang: ' ' });
    expect(parts.get('word/styles.xml')).toContain('<w:lang w:val="en-US"');
  });

  it('defaults to Courier New for a Courier manuscript', async () => {
    const parts = await render({ ...fixture(), font: 'courier' });
    const styles = parse(parts.get('word/styles.xml') ?? '');
    const rPr = child(styles.documentElement, 'rPrDefault') as Element;
    expect(attr(child(rPr, 'rFonts') as Element, 'ascii')).toBe('Courier New');
    expect(parts.get('word/styles.xml')).not.toContain('Times New Roman');
  });

  it('defines every style the book uses, by name', async () => {
    const parts = await render(fixture());
    const styles = parse(parts.get('word/styles.xml') ?? '');
    for (const id of [
      'Normal',
      'Title',
      'Byline',
      'Contact',
      'ChapterTitle',
      'PartTitle',
      'SceneBreak',
      'Quote',
      'ListParagraph',
      'Code',
      'End',
      'Header',
    ]) {
      expect(style(styles, id)).toBeTruthy();
    }
    const quote = child(style(styles, 'Quote'), 'ind') as Element;
    expect(attr(quote, 'left')).toBe('720');
    expect(attr(quote, 'right')).toBe('720');
    const code = style(styles, 'Code');
    expect(attr(child(code, 'ind') as Element, 'firstLine')).toBe('0');
    // A code line is in the manuscript's own font, as the PDF prints it.
    expect(child(code, 'rFonts')).toBeUndefined();
    const contact = child(style(styles, 'Contact'), 'spacing') as Element;
    expect(attr(contact, 'line')).toBe('240');
    // True single spacing, so Word never clips an accented capital or a descender.
    expect(attr(contact, 'lineRule')).toBe('auto');
    expect(attr(child(style(styles, 'Contact'), 'ind') as Element, 'firstLine')).toBe('0');
    expect(attr(child(style(styles, 'Header'), 'jc') as Element, 'val')).toBe('right');
  });

  for (const [paper, chapter, part] of [
    ['letter', '3840', '6480'],
    ['a4', '4173', '6979'],
  ] as const) {
    it(`puts a chapter's title a third down and a part's halfway on ${paper}`, async () => {
      const parts = await render(fixture(), { paper });
      const styles = parse(parts.get('word/styles.xml') ?? '');
      const ch = style(styles, 'ChapterTitle');
      expect(child(ch, 'pageBreakBefore')).toBeTruthy();
      expect(attr(child(ch, 'spacing') as Element, 'before')).toBe(chapter);
      expect(attr(child(ch, 'jc') as Element, 'val')).toBe('center');
      const pt = style(styles, 'PartTitle');
      expect(child(pt, 'pageBreakBefore')).toBeTruthy();
      expect(attr(child(pt, 'spacing') as Element, 'before')).toBe(part);
      expect(attr(child(pt, 'jc') as Element, 'val')).toBe('center');
    });
  }
});

describe('renderManuscriptDocx: the document', () => {
  for (const [paper, w, h] of [
    ['letter', '12240', '15840'],
    ['a4', '11906', '16838'],
  ] as const) {
    it(`has one-inch margins, a header half an inch down, and a ${paper} page`, async () => {
      const parts = await render(fixture(), { paper });
      const doc = parse(parts.get('word/document.xml') ?? '');
      const sect = child(doc.documentElement, 'sectPr') as Element;
      expect(child(sect, 'titlePg')).toBeTruthy();
      const mar = child(sect, 'pgMar') as Element;
      for (const side of ['top', 'right', 'bottom', 'left']) expect(attr(mar, side)).toBe('1440');
      expect(attr(mar, 'header')).toBe('720');
      const size = child(sect, 'pgSz') as Element;
      expect(attr(size, 'w')).toBe(w);
      expect(attr(size, 'h')).toBe(h);
      const ref = child(sect, 'headerReference') as Element;
      expect(attr(ref, 'type')).toBe('default');
    });
  }

  it('prints the title page: legal name, contact lines, the word count, the title, and the byline', async () => {
    const ms = fixture();
    const doc = parse((await render(ms)).get('word/document.xml') ?? '');
    const ps = bodyParagraphs(doc);
    expect(ps.slice(0, 4).map(styleOf)).toEqual(['Contact', 'Contact', 'Contact', 'Contact']);
    expect(ps.slice(0, 4).map(textOf)).toEqual([
      `Rosa Vale\t${ms.wordsLabel}`,
      '1 Quay Lane',
      'Harbourside',
      'rosa@vale.example',
    ]);
    expect(ms.wordsLabel).toMatch(/^about [\d,]+ words$/);
    // The word count sits at a right tab on the text's right edge.
    const tab = child(child(ps[0] as Element, 'tabs') as Element, 'tab') as Element;
    expect(attr(tab, 'val')).toBe('right');
    expect(attr(tab, 'pos')).toBe('9360');
    expect(styleOf(ps[4] as Element)).toBe('Title');
    // Halfway down: 6480 twips below the margin, less four single-spaced rows of about 276.
    const before = child(child(ps[4] as Element, 'pPr') as Element, 'spacing') as Element;
    expect(attr(before, 'before')).toBe(String(6480 - 4 * 276));
    expect(textOf(ps[4] as Element)).toBe('The Salt Road');
    expect(styleOf(ps[5] as Element)).toBe('Byline');
    expect(textOf(ps[5] as Element)).toBe('by R. Vale');
  });

  it('prints the word count alone when there are no contact details', async () => {
    const ms = { ...fixture({}), wordsLabel: wordsLabel(87_000) };
    const doc = parse((await render(ms)).get('word/document.xml') ?? '');
    const ps = bodyParagraphs(doc);
    expect(styleOf(ps[0] as Element)).toBe('Contact');
    expect(textOf(ps[0] as Element)).toBe('\tabout 87,000 words');
    expect(styleOf(ps[1] as Element)).toBe('Title');
    // One row, for the word count's, on A4 as on Letter.
    const a4 = bodyParagraphs(
      parse((await render(ms, { paper: 'a4' })).get('word/document.xml') ?? ''),
    );
    const before = child(child(a4[1] as Element, 'pPr') as Element, 'spacing') as Element;
    expect(attr(before, 'before')).toBe(String(6979 - 276));
  });

  it('writes parts, chapters, breaks, quotes, lists, code, and END in their styles', async () => {
    const doc = parse((await render(fixture())).get('word/document.xml') ?? '');
    const ps = bodyParagraphs(doc);
    const book = ps.slice(6);
    const seen = book.map((p) => [styleOf(p), textOf(p)]);
    expect(seen[0]).toEqual(['PartTitle', 'Part One: The Tide']);
    expect(seen[1]).toEqual(['ChapterTitle', 'The Salt Road']);
    expect(seen.filter(([s]) => s === 'ChapterTitle').map(([, t]) => t)).toEqual([
      'The Salt Road',
      'Chapter 2',
      'The Night Watch',
    ]);
    expect(seen.filter(([s]) => s === 'SceneBreak')).toEqual([
      ['SceneBreak', '#'],
      ['SceneBreak', '#'],
    ]);
    expect(seen).toContainEqual([
      'Quote',
      'The sea keeps what it is given, her grandmother used to say, and returns only what it must.',
    ]);
    expect(seen).toContainEqual(['ListParagraph', '• two candles']);
    expect(seen).toContainEqual(['ListParagraph', '1. The tide tables were wrong.']);
    expect(seen).toContainEqual(['Code', 'tide: low at six']);
    expect(seen).toContainEqual(['', '[Image: A lamp in a window]']);
    expect(seen).toContainEqual(['', 'An aside']);
    // END after the last chapter's text, then the notes on a page of their own.
    const end = seen.findIndex(([s]) => s === 'End');
    expect(seen[end]).toEqual(['End', 'END']);
    expect(seen[end - 1]).toEqual([
      '',
      'On the third night she stayed awake and watched the water draw back from the stones.',
    ]);
    expect(seen[end + 1]).toEqual(['NotesTitle', 'Notes']);
    expect(seen[end + 2]?.[1]).toBe(
      '1. Built in 1871, by the harbour board, and never staffed again.',
    );
    expect(seen.length).toBe(end + 3);
  });

  it('centres a scene break, END, and the Notes heading, and breaks the page before the notes', async () => {
    const styles = parse((await render(fixture())).get('word/styles.xml') ?? '');
    for (const id of ['SceneBreak', 'End', 'NotesTitle', 'Title', 'Byline']) {
      expect(attr(child(style(styles, id), 'jc') as Element, 'val'), id).toBe('center');
    }
    expect(child(style(styles, 'NotesTitle'), 'pageBreakBefore')).toBeTruthy();
  });

  it('leaves out the notes when there are none', async () => {
    const xml = (await render({ ...fixture(), notes: [] })).get('word/document.xml') ?? '';
    expect(xml).not.toContain('NotesTitle');
    const ps = bodyParagraphs(parse(xml));
    expect(styleOf(ps.at(-1) as Element)).toBe('End');
  });

  it('starts the book on a new page when it begins with text, and after a part', async () => {
    const ms: Manuscript = {
      ...fixture(),
      blocks: [
        { kind: 'paragraph', style: 'body', runs: [{ text: 'Before.' }] },
        { kind: 'part', title: 'Part Two' },
        { kind: 'paragraph', style: 'body', runs: [{ text: 'After.' }] },
        { kind: 'end' },
      ],
      notes: [],
    };
    const ps = bodyParagraphs(parse((await render(ms)).get('word/document.xml') ?? ''));
    const before = ps.find((p) => textOf(p) === 'Before.') as Element;
    const after = ps.find((p) => textOf(p) === 'After.') as Element;
    const end = ps.find((p) => textOf(p) === 'END') as Element;
    expect(child(before, 'pageBreakBefore')).toBeTruthy();
    expect(child(after, 'pageBreakBefore')).toBeTruthy();
    expect(child(end, 'pageBreakBefore')).toBeUndefined();
  });

  it('marks italic runs with w:i and bold with w:b', async () => {
    const doc = parse((await render(fixture())).get('word/document.xml') ?? '');
    const runs = Array.from(doc.getElementsByTagNameNS(W, 'r'));
    const run = (text: string) => runs.find((r) => textOf(r) === text) as Element;
    expect(child(run('promised'), 'i')).toBeTruthy();
    expect(child(run('promised'), 'b')).toBeUndefined();
    expect(child(run('nearly'), 'b')).toBeTruthy();
    expect(child(run('nearly'), 'i')).toBeUndefined();
    expect(child(run(' a mile.'), 'rPr')).toBeUndefined();
  });

  it('keeps spaces and turns a tab into a tab and a line break into a space', async () => {
    const ms: Manuscript = {
      ...fixture(),
      blocks: [
        { kind: 'paragraph', style: 'code', runs: [{ text: '  a\tb  ', code: true }] },
        { kind: 'paragraph', style: 'body', runs: [{ text: 'one\ntwo' }] },
        { kind: 'end' },
      ],
    };
    const xml = (await render(ms)).get('word/document.xml') ?? '';
    const ps = bodyParagraphs(parse(xml));
    expect(ps.map(textOf)).toContain('  a\tb  ');
    expect(ps.map(textOf)).toContain('one two');
    expect(xml).toContain('xml:space="preserve"');
  });
});

describe('renderManuscriptDocx: the header and the properties', () => {
  it('prints Surname / SHORT TITLE / then the page number', async () => {
    const header = parse((await render(fixture())).get('word/header1.xml') ?? '');
    const p = child(header.documentElement, 'p') as Element;
    expect(styleOf(p)).toBe('Header');
    const kids = Array.from(p.children).filter((c) => c.localName !== 'pPr');
    expect(kids.map((k) => k.localName)).toEqual(['r', 'fldSimple']);
    expect(textOf(kids[0] as Element)).toBe('Vale / THE SALT ROAD / ');
  });

  it('leaves out an empty surname, and prints only the number with neither', async () => {
    const noName = parse(
      (await render({ ...fixture(), surname: '' })).get('word/header1.xml') ?? '',
    );
    const p = child(noName.documentElement, 'p') as Element;
    expect(textOf(child(p, 'r') as Element)).toBe('THE SALT ROAD / ');
    const bare = parse(
      (await render({ ...fixture(), surname: '', shortTitle: ' ' })).get('word/header1.xml') ?? '',
    );
    const q = child(bare.documentElement, 'p') as Element;
    const kids = Array.from(q.children).filter((c) => c.localName !== 'pPr');
    expect(kids.map((k) => k.localName)).toEqual(['fldSimple']);
  });

  it('names the title and the byline as the creator, and nothing else about the writer', async () => {
    const parts = await render(fixture());
    const core = parts.get('docProps/core.xml') ?? '';
    expect(core).toContain('<dc:title>The Salt Road</dc:title>');
    expect(core).toContain('<dc:creator>R. Vale</dc:creator>');
    const both = core + (parts.get('docProps/app.xml') ?? '');
    for (const private_ of ['Rosa', 'Quay', 'Harbourside', 'rosa@']) {
      expect(both).not.toContain(private_);
    }
    expect(core).not.toContain('lastModifiedBy');
    expect(parts.get('docProps/app.xml')).not.toContain('<Company>');
  });

  it('writes the creation date only when given one', async () => {
    const plain = await render(fixture());
    expect(plain.get('docProps/core.xml')).not.toContain('dcterms:created');
    const dated = await unzip(
      renderManuscriptDocx(fixture(), {
        paper: 'letter',
        lang: 'en-US',
        created: new Date('2026-11-05T10:20:30.456Z'),
      }),
    );
    expect(dated.get('docProps/core.xml')).toContain(
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-11-05T10:20:30Z</dcterms:created>',
    );
  });
});

describe('renderManuscriptDocx: an empty book and an empty title', () => {
  for (const [what, ms] of [
    ['an empty book', { ...fixture(), blocks: [], notes: [] }],
    ['an empty title', { ...fixture(), title: '', shortTitle: '' }],
    ['an empty title and book', { ...fixture({}), title: '  ', blocks: [], notes: [] }],
  ] as [string, Manuscript][]) {
    it(`writes ${what} as a well-formed file with the one field`, async () => {
      const parts = await render(ms);
      expect([...parts.keys()].sort()).toEqual([...PARTS].sort());
      let fields = 0;
      for (const [name, xml] of parts) {
        expect(parse(xml).getElementsByTagName('parsererror').length, name).toBe(0);
        const here = xml.split('w:fldSimple').length - 1;
        if (here > 0) expect(name).toBe('word/header1.xml');
        fields += here;
        for (const banned of [
          'w:instrText',
          'w:fldChar',
          'updateFields',
          'TargetMode="External"',
        ]) {
          expect(xml, `${name}: ${banned}`).not.toContain(banned);
        }
      }
      expect(fields).toBe(1);
      const core = parts.get('docProps/core.xml') ?? '';
      expect(core).not.toMatch(/<dc:title>\s*<\/dc:title>|<dc:title\/>/);
      if (ms.title.trim() === '') expect(core).not.toContain('dc:title');
    });
  }
});

describe('renderManuscriptDocx: XML-looking text (review focus 1)', () => {
  const HOSTILE = '<w:fldChar w:fldCharType="begin"/> ]]> &amp; \u0000 ￾ end';

  it('prints it as text, never as XML, and adds no field', async () => {
    const ms: Manuscript = {
      ...fixture(),
      title: `Title ${HOSTILE}`,
      byline: `By ${HOSTILE}`,
      surname: `Sur ${HOSTILE}`,
      contact: [`Contact ${HOSTILE}`],
      blocks: [
        { kind: 'chapter', title: `Chapter ${HOSTILE}` },
        { kind: 'paragraph', style: 'body', runs: [{ text: `Para ${HOSTILE}` }] },
        { kind: 'end' },
      ],
      notes: [[{ text: `Note ${HOSTILE}` }]],
    };
    const parts = await render(ms);
    let fields = 0;
    for (const [name, xml] of parts) {
      const doc = parse(xml);
      expect(doc.getElementsByTagName('parsererror').length, name).toBe(0);
      expect(doc.getElementsByTagNameNS(W, 'fldChar').length, name).toBe(0);
      expect(doc.getElementsByTagNameNS(W, 'instrText').length, name).toBe(0);
      const here = doc.getElementsByTagNameNS(W, 'fldSimple').length;
      if (here > 0) expect(name).toBe('word/header1.xml');
      fields += here;
      expect(xml, name).not.toContain('<w:fldChar');
      expect(xml, name).not.toContain('\u0000');
      expect(xml, name).not.toContain('￾');
    }
    expect(fields).toBe(1);
    const shown = '<w:fldChar w:fldCharType="begin"/> ]]> &amp;   end';
    const ps = bodyParagraphs(parse(parts.get('word/document.xml') ?? ''));
    const texts = ps.map(textOf);
    expect(texts).toContain(`Para ${shown}`);
    expect(texts).toContain(`Chapter ${shown}`);
    expect(texts).toContain(`Title ${shown}`);
    expect(texts).toContain(`by By ${shown}`);
    expect(texts.some((t) => t.startsWith(`Contact ${shown}`))).toBe(true);
    expect(texts).toContain(`1. Note ${shown}`);
    const header = parse(parts.get('word/header1.xml') ?? '');
    expect(header.documentElement.textContent).toContain(`Sur ${shown} / `);
    const core = parse(parts.get('docProps/core.xml') ?? '');
    expect(core.documentElement.textContent).toContain(`Title ${shown}`);
  });
});
