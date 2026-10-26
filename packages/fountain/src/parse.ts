import { parseInline, type Seg } from './inline';
import { isBlankText, type RawRegion, scanRegions } from './regions';
import type {
  Block,
  BlockKind,
  BlockSem,
  CharacterSem,
  Doc,
  DrafterMeta,
  InlineRun,
  Line,
  ParseDiagnostic,
  Region,
  SceneHeadingSem,
  Span,
  TitleField,
  TitlePage,
} from './types';

interface Ctx {
  source: string;
  regions: RawRegion[];
}

/** What the parser knows about one physical line. */
interface LineInfo {
  from: number;
  /** End of the line, excluding its `\n`. */
  to: number;
  raw: string;
  /** Source ranges left after removing regions, a CRLF's `\r`, and a leading BOM. */
  kept: Seg[];
  keptText: string;
  /** Kind of the first region the line touches, if any. */
  regionKind: RawRegion['kind'] | null;
  /** Touches a region and has nothing else: neither ends a block nor prints. */
  transparent: boolean;
  blank: boolean;
  /** `keptText` with leading whitespace trimmed: the "test text" of §2.5. */
  t: string;
  /** `t` with trailing whitespace trimmed too. */
  tt: string;
}

interface Proto {
  kind: BlockKind;
  forced: boolean;
  start: number;
  /** Exclusive. */
  end: number;
}

// Every pattern here is anchored and unambiguous, so it runs in linear time on
// any line; cues, title-page keys, and scene numbers are scanned by hand
// (`parseCue`, `readKeyLine`, `sceneNumber`) for the same reason.
const HEADING = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i;
const HEADING_PREFIX = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)(?:\.|(?=\s)|$)/i;
const SCENE_NUMBER_TEXT = /^[\p{L}\p{N}.-]+$/u;
const TITLE_KEY = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u;
const TITLE_KEYS = new Set([
  'title',
  'credit',
  'author',
  'authors',
  'source',
  'draft date',
  'date',
  'contact',
  'copyright',
  'notes',
]);
const EMPHASIS_KINDS = new Set<BlockKind>([
  'action',
  'dialogue',
  'parenthetical',
  'centered',
  'lyric',
]);

/** Has at least one uppercase letter and no lowercase letters. */
function isUpper(text: string): boolean {
  return /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
}

const isSpaceAt = (text: string, i: number) => i < text.length && /\s/.test(text.charAt(i));

/**
 * Reads a cue line: a name, then any parenthetical extensions, then an optional
 * `^`, and nothing else. Returns null when the line has any other shape.
 */
export function parseCue(text: string): CharacterSem | null {
  let i = 0;
  while (i < text.length && text[i] !== '(' && text[i] !== '^') i++;
  const name = text.slice(0, i).trim();
  if (!name) return null;
  const extensionStart = i;
  let extensionEnd = i;
  for (;;) {
    while (isSpaceAt(text, i)) i++;
    if (text[i] !== '(') break;
    const close = text.indexOf(')', i + 1);
    if (close === -1) return null;
    i = close + 1;
    extensionEnd = i;
  }
  const dual = text[i] === '^';
  if (dual) i++;
  while (isSpaceAt(text, i)) i++;
  if (i !== text.length) return null;
  const extension = text.slice(extensionStart, extensionEnd).trim();
  return { name, extension: extension || null, dual };
}

/** Splits a title-page line into key and value, or returns null if it isn't one. */
function readKeyLine(text: string): { key: string; value: string } | null {
  const colon = text.indexOf(':');
  if (colon <= 0) return null;
  const key = text.slice(0, colon).trimEnd();
  if (!TITLE_KEY.test(key)) return null;
  return { key, value: text.slice(colon + 1).trim() };
}

/**
 * Finds a trailing scene number such as ` #12A#`: its text, and how many
 * characters it occupies at the end of `text`, counting the spaces before it.
 */
function sceneNumber(text: string): { number: string; length: number } | null {
  if (text.length < 3 || !text.endsWith('#')) return null;
  const open = text.lastIndexOf('#', text.length - 2);
  if (open === -1) return null;
  const number = text.slice(open + 1, -1);
  if (!SCENE_NUMBER_TEXT.test(number)) return null;
  let start = open;
  while (start > 0 && isSpaceAt(text, start - 1)) start--;
  return { number, length: text.length - start };
}

/** The regions that overlap `span`, found by binary search over sorted regions. */
function regionsIn(regions: RawRegion[], span: Span): RawRegion[] {
  let lo = 0;
  let hi = regions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((regions[mid] as RawRegion).to <= span.from) lo = mid + 1;
    else hi = mid;
  }
  const out: RawRegion[] = [];
  for (let k = lo; k < regions.length && (regions[k] as RawRegion).from < span.to; k++) {
    out.push(regions[k] as RawRegion);
  }
  return out;
}

/** The pre-pass's regions as the public `Region`s: each pair of offsets becomes a `Span`. */
function toRegions(regions: RawRegion[]): Region[] {
  return regions.map(({ kind, from, to, closed }) => ({ kind, span: { from, to }, closed }));
}

export function parse(source: string): Doc {
  const { regions, diagnostics } = scanRegions(source);
  const ctx: Ctx = { source, regions };
  const lines = readLines(source, regions);
  const { titlePage, lineCount: titleLines } = readTitlePage(source, lines);

  const protos: Proto[] = [];
  const emit = (kind: BlockKind, start: number, end: number, forced = false) => {
    const proto = { kind, forced, start, end };
    protos.push(proto);
    return proto;
  };
  const lenient = (code: string, span: Span, message: string) =>
    diagnostics.push({ code, severity: 'info', span, message, portability: true });

  const lineSpan = (i: number): Span => {
    const line = lines[i] as LineInfo;
    return { from: line.from, to: line.to };
  };
  const at = (i: number) => lines[i] as LineInfo;

  // Classifies a run: lines of one physical block between line-level markers.
  const classifyRun = (start: number, end: number) => {
    // The run's last content line, found once: a block that takes "the run"
    // ends there, and trailing transparent lines become their own block.
    let lastContent = end - 1;
    while (lastContent >= start && at(lastContent).transparent) lastContent--;
    const runEnd = lastContent + 1;
    let i = start;
    while (i < end) {
      if (at(i).transparent) {
        let j = i;
        while (j < end && at(j).transparent) j++;
        emit(at(i).regionKind ?? 'note', i, j);
        i = j;
        continue;
      }
      const contentAfter = lastContent > i;
      const { t, tt } = at(i);
      const single = (kind: BlockKind, forced: boolean) => {
        emit(kind, i, i + 1, forced);
        if (contentAfter) {
          lenient(
            'heading-blank-after',
            lineSpan(i),
            'Strict Fountain needs a blank line after a scene heading or transition.',
          );
        }
        i++;
      };

      if (tt.startsWith('!')) {
        emit('action', i, runEnd, true);
        i = runEnd;
      } else if (tt.startsWith('@')) {
        buildGroup(i, runEnd, true);
        i = runEnd;
      } else if (tt.startsWith('~')) {
        const j = consecutive(i, end, (l) => l.tt.startsWith('~'));
        emit('lyric', i, j, true);
        i = j;
      } else if (tt.startsWith('>') && tt.endsWith('<')) {
        const j = consecutive(i, end, (l) => l.tt.startsWith('>') && l.tt.endsWith('<'));
        emit('centered', i, j, true);
        i = j;
      } else if (tt.startsWith('>')) {
        single('transition', true);
      } else if (/^\.[\p{L}\p{N}]/u.test(tt)) {
        single('scene_heading', true);
      } else if (t.endsWith('TO:') && isUpper(t)) {
        single('transition', false);
      } else if (HEADING.test(tt) && (!contentAfter || isUpper(tt))) {
        single('scene_heading', false);
      } else if (contentAfter && isCue(tt)) {
        buildGroup(i, runEnd, false);
        i = runEnd;
      } else {
        emit('action', i, runEnd);
        i = runEnd;
      }
    }
  };

  const isCue = (tt: string) => {
    const cue = parseCue(tt);
    return cue !== null && isUpper(cue.name);
  };

  // `end` is exclusive; returns the end of a run of lines matching `pred`,
  // allowing transparent lines inside it but not at its end.
  const consecutive = (start: number, end: number, pred: (l: LineInfo) => boolean) => {
    let j = start + 1;
    while (j < end && (at(j).transparent || pred(at(j)))) j++;
    while (j > start + 1 && at(j - 1).transparent) j--;
    return j;
  };

  // A cue line and the speech under it: parentheticals, lyrics, and dialogue.
  const buildGroup = (start: number, end: number, forced: boolean) => {
    let k = start + 1;
    while (k < end && at(k).transparent) k++;
    let last = emit('character', start, k, forced);
    while (k < end) {
      const line = at(k);
      if (line.transparent) {
        last.end = k + 1;
        k++;
        continue;
      }
      if (line.tt.startsWith('(')) {
        if (line.tt.endsWith(')')) {
          last = emit('parenthetical', k, k + 1);
          k++;
          continue;
        }
        const close = parenClose(k, end);
        if (close !== -1) {
          last = emit('parenthetical', k, close + 1);
          lenient(
            'multiline-parenthetical',
            { from: line.from, to: at(close).to },
            'Strict Fountain keeps a parenthetical on one line; other apps show the rest as dialogue.',
          );
          k = close + 1;
          continue;
        }
      }
      const kind: BlockKind = line.tt.startsWith('~') ? 'lyric' : 'dialogue';
      if (last.kind === kind && last.end === k) last.end = k + 1;
      else last = emit(kind, k, k + 1, kind === 'lyric');
      k++;
    }
  };

  // A multi-line parenthetical: the first line opens a `(` that stays open, the
  // last line ends with the `)` that closes it, and no line between starts with `(`.
  const parenClose = (start: number, end: number) => {
    let depth = parenDepth(at(start).tt);
    if (depth <= 0) return -1;
    for (let m = start + 1; m < end; m++) {
      const line = at(m);
      if (line.transparent) continue;
      if (line.tt.startsWith('(')) return -1;
      depth += parenDepth(line.tt);
      if (depth <= 0) return depth === 0 && line.tt.endsWith(')') ? m : -1;
    }
    return -1;
  };

  // Physical blocks are runs of non-blank lines; line-level markers split them.
  let i = titleLines;
  while (i < lines.length) {
    if (at(i).blank) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && !at(j).blank) j++;
    let runStart = i;
    for (let k = i; k < j; k++) {
      const kind = lineLevelKind(at(k));
      if (kind) {
        if (runStart < k) classifyRun(runStart, k);
        emit(kind, k, k + 1);
        runStart = k + 1;
      }
    }
    if (runStart < j) classifyRun(runStart, j);
    i = j;
  }

  const blocks: Block[] = [];
  let prevEnd = titlePage ? titlePage.span.to : 0;
  for (const proto of protos) {
    const first = at(proto.start);
    const lastLine = at(proto.end - 1);
    const span = { from: first.from, to: lastLine.to };
    const infos = lines.slice(proto.start, proto.end);
    const blockLines = infos.map(
      (info, k) => new LineNode(ctx, info, proto.kind, k === 0 && proto.forced),
    );
    blocks.push(
      new BlockNode(
        ctx,
        proto.kind,
        proto.forced,
        span,
        source.slice(prevEnd, span.from),
        blockLines,
        infos,
      ) as unknown as Block,
    );
    prevEnd = span.to;
  }

  const meta = readMeta(ctx, blocks, diagnostics);
  diagnostics.sort((a, b) => a.span.from - b.span.from);
  return {
    titlePage,
    blocks,
    trailing: source.slice(prevEnd),
    meta,
    diagnostics,
    regions: toRegions(regions),
    source,
  };
}

function parenDepth(text: string): number {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth;
}

function lineLevelKind(line: LineInfo): BlockKind | null {
  if (line.transparent) return null;
  if (/^={3,}$/.test(line.tt)) return 'page_break';
  if (line.tt.startsWith('#')) return 'section';
  if (line.tt.startsWith('=')) return 'synopsis';
  return null;
}

function readLines(source: string, regions: RawRegion[]): LineInfo[] {
  const lines: LineInfo[] = [];
  let r = 0;
  let from = 0;
  for (;;) {
    const nl = source.indexOf('\n', from);
    const to = nl === -1 ? source.length : nl;
    const contentEnd = to > from && source.charCodeAt(to - 1) === 13 ? to - 1 : to;
    const contentStart =
      from === 0 && source.charCodeAt(0) === 0xfeff ? Math.min(1, contentEnd) : from;
    // A region touches the line if it covers any character, or the line's \n.
    const limit = nl === -1 ? to : to + 1;
    while (r < regions.length && (regions[r] as RawRegion).to <= from) r++;
    const kept: Seg[] = [];
    let regionKind: RawRegion['kind'] | null = null;
    let cursor = contentStart;
    for (let k = r; k < regions.length && (regions[k] as RawRegion).from < limit; k++) {
      const region = regions[k] as RawRegion;
      if (region.to <= from) continue;
      regionKind ??= region.kind;
      const stop = Math.min(region.from, contentEnd);
      if (stop > cursor) kept.push([cursor, stop]);
      cursor = Math.max(cursor, region.to);
    }
    if (cursor < contentEnd) kept.push([cursor, contentEnd]);
    let keptText = '';
    for (const [a, b] of kept) keptText += source.slice(a, b);
    const raw = source.slice(from, to);
    const t = keptText.trimStart();
    lines.push({
      from,
      to,
      raw,
      kept,
      keptText,
      regionKind,
      transparent: regionKind !== null && t === '',
      blank: regionKind === null && isBlankText(raw),
      t,
      tt: t.trimEnd(),
    });
    if (nl === -1) break;
    from = nl + 1;
  }
  return lines;
}

/**
 * The title page (technical design §2.3) is the first paragraph when it is all
 * `Key: value` lines and indented continuations, and at least one key is one
 * the spec or the design recognizes. That last rule keeps `FADE IN:` from
 * reading as a title page.
 */
function readTitlePage(
  source: string,
  lines: LineInfo[],
): { titlePage: TitlePage | null; lineCount: number } {
  const none = { titlePage: null, lineCount: 0 };
  const fields: TitleField[] = [];
  let recognized = false;
  let k = 0;
  while (k < lines.length && !(lines[k] as LineInfo).blank) {
    const line = lines[k] as LineInfo;
    const current = fields[fields.length - 1];
    if (current && /^(?:\t| {3,})/.test(line.keptText)) {
      const value = line.keptText.trim();
      if (value) {
        current.value.push(value);
        current.runs.push(parseInline(source, trim(source, line.kept), true));
      }
      current.span.to = line.to;
      k++;
      continue;
    }
    const keyLine = readKeyLine(line.keptText);
    if (!keyLine) return none;
    const { key, value } = keyLine;
    if (TITLE_KEYS.has(key.toLowerCase())) recognized = true;
    const valueSegs = trim(source, dropStart(line.kept, line.keptText.indexOf(':') + 1));
    fields.push({
      key,
      value: value ? [value] : [],
      runs: value ? [parseInline(source, valueSegs, true)] : [],
      span: { from: line.from, to: line.to },
    });
    k++;
  }
  if (!recognized) return none;
  const end = (lines[k - 1] as LineInfo).to;
  return {
    titlePage: { span: { from: 0, to: end }, raw: source.slice(0, end), fields },
    lineCount: k,
  };
}

/** The `/* drafter … *\/` block (technical design §8.6): the last block, alone. */
function readMeta(ctx: Ctx, blocks: Block[], diagnostics: ParseDiagnostic[]): DrafterMeta | null {
  const last = blocks[blocks.length - 1];
  if (last?.kind !== 'boneyard') return null;
  const { source } = ctx;
  const region = ctx.regions.find((r) => r.from >= last.span.from && r.from < last.span.to);
  if (!region?.closed) return null;
  const opener = '/* drafter';
  const afterOpener = region.from + opener.length;
  const isMetaOpener =
    source.startsWith(opener, region.from) &&
    (source.startsWith('\n', afterOpener) || source.startsWith('\r\n', afterOpener));
  const alone =
    /^\s*$/.test(source.slice(last.span.from, region.from)) &&
    /^\s*$/.test(source.slice(region.to, last.span.to));
  if (!isMetaOpener || !alone) return null;
  try {
    const value: unknown = JSON.parse(source.slice(afterOpener, region.to - 2));
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as DrafterMeta;
    }
  } catch {
    // reported below
  }
  diagnostics.push({
    code: 'invalid-meta',
    severity: 'warning',
    span: { ...last.span },
    message: "The Drafter metadata block isn't a valid JSON object, so its settings are ignored.",
  });
  return null;
}

class LineNode implements Line {
  readonly span: Span;
  readonly raw: string;
  readonly transparent: boolean;
  readonly #ctx: Ctx;
  readonly #info: LineInfo;
  readonly #kind: BlockKind;
  readonly #forcedFirst: boolean;
  #inline: InlineRun[] | undefined;

  constructor(ctx: Ctx, info: LineInfo, kind: BlockKind, forcedFirst: boolean) {
    this.span = { from: info.from, to: info.to };
    this.raw = info.raw;
    this.transparent = info.transparent;
    this.#ctx = ctx;
    this.#info = info;
    this.#kind = kind;
    this.#forcedFirst = forcedFirst;
  }

  get inline(): InlineRun[] {
    this.#inline ??= parseInline(
      this.#ctx.source,
      displaySegs(this.#ctx.source, this.#info, this.#kind, this.#forcedFirst),
      EMPHASIS_KINDS.has(this.#kind),
    );
    return this.#inline;
  }
}

class BlockNode {
  readonly kind: BlockKind;
  readonly forced: boolean;
  readonly span: Span;
  readonly leading: string;
  readonly lines: readonly Line[];
  readonly #ctx: Ctx;
  readonly #infos: LineInfo[];
  #sem: BlockSem | null | undefined;

  constructor(
    ctx: Ctx,
    kind: BlockKind,
    forced: boolean,
    span: Span,
    leading: string,
    lines: Line[],
    infos: LineInfo[],
  ) {
    this.kind = kind;
    this.forced = forced;
    this.span = span;
    this.leading = leading;
    this.lines = lines;
    this.#ctx = ctx;
    this.#infos = infos;
  }

  get sem(): BlockSem | null {
    if (this.#sem === undefined) this.#sem = computeSem(this, this.#ctx, this.#infos);
    return this.#sem;
  }
}

const lineText = (line: Line) => line.inline.map((run) => run.text).join('');

function computeSem(block: BlockNode, ctx: Ctx, infos: LineInfo[]): BlockSem | null {
  const first = infos[0] as LineInfo;
  const firstText = () => lineText(block.lines[0] as Line);
  switch (block.kind) {
    case 'page_break':
      return null;
    case 'note':
    case 'boneyard': {
      const inner = regionsIn(ctx.regions, block.span).map((r) =>
        ctx.source.slice(r.from + 2, r.closed ? r.to - 2 : r.to),
      );
      return { text: inner.join('\n').trim() };
    }
    case 'section': {
      const depth = /^#*/.exec(first.tt)?.[0].length ?? 0;
      return { depth, text: firstText() };
    }
    case 'scene_heading':
      return sceneHeadingSem(firstText(), block.forced ? first.tt.slice(1) : first.tt);
    case 'character': {
      const cueText = block.forced ? first.tt.slice(1).trim() : first.tt;
      return parseCue(cueText) ?? { name: cueText, extension: null, dual: false };
    }
    default: {
      // Interior transparent lines (a note alone on its line) add no text.
      const texts = block.lines.filter((_, k) => !(infos[k] as LineInfo).transparent).map(lineText);
      return { text: texts.join('\n') };
    }
  }
}

function sceneHeadingSem(text: string, unmarked: string): SceneHeadingSem {
  const number = sceneNumber(unmarked.trimEnd())?.number ?? null;
  const prefixMatch = HEADING_PREFIX.exec(text);
  const prefix = prefixMatch ? prefixMatch[0] : null;
  const rest = prefix ? text.slice(prefix.length).trim() : text;
  const separator = Math.max(rest.lastIndexOf(' - '), rest.lastIndexOf(' – '));
  return separator === -1
    ? { text, prefix, location: rest, time: null, number }
    : {
        text,
        prefix,
        location: rest.slice(0, separator).trim(),
        time: rest.slice(separator + 3).trim(),
        number,
      };
}

// --- Display text: which source characters of a line print, by block kind ---

function displaySegs(source: string, info: LineInfo, kind: BlockKind, forcedFirst: boolean): Seg[] {
  if (info.transparent) return [];
  let segs: Seg[] = info.kept;
  switch (kind) {
    case 'note':
    case 'boneyard':
    case 'page_break':
      return [];
    case 'action':
      if (forcedFirst) segs = dropStart(trimStart(source, segs), 1);
      return trimEnd(source, segs);
    case 'dialogue':
    case 'parenthetical':
      return trim(source, segs);
    case 'character': {
      segs = trim(source, segs);
      if (forcedFirst) segs = trimStart(source, dropStart(segs, 1));
      if (info.tt.endsWith('^')) segs = trimEnd(source, dropEnd(segs, 1));
      return segs;
    }
    case 'lyric':
      return trim(source, dropStart(trim(source, segs), 1));
    case 'centered':
      return trim(source, dropEnd(dropStart(trim(source, segs), 1), 1));
    case 'transition':
      segs = trim(source, segs);
      return forcedFirst ? trim(source, dropStart(segs, 1)) : segs;
    case 'scene_heading': {
      segs = trim(source, segs);
      if (forcedFirst) segs = dropStart(segs, 1);
      const number = sceneNumber(info.tt);
      return number ? trimEnd(source, dropEnd(segs, number.length)) : segs;
    }
    case 'section': {
      const depth = /^#*/.exec(info.tt)?.[0].length ?? 0;
      return trim(source, dropStart(trim(source, segs), depth));
    }
    case 'synopsis':
      return trim(source, dropStart(trim(source, segs), 1));
  }
}

const isWhitespace = (source: string, i: number) => /\s/.test(source.charAt(i));

function trimStart(source: string, segs: Seg[]): Seg[] {
  const out = [...segs];
  while (out.length > 0) {
    const [a, b] = out[0] as Seg;
    let s = a;
    while (s < b && isWhitespace(source, s)) s++;
    if (s < b) {
      out[0] = [s, b];
      break;
    }
    out.shift();
  }
  return out;
}

function trimEnd(source: string, segs: Seg[]): Seg[] {
  const out = [...segs];
  while (out.length > 0) {
    const [a, b] = out[out.length - 1] as Seg;
    let e = b;
    while (e > a && isWhitespace(source, e - 1)) e--;
    if (e > a) {
      out[out.length - 1] = [a, e];
      break;
    }
    out.pop();
  }
  return out;
}

const trim = (source: string, segs: Seg[]) => trimEnd(source, trimStart(source, segs));

function dropStart(segs: Seg[], count: number): Seg[] {
  const out = [...segs];
  let n = count;
  while (n > 0 && out.length > 0) {
    const [a, b] = out[0] as Seg;
    if (b - a > n) {
      out[0] = [a + n, b];
      break;
    }
    n -= b - a;
    out.shift();
  }
  return out;
}

function dropEnd(segs: Seg[], count: number): Seg[] {
  const out = [...segs];
  let n = count;
  while (n > 0 && out.length > 0) {
    const [a, b] = out[out.length - 1] as Seg;
    if (b - a > n) {
      out[out.length - 1] = [a, b - n];
      break;
    }
    n -= b - a;
    out.pop();
  }
  return out;
}
