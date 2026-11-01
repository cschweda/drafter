// A frozen draft as a plain file beside the work (drafts and cuts design §4): the text exactly as
// it was in the editor, one blank line, and the draft's facts in Drafter's metadata block, the
// trailing `/* drafter … */` boneyard for a script or `<!-- drafter … -->` for a Markdown document.
// Taking the block and that one blank line off gives the text back, byte for byte, so its SHA-256
// is the draft's ID.
//
// A text that already ends with its own metadata block (a script's template choice, say) has the
// draft's facts merged into that block, so other apps and Drafter still read one block with every
// key. The block as it was is kept, whole, in the merged block's `ownBlock`, and reading the file
// puts it back, so the ID is of the text before merging. A block that already holds a draft's
// facts (a draft file reopened and frozen again) isn't merged, or it would nest, doubling each
// time: a fresh block goes after it with the writer's own keys and the new facts.

import { type Doc, parse, setMeta } from '@drafter/fountain';
import { appendMarkdownMeta, findMarkdownMeta, setMarkdownMeta } from '@drafter/markdown';
import { isCanonicalIso, isoInstant } from './iso';

/** A frozen draft's facts. */
export interface DraftFacts {
  /** Its number: 1, 2, 3… */
  draft: number;
  /** The SHA-256 of its text, 64 lower-case hex characters. */
  id: string;
  /** When it was frozen, an ISO date (`toISOString()`). */
  frozen: string;
  /** The writer's note, one line, maybe empty. */
  note: string;
  /** For a draft made by restoring an older one: the draft it came from. */
  from?: { draft: number; id: string };
}

/** What kind of work a draft is of: a script (Fountain) or a Markdown document. */
export type WorkKind = 'fountain' | 'markdown';

/** The key, in a merged block, that keeps the text's own block as it was. */
const OWN_BLOCK = 'ownBlock';
const FOUNTAIN_OPENER = '/* drafter';
const FOUNTAIN_CLOSER = '*/';

const ID = /^[0-9a-f]{64}$/;
const LINE_BREAK = /[\r\n\u2028\u2029]/;

const isDraftNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 1;
const isId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);
/** The longest work name in a file name, in UTF-16 units, before " – Draft NN.fountain". */
export const MAX_WORK_NAME = 120;

/**
 * The work's name made safe for a file or folder name on any system: every \ / : * ? " < > | and
 * control character becomes `_`, leading dots and spaces and trailing dots and spaces go, and it
 * is cut to `MAX_WORK_NAME` units without splitting a character. A name with `..` in it, or with
 * nothing left, is refused with a RangeError.
 */
export function cleanWorkName(work: string): string {
  if (work.includes('..')) throw new RangeError('A work\u2019s name can\u2019t hold "..".');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  let name = work.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_');
  name = name.replace(/^[. ]+/, '');
  if (name.length > MAX_WORK_NAME) {
    const high = name.charCodeAt(MAX_WORK_NAME - 1);
    name = name.slice(0, high >= 0xd800 && high <= 0xdbff ? MAX_WORK_NAME - 1 : MAX_WORK_NAME);
  }
  let end = name.length;
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end--;
  name = name.slice(0, end);
  if (name === '') throw new RangeError('A work\u2019s name has nothing a file name can hold.');
  return name;
}

/**
 * The draft's file name: `Boca – Draft 01.fountain`, two digits, three past 99, the work's name
 * cleaned by `cleanWorkName`.
 */
export function draftFileName(work: string, n: number, kind: WorkKind): string {
  if (!isDraftNumber(n)) throw new RangeError(`Not a draft number: ${n}`);
  const ext = kind === 'fountain' ? 'fountain' : 'md';
  return `${cleanWorkName(work)} – Draft ${String(n).padStart(2, '0')}.${ext}`;
}

/** What is wrong with these facts, or null when nothing is. */
function factsProblem(value: unknown, writing: boolean): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'The draft facts aren’t a set of named values.';
  }
  const v = value as Record<string, unknown>;
  if (!isDraftNumber(v.draft)) return 'The draft number isn’t a whole number from 1 up.';
  if (!isId(v.id)) return 'The draft ID isn’t 64 lower-case hex characters.';
  if (writing ? !isCanonicalIso(v.frozen) : isoInstant(v.frozen) === null)
    return 'The date the draft was frozen isn’t a date.';
  if (typeof v.note !== 'string' || LINE_BREAK.test(v.note)) {
    return 'The draft’s note isn’t one line of text.';
  }
  if (v.from !== undefined) {
    const from = v.from as Record<string, unknown> | null;
    if (from === null || typeof from !== 'object' || !isDraftNumber(from.draft) || !isId(from.id)) {
      return 'The draft this one came from isn’t a draft number and ID.';
    }
  }
  return null;
}

/** Just the facts, in their own order, without the block's other keys. */
function factsOf(value: DraftFacts | Record<string, unknown>): DraftFacts {
  const v = value as Record<string, unknown>;
  const facts: DraftFacts = {
    draft: v.draft as number,
    id: v.id as string,
    frozen: isoInstant(v.frozen) ?? (v.frozen as string),
    note: v.note as string,
  };
  if (v.from !== undefined) {
    const from = v.from as { draft: number; id: string };
    facts.from = { draft: from.draft, id: from.id };
  }
  return facts;
}

/**
 * A block's keys without any draft facts already in it (a draft file reopened and frozen again):
 * the new facts replace them whole, so an old `from` can't outlive its draft.
 */
function withoutFacts(meta: Record<string, unknown>): Record<string, unknown> {
  const { draft: _d, id: _i, frozen: _f, note: _n, from: _from, [OWN_BLOCK]: _o, ...rest } = meta;
  return rest;
}

/** The text's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
function lineBreakOf(text: string): string {
  const at = text.indexOf('\n');
  return at > 0 && text[at - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * Where the text's own metadata block is, as `setMeta` finds it: the `/* drafter … *\/` boneyard
 * that `parse` read as `doc.meta`, the last block and alone in it.
 */
function ownBlockSpan(doc: Doc): { from: number; to: number } | null {
  if (doc.meta === null) return null;
  const last = doc.blocks[doc.blocks.length - 1];
  if (last?.kind !== 'boneyard') return null;
  const region = doc.regions.find(
    (r) =>
      r.span.from >= last.span.from &&
      r.span.from < last.span.to &&
      r.closed &&
      doc.source.startsWith(FOUNTAIN_OPENER, r.span.from),
  );
  return region ? region.span : null;
}

/** Whether a block already holds a draft's facts: the text is a draft file, reopened. */
function holdsFacts(meta: Record<string, unknown>): boolean {
  return 'draft' in meta || 'id' in meta || OWN_BLOCK in meta;
}

function fountainDraft(text: string, facts: DraftFacts): string {
  const doc = parse(text);
  const span = ownBlockSpan(doc);
  const own = (doc.meta ?? {}) as Record<string, unknown>;
  if (span && !holdsFacts(own)) {
    const block = text.slice(span.from, span.to);
    const [change] = setMeta(doc, { ...own, ...factsOf(facts), [OWN_BLOCK]: block });
    if (change && change.from === span.from && change.to === span.to) {
      return text.slice(0, change.from) + change.insert + text.slice(change.to);
    }
  }
  // No block of its own, or one that already holds a draft's facts (a draft file reopened, whose
  // block nested again would double each time): the text, one blank line, a fresh block with the
  // text's own keys and these facts, a line break. Every `/` in the JSON is written `\/`, as
  // `setMeta` does, so nothing in it can close the block.
  const nl = lineBreakOf(text);
  const keys = span ? withoutFacts(own) : {};
  const json = JSON.stringify({ v: 1, ...keys, ...factsOf(facts) }).replaceAll('/', '\\/');
  return `${text}${nl}${nl}${FOUNTAIN_OPENER}${nl}${json}${nl}${FOUNTAIN_CLOSER}${nl}`;
}

function markdownDraft(text: string, facts: DraftFacts): string {
  const own = findMarkdownMeta(text);
  if (!own) return appendMarkdownMeta(text, { ...factsOf(facts) });
  if (holdsFacts(own.meta)) {
    return appendMarkdownMeta(text, { ...withoutFacts(own.meta), ...factsOf(facts) });
  }
  return setMarkdownMeta(text, {
    ...own.meta,
    ...factsOf(facts),
    [OWN_BLOCK]: text.slice(own.from, own.to),
  });
}

/**
 * The draft's file: the text, one blank line, and the facts in the metadata block (merged into
 * the text's own block if it ends with one). Facts that couldn't be read back are refused with a
 * TypeError: a draft file is never written that Drafter would call damaged.
 */
export function draftFile(text: string, facts: DraftFacts, kind: WorkKind): string {
  const problem = factsProblem(facts, true);
  if (problem) throw new TypeError(problem);
  return kind === 'fountain' ? fountainDraft(text, facts) : markdownDraft(text, facts);
}

type Read = { text: string; facts: DraftFacts } | { text: string; facts: null; problem: string };

/** The parsed block, its place, and the line break it was written with. */
interface Found {
  from: number;
  to: number;
  meta: Record<string, unknown>;
  nl: string;
}

/**
 * The trailing `/* drafter … *\/` block, found without parsing the script: the last opener not
 * after a backslash (the block's JSON has every `/` written `\/`), the first `*\/` after it, and only
 * spaces and line breaks after that. Linear.
 */
function findFountainBlock(file: string): Found | string {
  // In the JSON, a `/` is `\/`: an opener with a backslash before it is inside a value.
  let from = file.lastIndexOf(FOUNTAIN_OPENER);
  while (from > 0 && file.charCodeAt(from - 1) === 92) {
    from = file.lastIndexOf(FOUNTAIN_OPENER, from - 1);
  }
  if (from < 0) return 'There’s no Drafter metadata block at the end of the file.';
  const afterOpener = from + FOUNTAIN_OPENER.length;
  const nl = file.startsWith('\r\n', afterOpener)
    ? '\r\n'
    : file.startsWith('\n', afterOpener)
      ? '\n'
      : null;
  if (nl === null) return 'There’s no Drafter metadata block at the end of the file.';
  const close = file.indexOf(FOUNTAIN_CLOSER, afterOpener);
  if (close < 0) return 'The Drafter metadata block at the end of the file isn’t closed.';
  const to = close + FOUNTAIN_CLOSER.length;
  if (/\S/.test(file.slice(to))) {
    return 'The Drafter metadata block isn’t the last thing in the file.';
  }
  let meta: unknown;
  try {
    meta = JSON.parse(file.slice(afterOpener, close));
  } catch {
    return 'The Drafter metadata block can’t be read.';
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return 'The Drafter metadata block can’t be read.';
  }
  return { from, to, meta: meta as Record<string, unknown>, nl };
}

function findMarkdownBlock(file: string): Found | string {
  const block = findMarkdownMeta(file);
  if (!block) return 'There’s no Drafter metadata comment at the end of the file.';
  const nl = file.startsWith('\r\n', block.to)
    ? '\r\n'
    : file.startsWith('\n', block.to)
      ? '\n'
      : file.slice(0, block.from).endsWith('\r\n\r\n')
        ? '\r\n'
        : '\n';
  return { ...block, nl };
}

/**
 * A draft file's text and facts. The text is the file without the block and the one blank line
 * before it (or, for a merged block, with the text's own block put back), so hashing it checks the
 * ID. A file with no block, or a block whose facts don't read strictly (a number, 64 hex
 * characters, an ISO date, a one-line note), is a problem, never a throw: `facts` is null, and
 * `text` is the whole file, so nothing in it is lost.
 */
export function readDraftFile(file: string, kind: WorkKind): Read {
  const found = kind === 'fountain' ? findFountainBlock(file) : findMarkdownBlock(file);
  if (typeof found === 'string') return { text: file, facts: null, problem: found };
  const { meta } = found;
  const problem = factsProblem(meta, false);
  if (problem) return { text: file, facts: null, problem };
  const own = meta[OWN_BLOCK];
  if (own !== undefined) {
    if (typeof own !== 'string') {
      return { text: file, facts: null, problem: 'The script’s own block can’t be read.' };
    }
    return { text: file.slice(0, found.from) + own + file.slice(found.to), facts: factsOf(meta) };
  }
  const before = file.slice(0, found.from);
  const gap = found.nl + found.nl;
  return {
    text: before.endsWith(gap) ? before.slice(0, -gap.length) : before,
    facts: factsOf(meta),
  };
}
