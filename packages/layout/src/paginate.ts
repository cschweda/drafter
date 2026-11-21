import type { Block, Doc } from '@drafter/fountain';
import { type Role, type RoleStyle, resolveRole, type Template } from '@drafter/templates';
import {
  blankLine,
  blockLines,
  cellAt,
  columns,
  type Frame,
  frameOf,
  isBlank,
  joined,
  type Origin,
  offsetOf,
  type Para,
  paraLine,
  paraWrap,
  pastSpaces,
  textOf,
} from './lines';
import { printedLabels, suffix } from './locked';
import { numbersOf, rolesOf } from './numbers';
import { sentenceEnds } from './sentences';
import { titlePage } from './title';
import {
  type Layout,
  type LayoutDiagnostic,
  type LayoutLine,
  type LockedPages,
  type Page,
  type PaginateOptions,
  type SceneNumbering,
  UnsupportedTemplateError,
} from './types';

/** What a line of a speech is, for splitting: dialogue and lyrics are `text`; blank lines are `gap`. */
type Tag = 'paren' | 'text' | 'gap';

interface Spacing {
  spaceBefore: number;
  spaceAfter: number;
  keepWithNext: boolean;
}

interface BlockItem extends Spacing {
  type: 'block';
  lines: LayoutLine[];
  /**
   * Where each line came from, when `cuts`; null for a blank line, and for a line that mustn't be
   * cut inside.
   */
  origins: Array<Origin | null>;
  /** Where `lines[0]` stands in the lines the block was first wrapped into: 0 but for a piece of one. */
  base: number;
  /** A page may end inside one of its printed lines, where a sentence ends: action only. */
  cuts: boolean;
  keepTogether: boolean;
}

/**
 * Where the rest of a block starts: at line `i` of its lines, after the rest of `para` from `cell`
 * when a page ended inside that paragraph.
 */
interface Pos {
  i: number;
  para?: Para;
  cell?: number;
}

/** A line still to place, where it came from, and where the block goes on after it. */
interface Row {
  line: LayoutLine;
  origin: Origin | null;
  /** Its index in the lines as first wrapped, or -1 for a line wrapped afresh after a cut. */
  at: number;
  next: Pos;
}

/**
 * A break in a block or a speech: the rows that stay, then a line cut short at a sentence's end,
 * if any.
 */
interface BlockBreak {
  rows: Row[];
  short?: LayoutLine;
  next: Pos;
}

/** A dialogue group: a cue, then its parentheticals, dialogue, and lyrics. */
interface SpeechItem extends Spacing {
  type: 'speech';
  cue: LayoutLine[];
  /** The cue as it prints at the top of the next page when the speech splits. */
  contd: LayoutLine[];
  body: LayoutLine[];
  /** Where each body line came from, for dialogue; null for every other line (see `BlockItem`). */
  origins: Array<Origin | null>;
  /** Where `body[0]` stands in the lines the speech was first wrapped into. */
  base: number;
  tags: Tag[];
  /** `spoken[k]`: how many of the first k body lines are dialogue. */
  spoken: number[];
  /** Ends in `(MORE)`: the part of a speech before a locked page's start. */
  more?: true;
}

interface DualItem extends Spacing {
  type: 'dual';
  rows: LayoutLine[];
}

type Printed = BlockItem | SpeechItem | DualItem;
/** What a locked page's start sets: the label A-pages count from, and the label it prints. */
interface PageStart {
  label: string;
  printed: string;
}

/** A page break; one that starts a locked page carries its label. */
type Item = Printed | { type: 'break'; start?: PageStart };

interface Printing {
  role: Role;
  style: RoleStyle;
}

interface Speech {
  cue: number;
  members: number[];
  /** Gets a continued-speech `(CONT'D)`. */
  contd: boolean;
  dual: 'left' | 'right' | null;
}

type Entry =
  | { type: 'block'; index: number }
  | { type: 'speech'; speech: Speech }
  | { type: 'break' };

const SPEECH_PARTS = new Set(['parenthetical', 'dialogue', 'lyric']);

/** No blank line between this block and the one before it. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

const heightOf = (item: Printed) =>
  item.type === 'block'
    ? item.lines.length
    : item.type === 'dual'
      ? item.rows.length
      : item.cue.length + item.body.length + (item.more ? 1 : 0);

/**
 * Lays a parsed script out on pages (technical design §5): the title page,
 * then the body, filled first-fit with keep-with-next look-ahead, speeches
 * split with `(MORE)` and `(CONT'D)`, and dual dialogue side by side. Pure and
 * deterministic.
 */
export function paginate(doc: Doc, template: Template, opts: PaginateOptions = {}): Layout {
  const { page } = template;
  if (!page.font.monospace) {
    throw new UnsupportedTemplateError(
      `Template "${template.id}" uses a proportional font (${page.font.family}); this version lays out monospace fonts only.`,
    );
  }
  if (page.font.pt !== 12) {
    throw new UnsupportedTemplateError(
      `Template "${template.id}" sets ${page.font.pt} pt type; this version lays out 12 pt only, where 10 characters and 6 lines make an inch.`,
    );
  }
  const height = page.height - page.margin.top - page.margin.bottom;
  const diagnostics: LayoutDiagnostic[] = [];
  const pages: Page[] = [];
  let titleLast: { page: number; line: number } | null = null;
  const title = doc.titlePage && titlePage(doc.titlePage, template, height, diagnostics);
  if (title) {
    pages.push(title.page);
    if (title.last !== null) titleLast = { page: 0, line: title.last };
  }

  const option = opts.sceneNumbers ?? template.sceneNumbers.enabled;
  const numbering: SceneNumbering = option === true ? 'all' : option === false ? 'none' : option;
  const built = new Items(doc, template, height, diagnostics).build(numbering, opts.numbers);
  const { scenes } = built;
  const items = opts.locked ? lockedItems(built.items, doc.blocks, opts.locked) : built.items;
  const pager = new Pager(template, height, scenes, doc.blocks.length);
  new Filler(template, height, pager).fill(items);
  for (const body of pager.pages) pages.push(body);

  // A block that prints nothing maps to the next printed line, or to the last.
  const index: Layout['index'] = new Array(doc.blocks.length);
  let next = pager.last ?? titleLast ?? { page: 1, line: 0 };
  for (let b = doc.blocks.length - 1; b >= 0; b--) {
    next = pager.index[b] ?? next;
    index[b] = { ...next };
  }
  diagnostics.sort((a, b) => a.span.from - b.span.from);
  return { pages, index, diagnostics };
}

/** Turns blocks into the items that fill pages: blocks, speeches, dual pairs, and page breaks. */
class Items {
  readonly #blocks: readonly Block[];
  readonly #roles: Role[];
  readonly #printings: Array<Printing | null>;

  constructor(
    doc: Doc,
    private readonly template: Template,
    private readonly height: number,
    private readonly diagnostics: LayoutDiagnostic[],
  ) {
    this.#blocks = doc.blocks;
    this.#roles = rolesOf(doc.blocks, template);
    this.#printings = doc.blocks.map((block, i) => this.#printing(block, i));
  }

  /** A block's role and style; null when it doesn't print. */
  #printing(block: Block, i: number): Printing | null {
    const role = this.#roles[i] as Role;
    if (role === 'omit' || role === 'page_break') return null;
    if (role !== 'disabled') return { role, style: this.template.roles[role] as RoleStyle };
    this.diagnostics.push({
      code: 'disabled-element',
      severity: 'warning',
      span: { ...block.span },
      message: `${this.template.name} has no ${block.kind.replaceAll('_', ' ')} element, so this prints the way action does.`,
    });
    // Rendered the way action renders: a template that omits action omits this too.
    const action = resolveRole(
      this.template,
      { kind: 'action' } as Block,
      this.#roles[i - 1] ?? null,
    );
    const style = this.template.roles[action];
    return style ? { role: action, style } : null;
  }

  build(
    numbering: SceneNumbering,
    given?: ReadonlyMap<number, string>,
  ): { items: Item[]; scenes: Map<number, string> } {
    const entries = this.#entries();
    const items: Item[] = [];
    const scenes = numbersOf(this.#blocks, this.#roles, numbering, given);
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e] as Entry;
      if (entry.type === 'break') {
        items.push(entry);
      } else if (entry.type === 'block') {
        items.push(this.#block(entry.index, this.#printings[entry.index] as Printing));
      } else {
        const { speech } = entry;
        const partner = (entries[e + 1] as { speech: Speech } | undefined)?.speech;
        if (speech.dual === 'left' && partner) {
          const dual = this.#dual(speech, partner);
          if (dual.rows.length <= this.height) {
            items.push(dual);
            e++;
            continue;
          }
          this.diagnostics.push({
            code: 'dual-overflow',
            severity: 'warning',
            span: { ...(this.#blocks[partner.cue] as Block).span },
            message:
              'These two speeches are too long to print side by side on one page, so they print one after the other.',
          });
        }
        const item = this.#speech(speech);
        if (item) items.push(item);
      }
    }
    return { items, scenes };
  }

  /** Groups speeches, pairs dual dialogue, and marks continued speeches (§5.4, §5.5). */
  #entries(): Entry[] {
    const blocks = this.#blocks;
    const entries: Entry[] = [];
    let speaker: string | null = null; // who spoke the last dialogue group in this scene
    for (let i = 0; i < blocks.length; ) {
      const block = blocks[i] as Block;
      if (block.kind === 'scene_heading') speaker = null;
      if (block.kind === 'page_break') {
        entries.push({ type: 'break' });
        i++;
        continue;
      }
      if (block.kind !== 'character') {
        if (this.#printings[i]) entries.push({ type: 'block', index: i });
        i++;
        continue;
      }
      let j = i + 1;
      while (
        j < blocks.length &&
        SPEECH_PARTS.has((blocks[j] as Block).kind) &&
        adjacent(blocks[j] as Block)
      )
        j++;
      const members = Array.from({ length: j - i - 1 }, (_, k) => i + 1 + k);
      const speech: Speech = { cue: i, members, contd: false, dual: null };
      const name = block.sem.name.trim().toUpperCase();
      const prev = entries.at(-1);
      i = j;
      if (block.sem.dual) {
        if (prev?.type === 'speech' && prev.speech.dual === null) {
          // Dual dialogue neither gets nor triggers a continued-speech (CONT'D).
          prev.speech.dual = 'left';
          prev.speech.contd = false;
          speech.dual = 'right';
          speaker = null;
          entries.push({ type: 'speech', speech });
          continue;
        }
        this.diagnostics.push({
          code: 'unpaired-dual',
          severity: 'warning',
          span: { ...block.span },
          message:
            "This ^ marks dual dialogue, but the speech before it isn't free to pair with, so it prints on its own.",
        });
      }
      speech.contd = this.template.dialogueSplit.contdAfterAction && speaker === name;
      speaker = name;
      entries.push({ type: 'speech', speech });
    }
    return entries;
  }

  #lines(
    i: number,
    p: Printing,
    frame: Frame = frameOf(p.style),
    append?: string,
    origins?: Array<Origin | null>,
  ) {
    const options = { blockIndex: i, role: p.role, style: p.style, frame };
    return blockLines(
      this.#blocks[i] as Block,
      append === undefined ? options : { ...options, append },
      origins,
    );
  }

  #block(i: number, p: Printing): BlockItem {
    // Only action is cut inside a printed line, so only its lines need to know where they came
    // from. By the element, not the role it takes: a play's action prints as `stage_direction`.
    const cuts = (this.#blocks[i] as Block).kind === 'action';
    const origins: Array<Origin | null> = [];
    const lines = blockLines(
      this.#blocks[i] as Block,
      { blockIndex: i, role: p.role, style: p.style, frame: frameOf(p.style) },
      cuts ? origins : undefined,
    );
    return {
      type: 'block',
      lines,
      origins,
      base: 0,
      cuts,
      spaceBefore: p.style.spaceBefore,
      spaceAfter: p.style.spaceAfter ?? 0,
      // A block that prints only blank lines (two-space lines) can't be what a
      // heading is kept with, so the chain runs on past it.
      keepWithNext: p.style.keepWithNext === true || lines.every(isBlank),
      keepTogether: p.style.keepTogether === true,
    };
  }

  #speech(speech: Speech): SpeechItem | null {
    const cueBlock = this.#blocks[speech.cue] as Block;
    const cueP = this.#printings[speech.cue] ?? null;
    let cue: LayoutLine[] = [];
    let contd: LayoutLine[] = [];
    if (cueP) {
      const marker = this.template.dialogueSplit.contd;
      const printed = cueBlock.lines
        .filter((line) => !line.transparent)
        .map((line) => joined(line.inline))
        .join(' ');
      // A curly apostrophe is the same mark: (CONT’D), as a word processor or an import writes it.
      const plain = (s: string) => s.trim().toUpperCase().replaceAll('’', "'");
      const already = plain(printed).endsWith(plain(marker));
      const added = speech.contd && !already;
      cue = this.#lines(speech.cue, cueP, undefined, added ? ` ${marker}` : undefined);
      // On a split, the cue prints again on the next page, ending in (CONT'D).
      contd = this.#lines(
        speech.cue,
        cueP,
        undefined,
        added || already ? undefined : ` ${marker}`,
      ).map((line) => ({
        ...line,
        blockIndex: -1,
        span: { ...cueBlock.span },
        synthetic: line.synthetic ?? 'contd',
      }));
    }
    const body: LayoutLine[] = [];
    const origins: Array<Origin | null> = [];
    const tags: Tag[] = [];
    const spoken = [0];
    let first = cueP;
    let last = cueP;
    for (const m of speech.members) {
      const p = this.#printings[m];
      if (!p) continue;
      const kind = (this.#blocks[m] as Block).kind;
      // Only dialogue is cut inside a printed line: a parenthetical and a lyric never are.
      const own: Array<Origin | null> | undefined = kind === 'dialogue' ? [] : undefined;
      const lines = this.#lines(m, p, undefined, undefined, own);
      // Each paragraph counted its lines within its own block: move the count into the body's.
      let moved: Para | undefined;
      for (const origin of own ?? []) {
        if (!origin || origin.para === moved) continue;
        moved = origin.para;
        moved.end += body.length;
      }
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k] as LayoutLine;
        const tag = isBlank(line) ? 'gap' : kind === 'parenthetical' ? 'paren' : 'text';
        body.push(line);
        origins.push(own?.[k] ?? null);
        tags.push(tag);
        spoken.push((spoken.at(-1) as number) + (tag === 'text' ? 1 : 0));
      }
      first ??= p;
      last = p;
    }
    if (!first || !last) return null;
    return {
      type: 'speech',
      cue,
      contd,
      body,
      origins,
      base: 0,
      tags,
      spoken,
      spaceBefore: first.style.spaceBefore,
      spaceAfter: last.style.spaceAfter ?? 0,
      keepWithNext: last.style.keepWithNext === true,
    };
  }

  /** One column of dual dialogue, starting `offset` characters from the left margin. */
  #column(speech: Speech, offset: number): LayoutLine[] {
    const { width, indent } = this.template.dual;
    const out: LayoutLine[] = [];
    for (const b of [speech.cue, ...speech.members]) {
      const p = this.#printings[b];
      if (!p) continue;
      const kind = (this.#blocks[b] as Block).kind;
      const at =
        kind === 'character'
          ? indent.character
          : kind === 'parenthetical'
            ? indent.parenthetical
            : indent.dialogue;
      const frame: Frame = { indent: offset + at, width: Math.max(1, width - at), align: 'left' };
      // One at a time: spreading a long speech into push() overflows the stack.
      for (const line of this.#lines(b, p, frame)) out.push(line);
    }
    return out;
  }

  #dual(left: Speech, right: Speech): DualItem {
    const l = this.#column(left, 0);
    const r = this.#column(right, this.template.dual.width + this.template.dual.gap);
    const rows: LayoutLine[] = [];
    for (let k = 0; k < Math.max(l.length, r.length); k++) {
      const a = l[k];
      const b = r[k];
      if (a && b) rows.push({ ...a, right: b });
      else if (a) rows.push(a);
      else if (b) rows.push({ ...blankLine(b.span.from), right: b });
    }
    const after = (speech: Speech) => {
      const lastIndex = [speech.cue, ...speech.members].findLast((b) => this.#printings[b]);
      return lastIndex === undefined ? 0 : (this.#printings[lastIndex]?.style.spaceAfter ?? 0);
    };
    return {
      type: 'dual',
      rows,
      spaceBefore: this.#printings[left.cue]?.style.spaceBefore ?? 0,
      spaceAfter: Math.max(after(left), after(right)),
      keepWithNext: false,
    };
  }
}

/** The fewest lines of a paragraph a page break may leave at the top of the next page. */
const MIN_LINES_AFTER = 2;

/** Fills pages with items, line by line (§5.3–§5.5). */
class Filler {
  constructor(
    private readonly template: Template,
    private readonly height: number,
    private readonly pager: Pager,
  ) {}

  fill(items: readonly Item[]) {
    const { pager } = this;
    let prev: Spacing | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item;
      // A page break ends the page unless it's still empty, so it never makes a blank page.
      if (item.type === 'break') {
        pager.newPage();
        if (item.start) pager.start(item.start);
        continue;
      }
      if (pager.room <= 0) pager.newPage();
      let space = pager.empty ? 0 : Math.max(prev?.spaceAfter ?? 0, item.spaceBefore);
      if (
        item.keepWithNext &&
        !pager.empty &&
        !this.#chainFits(items, i, pager.room, space) &&
        this.#chainFits(items, i, this.height, 0)
      ) {
        pager.newPage();
        space = 0;
      }
      if (item.type === 'block') this.#placeBlock(item, space);
      else if (item.type === 'speech') this.#placeSpeech(item, space);
      else this.#placeDual(item, space);
      prev = item;
    }
    pager.newPage();
  }

  /**
   * Whether item `i`, the keep-with-next items after it, and the start of the
   * item that ends the chain fit in `room` lines.
   */
  #chainFits(items: readonly Item[], i: number, room: number, space: number): boolean {
    let used = 0;
    let s = space;
    for (let j = i; j < items.length; j++) {
      const item = items[j] as Item;
      if (item.type === 'break') return used <= room;
      const next = items[j + 1];
      if (item.keepWithNext && next !== undefined && next.type !== 'break') {
        used += s + heightOf(item);
        if (used > room) return false;
        s = Math.max(item.spaceAfter, next.spaceBefore);
        continue;
      }
      return this.#canStart(item, room - used, s);
    }
    return used <= room;
  }

  /**
   * Whether an item can start in `room` lines: a block with `keepWithNextLines`
   * of its lines after any blank lines it opens with (all of them if it keeps
   * together), a dual pair whole, and a speech whole or split by its own rules.
   */
  #canStart(item: Printed, room: number, space: number): boolean {
    if (item.type === 'block') {
      if (space + item.lines.length <= room) return true;
      if (item.keepTogether) return false;
      return this.#blockBreak(item, { i: 0 }, room - space) !== null;
    }
    if (item.type === 'dual') return space + item.rows.length <= room;
    return (
      space + heightOf(item) <= room ||
      this.#speechBreak(item, item.cue.length, { i: 0 }, room - space, true) !== null
    );
  }

  /** What a row of a speech is, for splitting. */
  #tag(item: SpeechItem, row: Row): Tag {
    return row.at >= 0 ? (item.tags[row.at] as Tag) : isBlank(row.line) ? 'gap' : 'text';
  }

  /**
   * How many lines of dialogue a speech has from `pos` on, counted as far as `need`: reads a few
   * rows, and past them the count kept with the speech.
   */
  #spokenFrom(item: SpeechItem, pos: Pos, need: number): number {
    // Double-spaced, `need` lines take 2 × need − 1 rows; a paragraph cut short gives that many
    // or ends, so past the rows there are only lines as first wrapped.
    const { rows, done } = this.#rows(item.body, item.origins, pos, 2 * need + 1);
    let n = 0;
    for (const row of rows) if (this.#tag(item, row) === 'text') n++;
    const last = rows.at(-1);
    if (n >= need || done || !last || last.next.para) return n;
    const { spoken } = item;
    return n + (spoken[item.body.length] as number) - (spoken[last.next.i] as number);
  }

  /**
   * Where a speech that doesn't fit breaks, with `room` lines on the page for `cue` lines of cue,
   * its body lines from `pos`, and a `(MORE)` line (§5.4). A page never ends on a parenthetical or
   * a blank line, and something always goes over. When `strict`, `minLinesBefore` lines of
   * dialogue stay and `minLinesAfter` go.
   *
   * Dialogue breaks where a sentence ends, as action does (`#blockBreak`): at the last such place
   * the rule allows, the line that holds it printed short and the rest wrapped afresh. With no
   * such place, the break is after the last line the rule allows. Null when there is none. Reads
   * one page of lines at most.
   */
  #speechBreak(
    item: SpeechItem,
    cue: number,
    pos: Pos,
    room: number,
    strict: boolean,
  ): BlockBreak | null {
    const { minLinesBefore, minLinesAfter } = this.template.dialogueSplit;
    const cap = room - cue - 1;
    if (cap < 1) return null;
    const { rows, done } = this.#rows(item.body, item.origins, pos, cap + 1);
    const tags = rows.map((row) => this.#tag(item, row));
    /** `kept[k]`: how many of the first k rows are dialogue. */
    const kept = [0];
    for (const tag of tags) kept.push((kept.at(-1) as number) + (tag === 'text' ? 1 : 0));
    const allowed = (before: number, next: Pos) =>
      !strict ||
      (before >= minLinesBefore && this.#spokenFrom(item, next, minLinesAfter) >= minLinesAfter);
    // The most rows that can stay: all that fit, but one at least goes over.
    const top = Math.min(cap, done ? rows.length - 1 : rows.length);
    const past = (para: Para) => Math.min(item.body.length, para.end - item.base);
    for (let j = Math.min(cap, rows.length) - 1; j >= 0; j--) {
      const row = rows[j] as Row;
      if (tags[j] !== 'text' || !row.origin) continue;
      const { para, start } = row.origin;
      const to = offsetOf(para, row.origin.end);
      const ends = sentenceEnds(textOf(para), offsetOf(para, start), to);
      const lastOfPara = !row.next.para && row.next.i >= past(para);
      if (
        j < top &&
        (lastOfPara || ends.at(-1) === to) &&
        allowed(kept[j + 1] as number, row.next)
      ) {
        return { rows: rows.slice(0, j + 1), next: row.next };
      }
      for (let e = ends.length - 1; e >= 0; e--) {
        const end = ends[e] as number;
        if (end >= to) continue;
        const cell = cellAt(para, end);
        const next: Pos = { i: past(para), para, cell: pastSpaces(para, cell) };
        if (!allowed((kept[j] as number) + 1, next)) continue;
        return { rows: rows.slice(0, j), short: paraLine(para, start, cell).line, next };
      }
    }
    for (let k = top; k >= 1; k--) {
      if (tags[k - 1] !== 'text') continue;
      const next = (rows[k - 1] as Row).next;
      if (allowed(kept[k] as number, next)) return { rows: rows.slice(0, k), next };
    }
    return null;
  }

  /**
   * Up to `max` of a block's lines from `pos` on (one more, at most, when it is double-spaced): the
   * rest of a paragraph a page ended inside, wrapped afresh, then the lines after it as they were
   * first wrapped. `done` when they are all that is left. Costs the rows, not the block's length.
   */
  #rows(
    lines: readonly LayoutLine[],
    origins: ReadonlyArray<Origin | null>,
    pos: Pos,
    max: number,
  ): { rows: Row[]; done: boolean } {
    const rows: Row[] = [];
    if (max <= 0) return { rows, done: false };
    if (pos.para) {
      const para = pos.para;
      const { ranges, next } = paraWrap(
        para,
        pos.cell as number,
        // Double-spaced, n lines take 2n − 1 rows.
        para.double ? Math.ceil((max + 1) / 2) : max,
      );
      ranges.forEach(([start, end], k) => {
        const after = ranges[k + 1]?.[0] ?? next;
        const { line, origin } = paraLine(para, start, end);
        if (k > 0 && para.double) {
          const here: Pos = { i: pos.i, para, cell: start };
          rows.push({ line: blankLine(line.span.from), origin: null, at: -1, next: here });
        }
        rows.push({
          line,
          origin,
          at: -1,
          next: after === null ? { i: pos.i } : { i: pos.i, para, cell: after },
        });
      });
      if (next !== null) return { rows, done: false };
    }
    let j = pos.i;
    for (; j < lines.length && rows.length < max; j++) {
      rows.push({
        line: lines[j] as LayoutLine,
        origin: origins[j] ?? null,
        at: j,
        next: { i: j + 1 },
      });
    }
    return { rows, done: j >= lines.length };
  }

  /**
   * Where a block that doesn't fit breaks, with `room` lines on the page (§5.3). At least
   * `keepWithNextLines` of its lines stay, after any blank lines it opens with, and at least two go
   * to the next page: no line of a paragraph is left alone at the foot of a page or the head of the
   * next, and a page never ends on a blank line.
   *
   * Action breaks where a sentence ends: at the last such place that fits, the line that holds it
   * printed short and the rest wrapped afresh from the next sentence's first word. A line the
   * writer ended counts as a sentence's end. When no sentence ends where the rule allows, and for
   * everything but action, the break is at the end of the last printed line that fits. Null when
   * there's no break at all.
   */
  #blockBreak(item: BlockItem, pos: Pos, room: number): BlockBreak | null {
    const { rows } = this.#rows(item.lines, item.origins, pos, room + MIN_LINES_AFTER);
    let lead = 0;
    while (lead < rows.length && isBlank((rows[lead] as Row).line)) lead++;
    const least = lead + this.template.keepWithNextLines;
    if (item.cuts) {
      // Past the paragraph a row belongs to: where the block goes on after what is cut from it.
      const past = (para: Para) => Math.min(item.lines.length, para.end - item.base);
      for (let j = Math.min(room, rows.length) - 1; j >= 0 && j + 1 >= least; j--) {
        const row = rows[j] as Row;
        if (!row.origin) continue;
        const { para, start } = row.origin;
        const to = offsetOf(para, row.origin.end);
        const ends = sentenceEnds(textOf(para), offsetOf(para, start), to);
        const lastOfPara = !row.next.para && row.next.i >= past(para);
        if ((lastOfPara || ends.at(-1) === to) && rows.length - (j + 1) >= MIN_LINES_AFTER) {
          return { rows: rows.slice(0, j + 1), next: row.next };
        }
        for (let e = ends.length - 1; e >= 0; e--) {
          const end = ends[e] as number;
          if (end >= to) continue;
          const cell = cellAt(para, end);
          const next: Pos = { i: past(para), para, cell: pastSpaces(para, cell) };
          if (
            this.#rows(item.lines, item.origins, next, MIN_LINES_AFTER).rows.length <
            MIN_LINES_AFTER
          )
            continue;
          const short = paraLine(para, start, cell).line;
          return { rows: rows.slice(0, j), short, next };
        }
      }
    }
    for (let k = Math.min(room, rows.length - MIN_LINES_AFTER); k >= least; k--) {
      const last = rows[k - 1] as Row;
      if (isBlank(last.line)) continue;
      return { rows: rows.slice(0, k), next: last.next };
    }
    return null;
  }

  #placeBlock(item: BlockItem, space: number) {
    const { pager } = this;
    const { lines } = item;
    const at = lines[0]?.span.from ?? pager.flow;
    let pos: Pos = { i: 0 }; // where what isn't placed yet starts
    let s = space;
    for (;;) {
      const room = pager.room - s;
      // How many lines are left, as far as it matters: whether they fit here, or on a page.
      const reach = Math.max(0, item.keepTogether ? this.height : room) + 1;
      const rest = pos.para ? this.#rows(item.lines, item.origins, pos, reach) : null;
      const left = rest
        ? rest.done
          ? rest.rows.length
          : Number.POSITIVE_INFINITY
        : lines.length - pos.i;
      if (left <= room) {
        pager.space(s, at);
        if (rest) for (const row of rest.rows) pager.put(row.line);
        else pager.putAll(lines, pos.i);
        return;
      }
      const fitsAPage = left <= this.height;
      if (item.keepTogether && fitsAPage && !pager.empty) {
        pager.newPage();
        s = 0;
        continue;
      }
      const found = this.#blockBreak(item, pos, room);
      if (found !== null) {
        pager.space(s, at);
        for (const row of found.rows) pager.put(row.line);
        if (found.short) pager.put(found.short);
        pager.newPage();
        pos = found.next;
        s = 0;
        continue;
      }
      // Too little room to split: the rest moves to the next page whole.
      if (!pager.empty) {
        pager.newPage();
        s = 0;
        continue;
      }
      // A page to itself and still no split, such as one line left over: it runs on.
      for (const row of this.#rows(item.lines, item.origins, pos, Number.POSITIVE_INFINITY).rows)
        pager.put(row.line);
      return;
    }
  }

  #placeSpeech(item: SpeechItem, space: number) {
    const { pager } = this;
    const { body, origins, tags } = item;
    const more = item.more ? 1 : 0;
    let cue = item.cue;
    let pos: Pos = { i: 0 }; // where the body lines not yet placed start
    let s = space;
    const putRest = (rows: Row[] | null) => {
      pager.putAll(cue);
      if (rows) for (const row of rows) pager.put(row.line);
      else pager.putAll(body, pos.i);
      if (item.more) pager.put(this.#more(pager.flow));
    };
    for (;;) {
      const at = cue[0]?.span.from ?? body[pos.i]?.span.from ?? pager.flow;
      const room = pager.room - s;
      // The body lines there is room for, when nothing more is cut.
      const fit = room - cue.length - more;
      const rest = pos.para ? this.#rows(body, origins, pos, Math.max(0, fit) + 1) : null;
      const left = rest
        ? rest.done
          ? rest.rows.length
          : Number.POSITIVE_INFINITY
        : body.length - pos.i;
      if (left <= fit) {
        pager.space(s, at);
        putRest(rest ? rest.rows : null);
        return;
      }
      let found = this.#speechBreak(item, cue.length, pos, room, true);
      // A speech taller than a page splits wherever it can.
      if (found === null && pager.empty) {
        found = this.#speechBreak(item, cue.length, pos, room, false);
      }
      if (found !== null) {
        pager.space(s, at);
        pager.putAll(cue);
        for (const row of found.rows) pager.put(row.line);
        if (found.short) pager.put(found.short);
        pager.put(this.#more(pager.flow));
        pager.newPage();
        pos = found.next;
        if (!pos.para) while (tags[pos.i] === 'gap') pos = { i: pos.i + 1 };
        cue = item.contd;
        s = 0;
        continue;
      }
      // Too little room to split: the whole speech moves to the next page.
      if (!pager.empty) {
        pager.newPage();
        s = 0;
        continue;
      }
      // Nowhere to split at all, such as a parenthetical taller than a page.
      putRest(this.#rows(body, origins, pos, Number.POSITIVE_INFINITY).rows);
      return;
    }
  }

  #placeDual(item: DualItem, space: number) {
    const { pager } = this;
    if (space + item.rows.length <= pager.room)
      pager.space(space, item.rows[0]?.span.from ?? pager.flow);
    else pager.newPage();
    pager.putAll(item.rows);
  }

  #more(at: number): LayoutLine {
    const { more, moreIndent } = this.template.dialogueSplit;
    return {
      col: moreIndent,
      runs: [
        {
          text: more,
          bold: false,
          italic: false,
          underline: false,
          span: { from: at, to: at },
          synthetic: true,
        },
      ],
      role: 'more',
      blockIndex: -1,
      span: { from: at, to: at },
      synthetic: 'more',
    };
  }
}

/** The page being filled, and the pages finished so far. */
class Pager {
  readonly pages: Page[] = [];
  readonly index: Array<{ page: number; line: number } | undefined>;
  /** The last line that printed. */
  last: { page: number; line: number } | null = null;
  /** How far into the source printing has got: where blank lines stand. */
  flow = 0;
  #lines: LayoutLine[] = [];
  /** The label of the page being filled, when it isn't its number. */
  #label: string | null = null;
  /** The last locked page's label, which A-pages count from, and how many have followed it. */
  #base: string | null = null;
  #extra = 0;
  #left: Page['sceneNumbersLeft'] = [];
  #right: Page['sceneNumbersRight'] = [];

  constructor(
    private readonly template: Template,
    private readonly height: number,
    private readonly scenes: ReadonlyMap<number, string>,
    blocks: number,
  ) {
    this.index = Array.from({ length: blocks }, () => undefined);
  }

  get room() {
    return this.height - this.#lines.length;
  }

  get empty() {
    return this.#lines.length === 0;
  }

  space(n: number, at: number) {
    for (let k = 0; k < n; k++) this.put(blankLine(at));
  }

  putAll(lines: readonly LayoutLine[], from = 0, to = lines.length) {
    for (let k = from; k < to; k++) this.put(lines[k] as LayoutLine);
  }

  /** Adds a line, starting a new page when this one is full. A page never starts blank. */
  put(line: LayoutLine) {
    if (this.#lines.length >= this.height) this.newPage();
    const blank = isBlank(line);
    if (blank && this.#lines.length === 0) return;
    const at = { page: this.pages.length + 1, line: this.#lines.length };
    this.#lines.push(line);
    if (!blank) this.last = { ...at };
    for (const part of line.right ? [line, line.right] : [line]) {
      if (part.blockIndex < 0) continue;
      this.flow = Math.max(this.flow, part.span.to);
      if (this.index[part.blockIndex]) continue;
      this.index[part.blockIndex] = { ...at };
      const scene = this.scenes.get(part.blockIndex);
      if (scene !== undefined) {
        this.#left.push({ line: at.line, text: scene });
        this.#right.push({ line: at.line, text: scene });
      }
    }
  }

  /** Starts a locked page: the page being filled, which is empty, takes its label. */
  start(start: PageStart) {
    this.#base = start.label;
    this.#extra = 0;
    this.#label = start.printed;
  }

  /** Finishes the page, if anything is on it. */
  newPage() {
    if (this.#lines.length === 0) return;
    while (this.#lines.length < this.height) this.#lines.push(blankLine(this.flow));
    const number = this.pages.length + 1;
    const { page } = this.template;
    const result: Page = {
      number,
      label: this.#label ?? String(number),
      lines: this.#lines,
      sceneNumbersLeft: this.#left,
      sceneNumbersRight: this.#right,
    };
    const { numbering } = page;
    if (numbering.position === 'top-right' && number >= numbering.firstNumbered) {
      const text = numbering.format.replaceAll('{n}', result.label);
      const width = page.width - page.margin.left - page.margin.right;
      result.pageNumber = { text, line: numbering.line, col: Math.max(0, width - columns(text)) };
    }
    if (page.header !== undefined) result.header = page.header.replaceAll('{n}', result.label);
    if (page.footer !== undefined) result.footer = page.footer.replaceAll('{n}', result.label);
    this.pages.push(result);
    // Past a locked page, pages are its A-pages until the next one starts.
    if (this.#base !== null) this.#label = this.#base + suffix(++this.#extra);
    this.#lines = [];
    this.#left = [];
    this.#right = [];
  }
}

/** A locked page's start, resolved to the block and the printed line of it the page starts at. */
interface Resolved {
  start: PageStart;
  at: number;
  printed: number;
  block: number;
}

/** The index of the block holding offset `at`, or of the first block after it; `blocks.length` past the end. */
function blockAt(blocks: readonly Block[], at: number): number {
  let lo = 0;
  let hi = blocks.length;
  // The first block that ends after `at`.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((blocks[mid] as Block).span.to > at) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The lines an item prints from source, with the block each belongs to. */
function sourceLines(item: Printed): readonly LayoutLine[] {
  if (item.type === 'block') return item.lines;
  if (item.type === 'speech') return item.body;
  return item.rows;
}

/** The first and last block an item prints, or null when it prints none. */
function blocksOf(item: Printed): [number, number] | null {
  let first = Number.POSITIVE_INFINITY;
  let last = -1;
  const lines = item.type === 'speech' ? [...item.cue, ...item.body] : sourceLines(item);
  for (const line of lines)
    for (const part of line.right ? [line, line.right] : [line]) {
      if (part.blockIndex < 0) continue;
      first = Math.min(first, part.blockIndex);
      last = Math.max(last, part.blockIndex);
    }
  return last < 0 ? null : [first, last];
}

/**
 * Where in an item a locked page starts: the index of the line in its lines (a block) or its body
 * (a speech) that opens the page; 0 for the whole item. The anchor's source line's first printed
 * line, `printed` lines on, clamped to the block's last printed line.
 */
function cutOf(item: Printed, anchor: Resolved): number {
  if (item.type === 'dual') return 0;
  const lines = sourceLines(item);
  const own: number[] = [];
  for (let k = 0; k < lines.length; k++)
    if ((lines[k] as LayoutLine).blockIndex === anchor.block) own.push(k);
  if (own.length === 0) return 0;
  let first = own.findIndex((k) => (lines[k] as LayoutLine).span.from >= anchor.at);
  if (first < 0) first = own.length - 1;
  return own[Math.min(first + Math.max(0, anchor.printed), own.length - 1)] as number;
}

/**
 * Where the lines `from` to `to` of an item came from, for a piece of it. A piece that stops inside
 * a paragraph mustn't wrap that paragraph's rest again, since the next piece prints it: its lines
 * there are left without an origin, and break only between them.
 */
function originsOf(item: BlockItem | SpeechItem, from: number, to: number): Array<Origin | null> {
  const origins = item.origins.slice(from, to);
  const cut = origins.at(-1)?.para;
  if (cut && cut.end - item.base > to) {
    for (let k = origins.length - 1; k >= 0 && (origins[k] ?? null)?.para === cut; k--) {
      origins[k] = null;
    }
  }
  return origins;
}

/** Splits a block or speech at line indexes `cuts` (ascending, each > 0), a page start before each piece but the first. */
function pieces(item: BlockItem | SpeechItem, cuts: number[]): Printed[] {
  const out: Printed[] = [];
  if (item.type === 'block') {
    const ends = [0, ...cuts, item.lines.length];
    for (let p = 0; p + 1 < ends.length; p++) {
      const last = p + 2 === ends.length;
      const from = ends[p] as number;
      const to = ends[p + 1] as number;
      const origins = originsOf(item, from, to);
      out.push({
        type: 'block',
        lines: item.lines.slice(from, to),
        origins,
        base: item.base + from,
        cuts: item.cuts,
        spaceBefore: p === 0 ? item.spaceBefore : 0,
        spaceAfter: last ? item.spaceAfter : 0,
        keepWithNext: last ? item.keepWithNext : false,
        keepTogether: false,
      });
    }
    return out;
  }
  const { body, tags, spoken } = item;
  const ends = [0, ...cuts, body.length];
  for (let p = 0; p + 1 < ends.length; p++) {
    let from = ends[p] as number;
    let to = ends[p + 1] as number;
    while (from < to && tags[from] === 'gap') from++;
    while (to > from && tags[to - 1] === 'gap') to--;
    const last = p + 2 === ends.length;
    const piece: SpeechItem = {
      type: 'speech',
      cue: p === 0 ? item.cue : item.contd,
      contd: item.contd,
      body: body.slice(from, to),
      origins: originsOf(item, from, to),
      base: item.base + from,
      tags: tags.slice(from, to),
      spoken: spoken.slice(from, to + 1).map((n) => n - (spoken[from] as number)),
      spaceBefore: p === 0 ? item.spaceBefore : 0,
      spaceAfter: last ? item.spaceAfter : 0,
      keepWithNext: last ? item.keepWithNext : false,
    };
    if (!last) piece.more = true;
    out.push(piece);
  }
  return out;
}

/**
 * The items of a locked script (production design §7.2): a page break before each locked page's
 * start, splitting a block between its printed lines, or a speech with `(MORE)` and `(CONT'D)`.
 */
function lockedItems(
  items: readonly Item[],
  blocks: readonly Block[],
  locked: LockedPages,
): Item[] {
  const printed = printedLabels(locked);
  const anchors: Resolved[] = locked.anchors
    .map((a) => ({
      start: { label: a.label, printed: printed(a.label) },
      at: a.at,
      printed: a.printed,
      block: blockAt(blocks, a.at),
    }))
    .sort((a, b) => a.at - b.at);
  const out: Item[] = [];
  let next = 0;
  for (const item of items) {
    const range = item.type === 'break' ? null : blocksOf(item);
    if (item.type === 'break' || range === null) {
      out.push(item);
      continue;
    }
    // Cut points in this item, by line index, the later anchor winning a tie.
    const cuts = new Map<number, PageStart>();
    for (; next < anchors.length && (anchors[next] as Resolved).block <= range[1]; next++) {
      const anchor = anchors[next] as Resolved;
      cuts.set(anchor.block < range[0] ? 0 : cutOf(item, anchor), anchor.start);
    }
    const before = cuts.get(0);
    if (before) out.push({ type: 'break', start: before });
    cuts.delete(0);
    if (cuts.size === 0 || item.type === 'dual') {
      out.push(item);
      continue;
    }
    const at = [...cuts.keys()].sort((a, b) => a - b);
    const parts = pieces(item, at);
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) out.push({ type: 'break', start: cuts.get(at[p - 1] as number) as PageStart });
      out.push(parts[p] as Printed);
    }
  }
  return out;
}
