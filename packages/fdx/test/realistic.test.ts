import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Block, type Doc, parse, print } from '@drafter/fountain';
import { builtins, resolveRole, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { type FdxImport, fromFdx, IGNORED, readXml, toFdx, type XmlElement } from '../src';
import { makeFeature } from './fixtures/realistic/make-feature';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Synthetic files in the shape of a Final Draft file, written by hand with original text and
// invented values from the element names the technical design documents (none was made in Final
// Draft, or checked against a real file), standing in until real files can be tested.

const path = (name: string) =>
  fileURLToPath(new URL(`./fixtures/realistic/${name}`, import.meta.url));
const read = (name: string) => readFileSync(path(name), 'utf8');

const FILES = [
  'short-film.fdx',
  'edge-cases.fdx',
  'revisions.fdx',
  'stage-play.fdx',
  'fd13-shapes.fdx',
] as const;

const elements = (node: XmlElement) =>
  node.children.filter((c): c is XmlElement => typeof c !== 'string');
// What a setting or an image holds is never the script's text, wherever it sits (as import reads it).
const textOf = (node: XmlElement): string =>
  node.children
    .map((c) =>
      typeof c === 'string' ? c : IGNORED.has(c.name) || c.name === 'Picture' ? '' : textOf(c),
    )
    .join('');

/** The text directly in an element, outside its children. */
const ownText = (node: XmlElement) => node.children.filter((c) => typeof c === 'string').join('');

/** The marker a scene number has to fit to be written as one (as import's rule); else it is a note. */
const sceneNumber = (n: string) =>
  /^[\p{L}\p{N}.-]+$/u.test(n.trim()) ? `#${n.trim()}#` : `Number ${n}`;

/** Each paragraph's text in an element, or the element's whole text when it has none. */
const paragraphTexts = (e: XmlElement) =>
  e.children.map((c) => (typeof c === 'string' ? c : IGNORED.has(c.name) ? '' : textOf(c)));
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Every piece of writing in a file, as import must keep it: each innermost paragraph's runs (and
 * anything nested in them) and its own text, its other child elements, a scene's Title, Summary,
 * and number, what a SceneProperties holds (a styled title that differs from the Title, each arc
 * beat's character and text), a paragraph's alternates that differ from its text, stray text and
 * elements inside a DualDialogue, the title page's paragraphs and its other children, elements in
 * a Content that aren't paragraphs, each beat card's title and text, each script note's writer and
 * text, the alternates no paragraph names, and every other element under the root that isn't one
 * of the settings `IGNORED` names. Elements `IGNORED` names are skipped wherever they are. Blank
 * pieces are left out.
 */
function writing(root: XmlElement): string[] {
  const out: string[] = [];
  const alts = new Map<string, string>();
  const used = new Set<string>();
  for (const top of elements(root))
    if (top.name === 'AltCollection')
      for (const alt of elements(top)) alts.set(alt.attrs.Id ?? '', paragraphTexts(alt).join('\n'));
  const element = (e: XmlElement) => {
    if (!IGNORED.has(e.name)) out.push(textOf(e));
  };
  const paragraph = (p: XmlElement) => {
    const runs = elements(p)
      .filter((c) => c.name === 'Text')
      .map(textOf)
      .join('');
    out.push(runs, ownText(p));
    if (p.attrs.Number) out.push(sceneNumber(p.attrs.Number));
    for (const c of elements(p)) {
      if (c.name === 'Text' || c.name === 'Picture') continue;
      if (c.name === 'DualDialogue') {
        out.push(ownText(c));
        for (const inner of elements(c))
          inner.name === 'Paragraph' ? paragraph(inner) : element(inner);
      } else if (c.name === 'SceneProperties') {
        out.push(c.attrs.Title ?? '', c.attrs.Summary ?? '', ownText(c));
        for (const d of elements(c)) {
          if (d.name === 'AttributedTitle') {
            const text = paragraphTexts(d).join(' ');
            if (oneLine(text) !== oneLine(c.attrs.Title ?? '')) out.push(text);
          } else if (d.name === 'SceneArcBeats') {
            out.push(ownText(d));
            for (const beat of elements(d))
              out.push(beat.attrs.Name ?? '', ...paragraphTexts(beat));
          } else element(d);
        }
      } else if (c.name === 'Alts') {
        out.push(ownText(c));
        for (const a of elements(c)) if (a.name !== 'AltId') element(a);
        for (const id of elements(c).map((a) => textOf(a).trim())) {
          used.add(id);
          const text = alts.get(id) ?? '';
          if (oneLine(text) !== oneLine(runs)) out.push(text);
        }
      } else element(c);
    }
  };
  const content = (c: XmlElement) => {
    out.push(ownText(c));
    for (const p of elements(c)) p.name === 'Paragraph' ? paragraph(p) : element(p);
  };
  out.push(ownText(root));
  for (const top of elements(root)) {
    if (top.name === 'Content') content(top);
    else if (top.name === 'TitlePage') {
      out.push(ownText(top));
      for (const c of elements(top)) c.name === 'Content' ? content(c) : element(c);
    } else if (top.name === 'ListItems') {
      out.push(ownText(top));
      for (const item of elements(top)) {
        const body = elements(item).find((c) => c.name === 'Content');
        out.push(item.attrs.Title ?? '', ...(body ? paragraphTexts(body) : []));
      }
    } else if (top.name === 'ScriptNotes') {
      out.push(ownText(top));
      for (const note of elements(top))
        out.push(note.attrs.WriterName ?? '', ...paragraphTexts(note));
    } else if (top.name === 'AltCollection') {
      out.push(ownText(top));
      for (const alt of elements(top)) if (alt.name !== 'Alt') element(alt);
      for (const alt of elements(top))
        if (!used.has(alt.attrs.Id ?? '')) out.push(...paragraphTexts(alt));
    } else element(top);
  }
  return out.filter((t) => t.trim() !== '');
}

/** How many times `piece` occurs in `text`, without overlaps. */
function occurrences(text: string, piece: string): number {
  let count = 0;
  for (let at = text.indexOf(piece); at !== -1; at = text.indexOf(piece, at + piece.length))
    count++;
  return count;
}

/**
 * Text as it can be found in the Fountain whatever the escaping: no whitespace (line breaks,
 * tabs as spaces, a note's `] ]`), no backslashes (escapes, guards), and no `*` or `_` (emphasis).
 */
const squash = (text: string) => text.replace(/[\s\\*_]/g, '');

function imported(name: string): FdxImport & { doc: Doc; root: XmlElement } {
  const xml = read(name);
  const result = fromFdx(xml);
  return { ...result, doc: parse(result.text), root: readXml(xml) };
}

const blockText = (b: Block) => b.lines.map((l) => l.inline.map((r) => r.text).join('')).join('\n');
const kindOf = (doc: Doc, text: string) => doc.blocks.find((b) => blockText(b) === text)?.kind;

/**
 * Each block's kind and text, with a scene's synopses moved up to right after its heading: export
 * gathers them onto the heading (Plan FD ruling 6), so one written later in the scene comes back
 * there, the one difference the round trip allows.
 */
function sceneOrder(doc: Doc, template: Template): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let scene = -1;
  for (const b of doc.blocks) {
    const item: [string, string] = [b.kind, blockText(b)];
    const heading =
      b.kind === 'scene_heading' ||
      (b.kind === 'section' && resolveRole(template, b, null) === 'scene_heading_play');
    if (heading) {
      scene = out.length;
      out.push(item);
    } else if (b.kind === 'synopsis' && scene >= 0) {
      let at = scene + 1;
      while (out[at]?.[0] === 'synopsis') at++;
      out.splice(at, 0, item);
    } else {
      if (b.kind === 'section') scene = -1;
      out.push(item);
    }
  }
  return out;
}

describe.each(FILES)('%s', (name) => {
  it('imports, and its text prints back exactly', () => {
    const { text, doc } = imported(name);
    expect(text.length).toBeGreaterThan(0);
    expect(print(doc)).toBe(text);
  });

  it('drops nothing silently: every piece of writing is in the script or a note', () => {
    const { text, doc, root } = imported(name);
    // Counted, not just found: a dropped cue or a short scene number whose text also appears
    // elsewhere still shows up as one fewer than the file holds.
    const found = squash(text);
    const needed = new Map<string, number>();
    for (const piece of writing(root))
      needed.set(squash(piece), (needed.get(squash(piece)) ?? 0) + 1);
    const short = [...needed].filter(([piece, n]) => occurrences(found, piece) < n);
    expect(short).toEqual([]);
    // Nothing is hidden in a boneyard, which would keep the text but never print or list it.
    expect(doc.regions.filter((r) => r.kind !== 'note')).toEqual([]);
  });

  it('lists the settings blocks as ignored and never turns them into notes', () => {
    const { text, ignored, root } = imported(name);
    const settings = elements(root)
      .map((e) => e.name)
      .filter((n) => IGNORED.has(n));
    expect(settings.length).toBeGreaterThan(0);
    for (const n of settings) {
      expect(ignored).toContain(n);
      expect(text).not.toContain(`[[fdx: ${n}`);
    }
  });

  it('exports the same file after an import of its own export', () => {
    const template = builtins[name === 'stage-play.fdx' ? 'stage-play-standard' : 'us-screenplay'];
    const { doc } = imported(name);
    const x1 = toFdx(doc, template);
    const again = parse(fromFdx(x1).text);
    const x2 = toFdx(again, template);
    expect(readXml(x2)).toEqual(readXml(x1));
    expect(sceneOrder(again, template)).toEqual(sceneOrder(doc, template));
  });
});

describe('short-film.fdx', () => {
  const film = imported('short-film.fdx');

  it('imports as the expected Fountain text', () => {
    expect(film.text).toBe(read('short-film.fountain'));
  });

  it('brings the kinds through', () => {
    const { doc } = film;
    const headings = doc.blocks.filter((b) => b.kind === 'scene_heading');
    expect(headings.map((b) => (b.kind === 'scene_heading' ? b.sem.number : null))).toEqual([
      '1',
      null,
      '2',
      '3',
      null,
      '4',
    ]);
    expect(kindOf(doc, 'EXT. KWIK KEYS KIOSK - SHOPPING ARCADE - DAY')).toBe('scene_heading');
    expect(kindOf(doc, 'CLOSE ON THE KEY')).toBe('scene_heading');
    expect(kindOf(doc, "RAINCOAT (CONT'D)")).toBe('character');
    expect(kindOf(doc, '(not looking at her)')).toBe('parenthetical');
    expect(kindOf(doc, 'Teach me the rest.')).toBe('dialogue');
    expect(kindOf(doc, 'CUT TO:')).toBe('transition');
    expect(kindOf(doc, 'FADE OUT.')).toBe('transition');
    expect(kindOf(doc, 'The boathouse')).toBe('synopsis');
    expect(kindOf(doc, 'The key fits. Someone has been living inside.')).toBe('synopsis');
    expect(doc.blocks.filter((b) => b.kind === 'synopsis')).toHaveLength(4);
    expect(doc.blocks.filter((b) => b.kind === 'page_break')).toHaveLength(1);
    const dual = doc.blocks.filter((b) => b.kind === 'character' && b.sem.dual);
    expect(dual.map(blockText)).toEqual(['WREN']);
  });

  it('reads the title page by order', () => {
    expect(film.title).toBe('THE SPARE KEY');
    const fields = film.doc.titlePage?.fields ?? [];
    expect(fields.map((f) => f.key)).toEqual(['Title', 'Credit', 'Author', 'Notes']);
    const author = fields.find((f) => f.key === 'Author');
    expect(author?.runs.map((r) => r.map((x) => x.text).join(''))).toEqual([
      'Marguerite Osei-Lund',
    ]);
  });

  it('notes the General paragraph and the script notes, and ignores breakdown tags', () => {
    expect(film.mapped).toEqual([
      { type: 'General', count: 1 },
      { type: 'Script note', count: 2 },
    ]);
    expect(film.ignored).toContain('TagData');
    expect(film.text).not.toContain('tag-ref-0001');
  });
});

describe('edge-cases.fdx', () => {
  const edge = imported('edge-cases.fdx');
  const { doc } = edge;

  it('is the file it says it is: a BOM and CRLF line endings', () => {
    const raw = read('edge-cases.fdx');
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    expect(raw).toContain('\r\n');
    expect(edge.text).not.toContain('\r');
  });

  it('keeps accented and astral characters, entities, and references', () => {
    expect(edge.text).toContain('INT. CAFÉ NIÑO — DÍA #1#');
    expect(edge.text).toContain('🎉 OPEN 🎉');
    expect(edge.text).toContain('a G clef 𝄞 is chalked');
    expect(edge.text).toContain('“Fish & chips < £5 > nothing”');
    expect(edge.text).toContain('été — café © 2026');
    expect(edge.text).toContain('= Accents & astral characters: café, niño, “quotes”, 🔑.');
  });

  it('forces what would read as another kind', () => {
    expect(kindOf(doc, 'THE LIGHTS GO OUT ALL AT ONCE.')).toBe('action');
    expect(kindOf(doc, 'mrs. okafor')).toBe('character');
    expect(kindOf(doc, 'WIPE LEFT.')).toBe('transition');
    expect(kindOf(doc, 'Dissolve to:')).toBe('transition');
    for (const line of [
      '!Bang goes the back door.',
      '@home is scrawled on the wall in marker.',
      '#4 is the only bus that stops here.',
      '= signs, painted in a row, go down the brickwork.',
      '~ a tilde of smoke curls from the vent.',
      '> An arrow points to the bins.',
      '.45 seconds later, the alarm stops.',
      'INT. is painted backwards on the van',
    ]) {
      expect(kindOf(doc, line), line).toBe('action');
    }
    // A dialogue line that would start a parenthetical or a lyric keeps its guard, which prints
    // (DEFERRED, Plan FD: a visible backslash on some imported lines); so does a broken `[[`.
    expect(
      kindOf(
        doc,
        "\\(Laughs) No, I mean it.\n\\~ that's not a lyric.\n\nIt's 3 * 4 = 12, and [\\[ isn't a note.",
      ),
    ).toBe('dialogue');
    const dual = doc.blocks.filter((b) => b.kind === 'character' && b.sem.dual);
    expect(dual.map(blockText)).toEqual(['mrs. okafor']);
  });

  it('keeps markup characters as text', () => {
    const line = doc.blocks.find((b) => blockText(b).startsWith('Rate it'));
    expect(line?.kind).toBe('action');
    expect(blockText(line as Block)).toContain(
      'Rate it 5*, she says. The file is called old_menu_final_v2.',
    );
    expect(blockText(line as Block)).toContain('/* not a comment */');
    expect(
      kindOf(
        doc,
        'A *starred* word and an _underscored_ word, typed as they are, and a back\\slash.',
      ),
    ).toBe('action');
  });

  it('notes the paragraph types and elements Drafter has no element for', () => {
    expect(edge.mapped).toEqual([
      { type: 'Mood', count: 1 },
      { type: 'Dialogue', count: 1 },
      { type: 'New Act', count: 1 },
      { type: 'Cast List', count: 1 },
      { type: 'Lyrics', count: 1 },
      { type: 'Chorus Line', count: 1 },
      { type: 'Memo', count: 1 },
      { type: 'End of Act', count: 1 },
      { type: 'Divider', count: 1 },
      { type: 'Number', count: 1 },
      { type: 'Aside', count: 1 },
      { type: 'DualDialogue text', count: 1 },
      { type: 'Scene Heading', count: 1 },
      { type: 'Stamp', count: 1 },
    ]);
    expect(edge.text).toContain('Both at once, over each other. [[fdx: DualDialogue text]]');
    expect(edge.text).toContain('INT. STOREROOM - CONTINUOUS [[fdx: Number 12 A]]');
  });

  it('keeps a very long paragraph whole', () => {
    const long = doc.blocks.find((b) => blockText(b).startsWith('Minute 1:'));
    expect(long?.kind).toBe('action');
    expect(blockText(long as Block).length).toBeGreaterThan(5000);
  });
});

describe('revisions.fdx', () => {
  const rev = imported('revisions.fdx');

  it('keeps locked scene numbers and omitted scenes', () => {
    const numbers = rev.doc.blocks.flatMap((b) =>
      b.kind === 'scene_heading' ? [[blockText(b), b.sem.number]] : [],
    );
    expect(numbers).toEqual([
      ['INT. SALT WORKS - COUNTING HOUSE - DAY', '12'],
      ['EXT. SALT WORKS - YARD - CONTINUOUS', '12A'],
      ['OMITTED', '13'],
      ['OMITTED', '14'],
      ['INT. COUNTING HOUSE - LATER', '15'],
      ['EXT. PELL STREET - DUSK', 'A16'],
      ["INT. TAMSIN'S ROOM - NIGHT", '16'],
    ]);
  });

  it('reads revised text as text, and the revision sets as settings', () => {
    expect(rev.text).toContain('Forty sacks out. *Thirty-one* paid for.');
    expect(rev.ignored).toEqual(expect.arrayContaining(['Revisions', 'HeaderAndFooter']));
    expect(rev.mapped).toEqual([{ type: 'Script note', count: 1 }]);
  });
});

describe('stage-play.fdx', () => {
  const play = imported('stage-play.fdx');

  it('comes in as a screenplay: acts as notes, scenes as headings, directions as action', () => {
    const { doc } = play;
    expect(kindOf(doc, 'SCENE 1')).toBe('scene_heading');
    expect(kindOf(doc, 'SCENE 2')).toBe('scene_heading');
    expect(play.text).toContain('_ACT ONE_ [[fdx: New Act]]');
    expect(play.text).toContain('END OF ACT ONE [[fdx: End of Act]]');
    expect(play.text).toContain('===\n\n_ACT TWO_ [[fdx: New Act]]');
    expect(kindOf(doc, '(She shakes the drawer once. The sound fills the room. Blackout.)')).toBe(
      'action',
    );
    expect(kindOf(doc, 'ROSALIND')).toBe('character');
    expect(kindOf(doc, '(gently)')).toBe('parenthetical');
    expect(kindOf(doc, 'THE END')).toBe('centered');
    expect(play.title).toBe('HABERDASHERY A Play in Two Acts');
  });
});

describe('fd13-shapes.fdx', () => {
  const fd = imported('fd13-shapes.fdx');
  const { doc } = fd;

  it('reads outline paragraphs as sections, summaries as synopses, and notes as notes', () => {
    const sections = doc.blocks.flatMap((b) =>
      b.kind === 'section' ? [[b.sem.depth, blockText(b)]] : [],
    );
    expect(sections).toEqual([
      [1, 'Act One: The Lock'],
      [2, 'The night boat'],
      [3, 'Oda hears an engine'],
    ]);
    expect(kindOf(doc, 'Oda keeps the canal lock; a boat arrives that should not exist.')).toBe(
      'synopsis',
    );
    expect(kindOf(doc, 'Fenn is not who he says.')).toBe('synopsis');
    expect(fd.text).toContain('\n\n[[Lock diagram goes here; ask the art department.]]\n\n');
  });

  it('keeps arc beats, alternates, beats, and script notes, and never the image', () => {
    expect(fd.mapped).toEqual([
      { type: 'Arc beat', count: 1 },
      { type: 'Alternate', count: 3 },
      { type: 'Picture', count: 1 },
      { type: 'AttributedTitle', count: 1 },
      { type: 'End of Act', count: 1 },
      { type: 'Beat', count: 2 },
      { type: 'Script note', count: 2 },
      { type: 'ScriptNotes text', count: 1 },
    ]);
    expect(fd.text).toContain('Written loose, between two notes. [[fdx: ScriptNotes text]]');
    expect(fd.text).toContain(
      '[[fdx: Arc beat, ODA: Decides to open the gates against the rules.]]',
    );
    expect(fd.text).toContain(
      "[[fdx: Beat, The boat that shouldn't exist: Registered to a yard that closed in the sixties. Its paint is still wet.]]",
    );
    expect(fd.text).toContain('[[S. Lindqvist: Is the fog doing too much work here?]]');
    expect(fd.text).not.toContain('aW52');
    expect(fd.ignored).toEqual(
      expect.arrayContaining(['Images', 'AttributedTitle', 'TableColumnSettings']),
    );
    // The current text of each paragraph with alternates is the script's text; the alternate that
    // repeats it is not noted again.
    expect(kindOf(doc, 'Fog on the water. A diesel engine coughs somewhere upstream.')).toBe(
      'action',
    );
    expect(fd.text.match(/Fog on the water/g)).toHaveLength(1);
    expect(fd.text.match(/cargo that won't keep/g)).toHaveLength(1);
  });
});

describe('a feature-length file', () => {
  it(
    'imports in linear time',
    () => {
      // Linear, not a wall-clock budget (scaling.ts): 35 scenes, then 140 (about 120 pages).
      const { growth, large } = scaling(makeFeature, fromFdx, 35);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
      const xml = makeFeature();
      const start = performance.now();
      const result = fromFdx(xml);
      const ms = performance.now() - start;
      console.info(
        `feature-length .fdx (${(xml.length / 1024).toFixed(0)} KB) imported in ${ms.toFixed(0)} ms`,
      );
      const doc = parse(result.text);
      expect(doc.blocks.filter((b) => b.kind === 'scene_heading')).toHaveLength(140);
      expect(result.mapped).toEqual([]);
    },
    SCALING_TIMEOUT,
  );
});

describe('the samples', () => {
  it.each(['short-film.fdx', 'stage-play.fdx'])(
    'samples/fdx/%s is the fixture, byte for byte',
    (name) => {
      const sample = readFileSync(
        fileURLToPath(new URL(`../../../samples/fdx/${name}`, import.meta.url)),
      );
      expect(sample.equals(readFileSync(path(name)))).toBe(true);
    },
  );
});
