import {
  type DocItem,
  type DocNode,
  type DocumentFontSet,
  type Face,
  fontMeasure,
  layoutDocument,
  type RenderProgress,
  renderDocumentPdf,
} from '@drafter/render-pdf';
import type { Paper } from '@drafter/templates';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { layoutFeatures } from '../src/document/fonts';
import { md } from './document-helpers';
import {
  annotations,
  documentFonts,
  embeddedFonts,
  extract,
  fontPrograms,
  itemAt,
  objects,
  operators,
} from './helpers';

const measure = fontMeasure(documentFonts);
const FONT_NAMES: Record<Face, string> = {
  text: 'InterTight-Regular',
  textItalic: 'InterTight-Italic',
  textBold: 'InterTight-SemiBold',
  textBoldItalic: 'InterTight-SemiBoldItalic',
  code: 'CourierPrime-Regular',
};
const render = (
  source: string,
  opts: {
    paper?: Paper;
    title?: string;
    lang?: string;
    onProgress?: (progress: RenderProgress) => void;
  } = {},
) => renderDocumentPdf(md(source), { fonts: documentFonts, paper: 'letter', ...opts });
const layout = (source: string, paper: Paper = 'letter') =>
  layoutDocument(md(source), { paper, measure });
type TextDocItem = Extract<DocItem, { kind: 'text' }>;
type LinkDocItem = Extract<DocItem, { kind: 'link' }>;
const texts = (items: DocItem[]) => items.filter((i): i is TextDocItem => i.kind === 'text');
const links = (items: DocItem[]) => items.filter((i): i is LinkDocItem => i.kind === 'link');
const near = (a: number, b: number, within = 0.01) => Math.abs(a - b) <= within;

/** Paragraphs of a harbour town's morning, enough to fill `pages` pages of US Letter or more. */
const harbour = (paragraphs: number) =>
  Array.from(
    { length: paragraphs },
    (_, i) =>
      `Morning ${i + 1}: the ferry leaves the harbour at seven, the gulls follow it out past the breakwater, and the café on the quay sets its chairs out one by one while the baker carries trays across the square.`,
  ).join('\n\n');

describe('renderDocumentPdf', () => {
  it('a page is US Letter or A4 as asked', async () => {
    const [letter] = await extract((await render('The tide is out.')).bytes);
    const [a4] = await extract((await render('The tide is out.', { paper: 'a4' })).bytes);
    expect([letter?.width, letter?.height]).toEqual([612, 792]);
    expect([a4?.width, a4?.height]).toEqual([595.28, 841.89]);
  });

  it('draws the text where the layout puts it, in its fonts', async () => {
    const source =
      '# The lighthouse keeper\n\nShe trims the wick and fills the `lamp.oil` reservoir.';
    const [page] = await extract((await render(source)).bytes, { fontNames: true });
    const [heading, paragraph, code] = texts(layout(source).pages[0]?.items ?? []);
    expect(heading?.text).toBe('The lighthouse keeper');
    expect(itemAt(page, heading?.x ?? 0, heading?.y ?? 0)).toMatchObject({
      str: 'The lighthouse keeper',
      fontName: 'InterTight-SemiBold',
    });
    expect(paragraph?.x).toBe(72);
    expect(itemAt(page, 72, paragraph?.y ?? 0)).toMatchObject({
      str: 'She trims the wick and fills the',
      fontName: 'InterTight-Regular',
    });
    expect(code?.text).toBe('lamp.oil');
    expect(itemAt(page, code?.x ?? 0, code?.y ?? 0)).toMatchObject({
      str: 'lamp.oil',
      fontName: 'CourierPrime-Regular',
    });
  });

  it('draws each style in its own face', async () => {
    const source = 'Plain, *slanted*, **heavy**, and ***both***.';
    const [page] = await extract((await render(source)).bytes, { fontNames: true });
    const fontOf = (str: string) => page?.items.find((item) => item.str === str)?.fontName;
    expect(['slanted', 'heavy', 'both'].map(fontOf)).toEqual([
      'InterTight-Italic',
      'InterTight-SemiBold',
      'InterTight-SemiBoldItalic',
    ]);
  });

  it('draws each string exactly as wide as the layout measured it', async () => {
    // Inter Tight's contextual alternates change these strings' widths when drawn whole.
    const source = 'Pages 1x2 -> office fjord. `x->y` and `1x2`.';
    const [page] = await extract((await render(source)).bytes);
    const fragments = texts(layout(source).pages[0]?.items ?? []);
    expect(fragments.length).toBeGreaterThan(2);
    for (const fragment of fragments) {
      // pdfjs gives a string's leading and trailing spaces items of their own.
      const drawn = fragment.text.trim();
      const lead = fragment.text.slice(0, fragment.text.length - fragment.text.trimStart().length);
      const x = fragment.x + measure.width(lead, fragment.face, fragment.size);
      const item = itemAt(page, x, fragment.y);
      expect(item?.str).toBe(drawn);
      expect(item?.width ?? 0).toBeCloseTo(measure.width(drawn, fragment.face, fragment.size), 3);
    }
  });

  it('draws code panels under their code, and rules, quote bars, and underlines', async () => {
    const source = '> Quoted.\n\n---\n\n```\nhaul(rope)\n```\n\n[Tides](https://drafter.dev/tides)';
    const ops = await operators((await render(source)).bytes, 0);
    const gray = (v: number) => `${v} ${v} ${v}`;
    // The panel is filled before any text is drawn, so its code shows on it.
    const panel = ops.indexOf(`${gray(0xf3 / 255)} rg`);
    expect(panel).toBeGreaterThanOrEqual(0);
    expect(panel).toBeLessThan(ops.indexOf('Tj'));
    // The quote's 2 pt bar is centred 1 pt into its indent; the rule spans the text width.
    expect(ops).toMatch(new RegExp(`${gray(0x9a / 255)} RG\\n2 w\\n\\[\\] 0 d\\n73 [\\d.]+ m`));
    expect(ops).toMatch(
      new RegExp(
        `${gray(0x9a / 255)} RG\\n0\\.5 w\\n\\[\\] 0 d\\n72 [\\d.]+ m\\n72 [\\d.]+ m\\n540 [\\d.]+ l`,
      ),
    );
    // A link's text and its underline are link blue.
    const blue = [0x1f, 0x4e, 0x9a].map((v) => v / 255).join(' ');
    expect(ops).toContain(`${blue} rg`);
    expect(ops).toMatch(new RegExp(`${blue} RG\\n0\\.5 w`));
  });

  it('reads back in order, with spaces, so search and copy work', async () => {
    const source = [
      '## Notes from the quay',
      'The fishmonger opens at six, *before* the ferry, and sells out of **mackerel** by nine; the `chalkboard` says so in letters a hand high, rewritten every morning in the same careful way.',
      '- Rope\n- Nets, mended',
      '> Ask the harbourmaster.',
    ].join('\n\n');
    const [page] = await extract((await render(source)).bytes, { spaces: true });
    // Items on one baseline join as drawn; lines join with a space, as a viewer's copy does.
    const rows = new Map<number, string>();
    for (const item of page?.items ?? []) {
      const y = Math.round(item.y * 100);
      rows.set(y, (rows.get(y) ?? '') + item.str);
    }
    const read = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, text]) => text.trim())
      .join(' ');
    expect(read).toBe(
      'Notes from the quay The fishmonger opens at six, before the ferry, and sells out of mackerel by nine; the chalkboard says so in letters a hand high, rewritten every morning in the same careful way. • Rope • Nets, mended Ask the harbourmaster.',
    );
  });

  it('prints a footnote at the foot of its page, numbered as its raised reference', async () => {
    const source =
      'The ferry leaves at seven.[^ferry] The gulls follow it.\n\n[^ferry]: In summer; at eight in winter.\n';
    const [page] = await extract((await render(source)).bytes, { spaces: true });
    const items = page?.items ?? [];
    const note = items.find((item) => item.str.includes('In summer'));
    const marker = items.find((item) => item.str === '1.');
    const sup = items.find((item) => item.str === '1');
    const body = items.find((item) => item.str.startsWith('The ferry'));
    // The note sits near the bottom margin, under the text; the reference is raised above its line.
    expect(note?.y).toBeLessThan(200);
    expect(note?.y).toBeGreaterThanOrEqual(72);
    expect(marker?.y).toBeCloseTo(note?.y ?? 0, 1);
    expect(sup?.y).toBeGreaterThan(body?.y ?? 0);
  });

  it('a link is an annotation to its address', async () => {
    const source = 'Check [the tide tables](https://drafter.dev/tides) before sailing.';
    const { bytes } = await render(source);
    const [link] = links(layout(source).pages[0]?.items ?? []);
    const found = await annotations(bytes, 0);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('https://drafter.dev/tides');
    const want = [
      link?.x,
      link?.y,
      (link?.x ?? 0) + (link?.width ?? 0),
      (link?.y ?? 0) + (link?.height ?? 0),
    ];
    for (const [i, n] of (found[0]?.rect ?? []).entries())
      expect(n).toBeCloseTo(want[i] as number, 2);
    // No border is drawn around it, and a mail link works too.
    const annots = (await objects(bytes)).filter((o) => o.includes('/Subtype /Link'));
    expect(annots).toHaveLength(1);
    expect(annots[0]).toMatch(/\/Border \[ 0 0 0 \]/);
    expect(annots[0]).toMatch(/\/S \/URI/);
    const mail = await annotations(
      (await render('Write to <mailto:keeper@drafter.dev>.')).bytes,
      0,
    );
    expect(mail.map((a) => a.url)).toEqual(['mailto:keeper@drafter.dev']);
  });

  it('an odd address is annotated as URL.href, whatever its characters', async () => {
    // Unbalanced parentheses and a backslash would end or escape a PDF literal string.
    const odd = [
      'https://drafter.dev/a)b',
      'https://drafter.dev/(c',
      'mailto:keeper\\@drafter.dev',
      'https://drafter.dev/café map',
    ];
    // Built by hand, so the parser's escapes don't touch the addresses.
    const tree: DocNode = {
      type: 'root',
      children: odd.map((url) => ({
        type: 'paragraph',
        children: [{ type: 'link', url, children: [{ type: 'text', value: 'Go' }] }],
      })),
    };
    const { bytes } = await renderDocumentPdf(tree, { fonts: documentFonts, paper: 'letter' });
    const found = await annotations(bytes, 0);
    expect(found.map((a) => a.url)).toEqual(odd.map((url) => new URL(url).href));
  });

  it('a link that wraps puts one annotation on each line it covers', async () => {
    const words =
      'the long list of every buoy, beacon, and light between the harbour mouth and the northern headland, with their colours';
    // Styles inside the link make more than one fragment on a line; still one annotation a line.
    const source = `See [${words}, *flashes*, and **ranges**, as the almanac lists them](https://drafter.dev/lights).`;
    const items = layout(source).pages[0]?.items ?? [];
    const lineTops = new Set(links(items).map((link) => link.y));
    expect(lineTops.size).toBeGreaterThanOrEqual(2);
    const found = await annotations((await render(source)).bytes, 0);
    expect(found).toHaveLength(lineTops.size);
    expect(new Set(found.map((a) => Math.round(a.rect[1] * 100))).size).toBe(lineTops.size);
    for (const a of found) expect(a.url).toBe('https://drafter.dev/lights');
  });

  it('a link split by a page break is annotated on both pages', async () => {
    // A paragraph that is all link, about six lines long, so a page break can fall inside it.
    const tail = `[${'Read the harbour board’s notice about moorings, fees, and the winter berths. '.repeat(7).trim()}](https://drafter.dev/notice)`;
    // Find a length of text before it that puts the page break inside the link.
    let source = '';
    let split = -1;
    for (let n = 1; n < 40 && split < 0; n++) {
      const candidate = `${harbour(n)}\n\n${tail}`;
      const pages = layout(candidate).pages;
      split = pages.findIndex(
        (page, i) => links(page.items).length > 0 && links(pages[i + 1]?.items ?? []).length > 0,
      );
      source = candidate;
    }
    expect(split).toBeGreaterThanOrEqual(0);
    const { bytes } = await render(source);
    for (const page of [split, split + 1]) {
      const found = await annotations(bytes, page);
      expect(found.length).toBeGreaterThanOrEqual(2);
      for (const a of found) expect(a.url).toBe('https://drafter.dev/notice');
    }
  });

  it('an unsafe link has no annotation', async () => {
    const source = [
      '[Run](javascript:alert(1))',
      '[Data](data:text/html,hello)',
      '[File](file:///etc/hosts)',
      '[Up](#the-quay)',
      '[Near](notes/quay.md)',
      '[Phone](tel:+15550100)',
    ].join('\n\n');
    const { bytes } = await render(source);
    expect(await annotations(bytes, 0)).toEqual([]);
    for (const object of await objects(bytes))
      expect(object).not.toMatch(/\/URI|\/Annots \[ [^\]]|\/Link|javascript|data:|file:/);
  });

  it('numbers pages at the foot from 1 when there are two or more', async () => {
    const pdf = await extract((await render(harbour(30))).bytes);
    expect(pdf.length).toBeGreaterThanOrEqual(2);
    pdf.forEach((page, i) => {
      const number = page.items.find((item) => near(item.y, 36));
      expect(number?.str).toBe(String(i + 1));
      expect((number?.x ?? 0) + (number?.width ?? 0) / 2).toBeCloseTo(306, 1);
    });
  });

  it('a one-page document has no number', async () => {
    const [page, more] = await extract((await render(harbour(2))).bytes);
    expect(more).toBeUndefined();
    expect(page?.items.some((item) => item.y < 72)).toBe(false);
  });

  it('sets the title and the language', async () => {
    const { bytes } = await render('The tide is out.', { title: 'Harbour notes', lang: 'en-GB' });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe('Harbour notes');
    expect(doc.catalog.get(PDFName.of('Lang'))).toEqual(PDFString.of('en-GB'));
    const prefs = doc.catalog.getViewerPreferences();
    expect(prefs?.getDisplayDocTitle()).toBe(true);
    expect([doc.getCreator(), doc.getProducer()]).toEqual(['Drafter', 'Drafter, with pdf-lib']);
    // Without them, neither is set.
    const bare = await PDFDocument.load((await render('The tide is out.')).bytes, {
      updateMetadata: false,
    });
    expect(bare.getTitle()).toBeUndefined();
    expect(bare.catalog.get(PDFName.of('Lang'))).toBeUndefined();
  });

  it('the same document gives the same bytes', async () => {
    const source = `# Harbour\n\n${harbour(30)}\n\n[Tides](https://drafter.dev/tides) and \`code\`.`;
    const opts = { title: 'Harbour', lang: 'en-US' };
    const first = await render(source, opts);
    // A different document in between leaves nothing behind.
    await render('Something else entirely, with *italic*.');
    const second = await render(source, opts);
    expect(second.bytes).toEqual(first.bytes);
    const doc = await PDFDocument.load(first.bytes, { updateMetadata: false });
    expect([doc.getCreationDate(), doc.getModificationDate()]).toEqual([undefined, undefined]);
    expect(new TextDecoder('latin1').decode(first.bytes)).not.toMatch(/\/ID\b/);
  });

  it('embeds only the faces used', async () => {
    const names = async (source: string) =>
      (await embeddedFonts((await render(source)).bytes)).map((name) =>
        name.replace(/^\/\w+\+/, '/'),
      );
    expect(await names('Plain words, and *a slanted one*.')).toEqual([
      '/InterTight-Italic',
      '/InterTight-Regular',
    ]);
    expect(await names('# Heading\n\nPlain, *slanted*, ***both***, and `code`.')).toEqual([
      '/CourierPrime-Regular',
      '/InterTight-Italic',
      '/InterTight-Regular',
      '/InterTight-SemiBold',
      '/InterTight-SemiBoldItalic',
    ]);
  });

  it('embeds each face’s glyphs intact', async () => {
    // A short document makes small subsets, the case fontkit's subsetter gets wrong for a font
    // whose glyphs have odd lengths, as Inter Tight's do: every glyph after the first odd one
    // came out unreadable, and a viewer drew blanks.
    const lines = {
      text: 'Harbour notes: the keeper climbs',
      textItalic: 'quietly, at dusk',
      textBold: 'Wind rising',
      textBoldItalic: 'ferry stayed in',
      code: 'log(entry)',
    } as const;
    const source = `${lines.text} *${lines.textItalic}* **${lines.textBold}** ***${lines.textBoldItalic}*** \`${lines.code}\``;
    const programs = await fontPrograms((await render(source)).bytes);
    expect(programs.size).toBe(5);
    for (const [face, line] of Object.entries(lines) as [Face, string][]) {
      const original = fontkit.create(documentFonts[face]);
      const program = programs.get(`/${FONT_NAMES[face]}`);
      expect(program, face).toBeDefined();
      const subset = fontkit.create(program as Uint8Array);
      // A subset numbers glyphs in the order they were first drawn, after .notdef.
      const order = [...new Set(original.layout(line).glyphs.map((g) => g.id))];
      order.forEach((id, i) => {
        const glyph = subset.getGlyph(i + 1);
        expect(glyph.path.toSVG(), `${face} glyph ${i + 1}`).toBe(
          original.getGlyph(id).path.toSVG(),
        );
        expect(glyph.advanceWidth).toBe(original.getGlyph(id).advanceWidth);
      });
    }
  });

  it('falls back to embedding a face whole when it can’t pad the subset', async () => {
    // Simulate a pdf-lib whose subset isn't the shape the padding knows.
    const embed = PDFDocument.prototype.embedFont;
    const spy = vi.spyOn(PDFDocument.prototype, 'embedFont').mockImplementation(async function (
      this: PDFDocument,
      ...args
    ) {
      const font = await embed.apply(this, args);
      const embedder = (font as unknown as { embedder: { subset?: object } }).embedder;
      if (embedder.subset) embedder.subset = {};
      return font;
    });
    try {
      const source = 'Harbour notes: the keeper climbs *quietly*.';
      const { bytes } = await render(source);
      const programs = await fontPrograms(bytes);
      // Whole font files, so every glyph is the font's own.
      expect(programs.get('/InterTight-Regular')).toEqual(documentFonts.text);
      expect(programs.get('/InterTight-Italic')).toEqual(documentFonts.textItalic);
      const [page] = await extract(bytes, { spaces: true });
      expect(page?.items.map((item) => item.str).join('')).toBe(
        'Harbour notes: the keeper climbs quietly.',
      );
    } finally {
      spy.mockRestore();
    }
  });

  /** Renders with every subset embedder passed through `change` first; answers the font programs. */
  const renderWithSubsets = async (change: (subset: object, call: number) => object) => {
    const embed = PDFDocument.prototype.embedFont;
    let calls = 0;
    const spy = vi.spyOn(PDFDocument.prototype, 'embedFont').mockImplementation(async function (
      this: PDFDocument,
      ...args
    ) {
      const font = await embed.apply(this, args);
      const embedder = (font as unknown as { embedder: { subset?: object } }).embedder;
      if (embedder.subset) embedder.subset = change(embedder.subset, calls++);
      return font;
    });
    try {
      const { bytes } = await render('Harbour notes: the keeper climbs.');
      const [page] = await extract(bytes, { spaces: true });
      expect(page?.items.map((item) => item.str).join('')).toBe(
        'Harbour notes: the keeper climbs.',
      );
      return fontPrograms(bytes);
    } finally {
      spy.mockRestore();
    }
  };

  it('embeds a face whole when its glyph data can’t be padded', async () => {
    // A subset of the shape the padding knows, but whose glyph data comes out as plain bytes with
    // no zero-filled `alloc`, so no glyph could be padded.
    const programs = await renderWithSubsets((subset) => {
      const font = (subset as { font: object }).font;
      const plain = Object.create(font, { stream: { value: { buffer: new Uint8Array(4) } } });
      return Object.create(subset, { font: { value: plain, writable: true } });
    });
    expect(programs.get('/InterTight-Regular')).toEqual(documentFonts.text);
  });

  it('embeds a face whole when the document’s own subset can’t be padded', async () => {
    // The scratch check passes, but the subset made in the real document is another shape.
    const programs = await renderWithSubsets((subset, call) => (call === 0 ? subset : {}));
    expect(programs.get('/InterTight-Regular')).toEqual(documentFonts.text);
    expect(programs.size).toBe(1);
  });

  it('embeds every face whole when it couldn’t take back a subset', async () => {
    // A pdf-lib whose private list of fonts to write isn't an array: a subset found unpaddable
    // could not be taken out of it, so no face is subset at all.
    class FontList {
      length = 0;
      [index: number]: unknown;
      push(font: unknown) {
        this[this.length++] = font;
        return this.length;
      }
    }
    const create = PDFDocument.create.bind(PDFDocument);
    const spy = vi.spyOn(PDFDocument, 'create').mockImplementation(async (...args) => {
      const doc = await create(...args);
      (doc as unknown as { fonts: unknown }).fonts = new FontList();
      return doc;
    });
    try {
      const { bytes } = await render('Harbour notes: the keeper climbs *quietly*.');
      const programs = await fontPrograms(bytes);
      expect(programs.get('/InterTight-Regular')).toEqual(documentFonts.text);
      expect(programs.get('/InterTight-Italic')).toEqual(documentFonts.textItalic);
      const [page] = await extract(bytes, { spaces: true });
      expect(page?.items.map((item) => item.str).join('')).toBe(
        'Harbour notes: the keeper climbs quietly.',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('draws what the writer typed: fractions and dates stay as typed, and nothing is kerned', async () => {
    // Three glyphs each for "1/2", five for "10/12", ten for "29/10/2026": no fraction glyphs.
    const { bytes } = await render('1/2\n\n10/12\n\n29/10/2026');
    const shown = [...(await operators(bytes, 0)).matchAll(/<([0-9A-F]*)> Tj/gi)].map(
      (m) => (m[1] as string).length / 4,
    );
    expect(shown).toEqual([3, 5, 10]);
    // No kerning: each glyph advances by its own width, as pdf-lib draws it.
    for (const face of ['text', 'code'] as Face[]) {
      const font = fontkit.create(documentFonts[face]);
      const run = font.layout('AVATAR, To Yo. Wave', layoutFeatures());
      run.glyphs.forEach((glyph, i) => {
        expect(run.positions[i]?.xAdvance).toBe(glyph.advanceWidth);
      });
    }
  });

  it('reports its progress: the blocks laid out, the pages drawn, then the saving', async () => {
    const source = Array.from(
      { length: 120 },
      (_, i) =>
        `## Part ${i}\n\nThe keeper climbs the stair and counts the lamps, one by one, again.`,
    ).join('\n\n');
    const seen: RenderProgress[] = [];
    const { bytes } = await render(source, { onProgress: (p) => seen.push({ ...p }) });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(2);
    // The stages come in order, each counting up from 0 to its total.
    const stages = seen.map((p) => p.stage).filter((s, i, all) => s !== all[i - 1]);
    expect(stages).toEqual(['layout', 'draw', 'save']);
    for (const stage of stages) {
      const of = seen.filter((p) => p.stage === stage);
      expect(of[0]?.done, stage).toBe(0);
      expect(of.at(-1)?.done, stage).toBe(of[0]?.total);
      expect(
        of.every((p, i) => i === 0 || p.done >= (of[i - 1]?.done ?? 0)),
        stage,
      ).toBe(true);
    }
    // Layout by blocks (two a section), drawing by pages.
    expect(seen.find((p) => p.stage === 'layout')?.total).toBe(240);
    expect(seen.find((p) => p.stage === 'draw')?.total).toBe(pages);
    expect(seen.at(-1)).toEqual({ stage: 'save', done: 1, total: 1 });
  });

  it('reports the characters its fonts lack', async () => {
    const { bytes, missing } = await render('The sign reads 漢字, and a gull 🐦 sits on it.');
    expect(missing).toEqual(['漢', '字', '🐦']);
    const [page] = await extract(bytes);
    expect(page?.items.map((item) => item.str).join('')).toContain('reads ??, and a gull ? sits');
  });

  it('an empty tree is one blank page', async () => {
    const { bytes, missing } = await renderDocumentPdf(md(''), {
      fonts: documentFonts,
      paper: 'a4',
    });
    const pdf = await extract(bytes);
    expect(pdf.map((page) => [page.items.length, page.width, page.height])).toEqual([
      [0, 595.28, 841.89],
    ]);
    expect(missing).toEqual([]);
    expect(await embeddedFonts(bytes)).toEqual([]);
  });

  it('asks for all five fonts by name', async () => {
    const partial = { ...documentFonts, textItalic: undefined, code: 'not bytes' };
    const attempt = renderDocumentPdf(md('Words.'), {
      fonts: partial as unknown as DocumentFontSet,
      paper: 'letter',
    });
    await expect(attempt).rejects.toThrow(TypeError);
    await expect(
      renderDocumentPdf(md('Words.'), {
        fonts: partial as unknown as DocumentFontSet,
        paper: 'letter',
      }),
    ).rejects.toThrow(/missing: fonts\.textItalic, fonts\.code$/);
  });

  it('takes the tree’s structural type, not the parser’s', async () => {
    const tree: DocNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Built by hand.' }] }],
    };
    const [page] = await extract(
      (await renderDocumentPdf(tree, { fonts: documentFonts, paper: 'letter' })).bytes,
    );
    expect(page?.items.map((item) => item.str)).toEqual(['Built by hand.']);
  });
});
