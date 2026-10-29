import type { Block, Doc, InlineRun, Line, Region } from '@drafter/fountain';
import { resolveRole, type Template } from '@drafter/templates';
import { writeXml, type XmlElement, type XmlNode } from './xml';

// Final Draft export (technical design §6.3): a pure function of the parse and the template.
// The text of every paragraph comes from the lines' styled runs, never from the source, so
// emphasis markers, boneyard, and escapes are the parser's business alone; only notes are put
// back, as `[[…]]`, because Final Draft's own notes anchor to text ranges Drafter can't map yet.

/** A styled stretch of a paragraph's text. */
interface Piece {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const plain = (text: string): Piece => ({ text, bold: false, italic: false, underline: false });

/** `Bold`, `Italic`, `Underline` joined with `+`, in that order; null for plain text. */
function styleOf(piece: Piece): string | null {
  const styles = [piece.bold && 'Bold', piece.italic && 'Italic', piece.underline && 'Underline'];
  return styles.filter(Boolean).join('+') || null;
}

const el = (name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []) => ({
  name,
  attrs,
  children,
});

/**
 * Text XML can't hold: control characters other than tab and line feed, U+FFFE and U+FFFF, and
 * lone surrogates. The writer refuses them, and a script (untrusted pasted text, say) can hold
 * them, so an export drops them rather than fail.
 */
function clean(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (
      (c < 0x20 && c !== 0x9 && c !== 0xa) ||
      c === 0xfffe ||
      c === 0xffff ||
      (c >= 0xd800 && c <= 0xdfff)
    )
      continue;
    out += ch;
  }
  return out;
}

/** One `<Text>` per style change; neighbouring pieces in the same style are one run. */
function textRuns(pieces: readonly Piece[]): XmlElement[] {
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && styleOf(last) === styleOf(piece)) last.text += piece.text;
    else merged.push({ ...piece });
  }
  return merged
    .filter((piece) => piece.text !== '')
    .map((piece) => {
      const style = styleOf(piece);
      return el('Text', style ? { Style: style } : {}, [clean(piece.text)]);
    });
}

/** The notes that count: closed ones outside any other region (a note inside a boneyard is gone). */
function outerRegions(doc: Doc): Region[] {
  const outer: Region[] = [];
  let end = -1;
  for (const region of doc.regions) {
    if (!region.closed || region.span.from < end) continue;
    outer.push(region);
    end = region.span.to;
  }
  return outer;
}

/** Source text with its emphasis escapes read: a backslash before `*`, `_`, or `\\` goes. */
const unescaped = (text: string) => text.replace(/\\([*_\\])/g, '$1');

/** Index of the first region that starts at or after `offset` (regions are in source order). */
function firstFrom(regions: readonly Region[], offset: number): number {
  let lo = 0;
  let hi = regions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((regions[mid] as Region).span.from < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

class Exporter {
  private readonly regions: Region[];
  /** The paragraphs of each speech, then of a dual pair, wait here until the content is built. */
  private readonly items: Array<{ paragraphs: XmlElement[]; speech: boolean; dual: boolean }> = [];
  /** The speech still taking parentheticals and dialogue, or null once anything else is written. */
  private open: { paragraphs: XmlElement[]; speech: boolean; dual: boolean } | null = null;
  private pageBreak = false;
  /** The synopses a scene heading has taken into its properties (a heading comes before them). */
  private readonly collected = new Set<number>();

  constructor(
    private readonly doc: Doc,
    private readonly template: Template,
  ) {
    this.regions = outerRegions(doc);
  }

  /**
   * The pieces of one line: its runs, with each note on it put back as `[[…]]` at the place it
   * had. A run can straddle a note (the parser joins the text on either side of it), so the run's
   * source is cut around the regions inside it and checked against the run's text; when an escape
   * or something else makes them differ, the run stays whole and its notes follow it.
   */
  private linePieces(line: Line): Piece[] {
    const { source } = this.doc;
    const inLine = (from: number) => from >= line.span.from && from < line.span.to;
    const at: Array<{ from: number; pieces: Piece[] }> = [];
    const claimed = new Set<Region>();

    for (const run of line.inline) {
      const inside: Region[] = [];
      for (let r = firstFrom(this.regions, run.span.from); r < this.regions.length; r++) {
        const region = this.regions[r] as Region;
        if (region.span.from >= run.span.to) break;
        inside.push(region);
        claimed.add(region);
      }
      at.push({ from: run.span.from, pieces: this.splitRun(run, inside, source) });
    }
    for (let r = firstFrom(this.regions, line.span.from); r < this.regions.length; r++) {
      const region = this.regions[r] as Region;
      if (!inLine(region.span.from)) break;
      if (claimed.has(region) || region.kind !== 'note') continue;
      at.push({ from: region.span.from, pieces: [plain(this.noteText(region))] });
    }
    at.sort((a, b) => a.from - b.from);
    return at.flatMap((entry) => entry.pieces);
  }

  private noteText(region: Region): string {
    return this.doc.source.slice(region.span.from, region.span.to);
  }

  private splitRun(run: InlineRun, inside: Region[], source: string): Piece[] {
    const style = { bold: run.bold, italic: run.italic, underline: run.underline };
    const notes = inside.filter((region) => region.kind === 'note');
    if (inside.length === 0) return [{ ...style, text: run.text }];

    let cuts: string[] = [];
    let cursor = run.span.from;
    for (const region of inside) {
      cuts.push(source.slice(cursor, region.span.from));
      cursor = region.span.to;
    }
    cuts.push(source.slice(cursor, run.span.to));
    // When the cuts differ from the run's text, it may be that the parser read escapes in them
    // (`\*` is `*`, in kinds with emphasis), so they are compared again with escapes taken out. In
    // other kinds the first comparison already matches; an escape a note splits stays unequal,
    // and the run stays whole.
    if (cuts.join('') !== run.text) cuts = cuts.map(unescaped);
    if (cuts.join('') !== run.text) {
      return [{ ...style, text: run.text }, ...notes.map((n) => plain(this.noteText(n)))];
    }
    const pieces: Piece[] = [];
    cuts.forEach((cut, k) => {
      pieces.push({ ...style, text: cut });
      const region = inside[k];
      if (region?.kind === 'note') pieces.push(plain(this.noteText(region)));
    });
    return pieces;
  }

  /**
   * The pieces of a whole block, its lines joined by line feeds. A line that prints nothing and
   * holds no note (boneyard only) leaves no line break behind; a blank line that does print stays.
   */
  private blockPieces(block: Block): Piece[] {
    const out: Piece[] = [];
    let first = true;
    let noteEnd = -1;
    for (const line of block.lines) {
      const pieces = this.linePieces(line);
      if (pieces.length === 0 && line.transparent) continue;
      // A note that began on an earlier line and ends on this one is the same stretch of text.
      if (!first && line.span.from >= noteEnd) {
        const last = out[out.length - 1];
        out.push({ ...(last ?? plain('')), text: '\n' });
      }
      first = false;
      out.push(...pieces);
      for (let r = firstFrom(this.regions, line.span.from); r < this.regions.length; r++) {
        const region = this.regions[r] as Region;
        if (region.span.from >= line.span.to) break;
        if (region.span.to > line.span.to) noteEnd = region.span.to;
      }
    }
    return out;
  }

  private paragraph(
    type: string,
    attrs: Record<string, string>,
    pieces: readonly Piece[],
    extra: XmlElement[] = [],
  ): XmlElement {
    return el('Paragraph', { Type: type, ...attrs }, [...extra, ...textRuns(pieces)]);
  }

  /** Adds paragraphs as their own item, carrying a pending page break onto the first. */
  private push(paragraphs: XmlElement[], speech = false, dual = false) {
    const first = paragraphs[0];
    if (!first) return null;
    if (this.pageBreak) {
      first.attrs.StartsNewPage = 'Yes';
      this.pageBreak = false;
    }
    const item = { paragraphs, speech, dual };
    this.items.push(item);
    this.open = null;
    return item;
  }

  private synopsisOf(index: number): string {
    const parts: string[] = [];
    for (let i = index + 1; i < this.doc.blocks.length; i++) {
      const block = this.doc.blocks[i] as Block;
      if (block.kind === 'section' || block.kind === 'scene_heading') break;
      if (block.kind === 'synopsis') {
        this.collected.add(i);
        parts.push(
          this.blockPieces(block)
            .map((p) => p.text)
            .join(''),
        );
      }
    }
    return parts.join('\n');
  }

  private scene(block: Block, index: number, attrs: Record<string, string>) {
    const summary = this.synopsisOf(index);
    const properties =
      summary === '' ? [] : [el('SceneProperties', { Title: '', Summary: clean(summary) })];
    this.push([this.paragraph('Scene Heading', attrs, this.blockPieces(block), properties)]);
  }

  private character(block: Block) {
    const paragraph = this.paragraph('Character', {}, this.blockPieces(block));
    const previous = this.items[this.items.length - 1];
    if (block.kind === 'character' && block.sem.dual && previous?.speech && !previous.dual) {
      // The second speaker of a dual pair joins the speech just before it.
      if (this.pageBreak) {
        paragraph.attrs.StartsNewPage = 'Yes';
        this.pageBreak = false;
      }
      previous.paragraphs.push(paragraph);
      previous.dual = true;
      this.open = previous;
      return;
    }
    this.open = this.push([paragraph], true);
  }

  run(): XmlElement {
    const { blocks } = this.doc;
    blocks.forEach((block, index) => {
      switch (block.kind) {
        case 'page_break':
          this.pageBreak = true;
          return;
        case 'synopsis':
          // One a scene took is already in its properties; any other has no scene to ride on, so
          // it is a General paragraph in its place, marked so import can write it back as `=`.
          if (!this.collected.has(index)) {
            this.push([
              this.paragraph('General', { DrafterSynopsis: 'Yes' }, this.blockPieces(block)),
            ]);
          }
          return;
        case 'boneyard':
          return;
        case 'scene_heading':
          this.scene(block, index, block.sem.number ? { Number: block.sem.number } : {});
          return;
        case 'section': {
          const depth = String(block.sem.depth);
          if (resolveRole(this.template, block, null) === 'scene_heading_play') {
            this.scene(block, index, { DrafterSection: depth });
          } else {
            this.push([
              this.paragraph('General', { DrafterSection: depth }, this.blockPieces(block)),
            ]);
          }
          return;
        }
        case 'note': {
          const notes = this.regions.filter(
            (r) =>
              r.kind === 'note' && r.span.from >= block.span.from && r.span.to <= block.span.to,
          );
          this.push(
            notes.map((r) =>
              this.paragraph('General', { DrafterNote: 'Yes' }, [
                plain(this.doc.source.slice(r.span.from + 2, r.span.to - 2)),
              ]),
            ),
          );
          return;
        }
        case 'character':
          this.character(block);
          return;
        case 'parenthetical':
        case 'dialogue':
        case 'lyric': {
          const lyric = block.kind === 'lyric';
          const pieces = this.blockPieces(block).map((p) => (lyric ? { ...p, italic: true } : p));
          const paragraph = this.paragraph(
            block.kind === 'parenthetical' ? 'Parenthetical' : 'Dialogue',
            lyric ? { DrafterLyric: 'Yes' } : {},
            pieces,
          );
          if (this.open) this.open.paragraphs.push(paragraph);
          else this.push([paragraph]);
          return;
        }
        case 'transition':
          this.push([this.paragraph('Transition', {}, this.blockPieces(block))]);
          return;
        case 'centered':
          this.push([this.paragraph('Action', { Alignment: 'Center' }, this.blockPieces(block))]);
          return;
        case 'action':
          this.push([this.paragraph('Action', {}, this.blockPieces(block))]);
          return;
      }
    });

    const content = el(
      'Content',
      {},
      this.items.flatMap((item) =>
        item.dual
          ? [el('Paragraph', {}, [el('DualDialogue', {}, item.paragraphs)])]
          : item.paragraphs,
      ),
    );
    const root = el('FinalDraft', { DocumentType: 'Script', Template: 'No', Version: '5' }, [
      content,
    ]);
    const titlePage = this.titlePage();
    if (titlePage) root.children.push(titlePage);
    return root;
  }

  /** The title page's fields, one `Action` paragraph per value line, the key on the first. */
  private titlePage(): XmlElement | null {
    const fields = this.doc.titlePage?.fields ?? [];
    if (fields.length === 0) return null;
    const paragraphs: XmlElement[] = [];
    for (const field of fields) {
      const alignment = CENTERED.has(field.key.toLowerCase()) ? 'Center' : 'Left';
      const lines = field.runs.length > 0 ? field.runs : [[]];
      lines.forEach((runs, k) => {
        const attrs: Record<string, string> = { Alignment: alignment };
        if (k === 0) attrs.DrafterKey = field.key;
        paragraphs.push(this.paragraph('Action', attrs, runs));
      });
    }
    return el('TitlePage', {}, [el('Content', {}, paragraphs)]);
  }
}

/** The title page keys Final Draft centers; every other key is flush left. */
const CENTERED = new Set(['title', 'credit', 'author', 'authors', 'source']);

/**
 * The script as Final Draft XML. Nothing the script holds can make this throw: text XML forbids
 * is dropped, and a stray or unclosed boneyard simply hides what it covers, as it does in print.
 */
export function toFdx(doc: Doc, template: Template): string {
  return writeXml(new Exporter(doc, template).run());
}
