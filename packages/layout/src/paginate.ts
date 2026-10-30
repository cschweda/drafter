import type { Block, Doc } from '@drafter/fountain';
import { type Role, type RoleStyle, resolveRole, type Template } from '@drafter/templates';
import { blankLine, blockLines, columns, type Frame, frameOf, isBlank, joined } from './lines';
import { numbersOf, rolesOf } from './numbers';
import { titlePage } from './title';
import {
  type Layout,
  type LayoutDiagnostic,
  type LayoutLine,
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
  keepTogether: boolean;
}

/** A dialogue group: a cue, then its parentheticals, dialogue, and lyrics. */
interface SpeechItem extends Spacing {
  type: 'speech';
  cue: LayoutLine[];
  /** The cue as it prints at the top of the next page when the speech splits. */
  contd: LayoutLine[];
  body: LayoutLine[];
  tags: Tag[];
  /** `spoken[k]`: how many of the first k body lines are dialogue. */
  spoken: number[];
}

interface DualItem extends Spacing {
  type: 'dual';
  rows: LayoutLine[];
}

type Printed = BlockItem | SpeechItem | DualItem;
type Item = Printed | { type: 'break' };

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
      : item.cue.length + item.body.length;

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
  const { items, scenes } = new Items(doc, template, height, diagnostics).build(numbering);
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

  build(numbering: SceneNumbering): { items: Item[]; scenes: Map<number, string> } {
    const entries = this.#entries();
    const items: Item[] = [];
    const scenes = numbersOf(this.#blocks, this.#roles, numbering);
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

  #lines(i: number, p: Printing, frame: Frame = frameOf(p.style), append?: string) {
    const options = { blockIndex: i, role: p.role, style: p.style, frame };
    return blockLines(
      this.#blocks[i] as Block,
      append === undefined ? options : { ...options, append },
    );
  }

  #block(i: number, p: Printing): BlockItem {
    const lines = this.#lines(i, p);
    return {
      type: 'block',
      lines,
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
      const already = printed.trimEnd().toUpperCase().endsWith(marker.trim().toUpperCase());
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
    const tags: Tag[] = [];
    const spoken = [0];
    let first = cueP;
    let last = cueP;
    for (const m of speech.members) {
      const p = this.#printings[m];
      if (!p) continue;
      const kind = (this.#blocks[m] as Block).kind;
      for (const line of this.#lines(m, p)) {
        const tag = isBlank(line) ? 'gap' : kind === 'parenthetical' ? 'paren' : 'text';
        body.push(line);
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
      // Opening two-space lines print nothing, so a heading can't be kept with them alone.
      const lead = Math.max(
        0,
        item.lines.findIndex((line) => !isBlank(line)),
      );
      const lines = item.keepTogether
        ? item.lines.length
        : Math.min(item.lines.length, lead + this.template.keepWithNextLines);
      return space + lines <= room;
    }
    if (item.type === 'dual') return space + item.rows.length <= room;
    return (
      space + item.cue.length + item.body.length <= room ||
      this.#split(item, item.cue.length, 0, room - space, true) !== null
    );
  }

  /**
   * How many of a speech's body lines, from `from`, can stay on a page of
   * `room` lines after `cue` lines of cue and before a `(MORE)` line: never
   * ending on a parenthetical or a blank line, and, when `strict`, leaving
   * `minLinesBefore` dialogue lines here and `minLinesAfter` for the next page
   * (§5.4). Null when there's no such split. Looks at one page of lines at most.
   */
  #split(
    item: SpeechItem,
    cue: number,
    from: number,
    room: number,
    strict: boolean,
  ): number | null {
    const { minLinesBefore, minLinesAfter } = this.template.dialogueSplit;
    const { tags, spoken } = item;
    const start = spoken[from] as number;
    const total = (spoken[tags.length] as number) - start;
    for (let k = Math.min(room - cue - 1, tags.length - from - 1); k >= 1; k--) {
      if (tags[from + k - 1] !== 'text') continue;
      const kept = (spoken[from + k] as number) - start;
      if (strict && (kept < minLinesBefore || total - kept < minLinesAfter)) continue;
      return k;
    }
    return null;
  }

  #placeBlock(item: BlockItem, space: number) {
    const { pager } = this;
    const at = item.lines[0]?.span.from ?? pager.flow;
    if (space + item.lines.length <= pager.room) {
      pager.space(space, at);
    } else if (item.keepTogether && item.lines.length <= this.height) {
      pager.newPage();
    } else if (pager.room - space <= 0) {
      pager.newPage();
    } else {
      pager.space(space, at);
    }
    // What doesn't fit continues on the next page.
    pager.putAll(item.lines);
  }

  #placeSpeech(item: SpeechItem, space: number) {
    const { pager } = this;
    const { body, tags } = item;
    let cue = item.cue;
    let from = 0; // the first body line not yet placed
    let s = space;
    for (;;) {
      const at = cue[0]?.span.from ?? body[from]?.span.from ?? pager.flow;
      if (s + cue.length + body.length - from <= pager.room) {
        pager.space(s, at);
        pager.putAll(cue);
        pager.putAll(body, from);
        return;
      }
      const room = pager.room - s;
      let k = this.#split(item, cue.length, from, room, true);
      // A speech taller than a page splits wherever it can.
      if (k === null && pager.empty) k = this.#split(item, cue.length, from, room, false);
      if (k !== null) {
        pager.space(s, at);
        pager.putAll(cue);
        pager.putAll(body, from, from + k);
        pager.put(this.#more(pager.flow));
        pager.newPage();
        from += k;
        while (tags[from] === 'gap') from++;
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
      pager.putAll(cue);
      pager.putAll(body, from);
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

  /** Finishes the page, if anything is on it. */
  newPage() {
    if (this.#lines.length === 0) return;
    while (this.#lines.length < this.height) this.#lines.push(blankLine(this.flow));
    const number = this.pages.length + 1;
    const { page } = this.template;
    const result: Page = {
      number,
      lines: this.#lines,
      sceneNumbersLeft: this.#left,
      sceneNumbersRight: this.#right,
    };
    const { numbering } = page;
    if (numbering.position === 'top-right' && number >= numbering.firstNumbered) {
      const text = numbering.format.replaceAll('{n}', String(number));
      const width = page.width - page.margin.left - page.margin.right;
      result.pageNumber = { text, line: numbering.line, col: Math.max(0, width - columns(text)) };
    }
    if (page.header !== undefined) result.header = page.header.replaceAll('{n}', String(number));
    if (page.footer !== undefined) result.footer = page.footer.replaceAll('{n}', String(number));
    this.pages.push(result);
    this.#lines = [];
    this.#left = [];
    this.#right = [];
  }
}
