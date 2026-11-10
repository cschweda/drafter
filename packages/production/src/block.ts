import type { DrafterMeta } from '@drafter/fountain';
import type { LockedPage, Production, ProductionSet } from './types';

/**
 * The most a block may hold. A file can come from anywhere, so a block past any of these is
 * ignored whole, rather than trusted or trimmed to something that no longer matches.
 */
export const CAPS = {
  sets: 64,
  pages: 5000,
  numbers: 5000,
  /** Each set's `lines` and each set's `gaps`. */
  lines: 20000,
  /** The baseline text once decoded; the decoder (Task 2) enforces it as it inflates. */
  baselineBytes: 8 * 1024 * 1024,
  /**
   * The baseline as stored (gzip, then base64): the decoded cap plus a small header's room,
   * times 4/3. A longer string is refused here, before any decoder is handed it.
   */
  baselineChars: Math.ceil(((8 * 1024 * 1024 + 1024) * 4) / 3),
} as const;

const KEY = 'production';

/** The longest revision header a block keeps, in characters. */
export const MAX_HEADER = 120;

/** Characters a header never holds: controls, invisible format marks (bidi overrides), line breaks. */
const NOT_IN_HEADER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * A revision header as a block keeps it: trimmed, 1 to `MAX_HEADER` characters, with none of
 * `NOT_IN_HEADER`; else undefined. It prints on every revised page, and in an HTML file's pages
 * (escaped there), so a header that isn't plain text is never trusted.
 */
export function headerOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const header = v.trim();
  if (header === '' || [...header].length > MAX_HEADER || NOT_IN_HEADER.test(header)) {
    return undefined;
  }
  return header;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown, cap: number): v is string[] =>
  Array.isArray(v) && v.length <= cap && v.every((s) => typeof s === 'string');

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * A stored page label: a page number, perhaps with letters (`12`, `12A`). A-pages and ranges are
 * computed, never stored. Anything else (markup, a script) makes the block unreadable, since a
 * label prints in every paged export.
 */
const LABEL = /^[0-9A-Z]{1,12}$/;
/** A set's name ("Blue", "Double Pink"): letters, digits, spaces, and a little punctuation. */
const SET_NAME = /^[\p{L}\p{N} .'’-]{1,40}$/u;

function readPage(v: unknown): LockedPage | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [label, line, printed] = v;
  if (typeof label !== 'string' || !LABEL.test(label)) return null;
  if (!isCount(line) || !isCount(printed)) return null;
  return { label, line, printed };
}

function readSet(v: unknown): ProductionSet | null {
  if (!isObject(v)) return null;
  const { name, color, date, draft, lines, gaps } = v;
  if (typeof name !== 'string' || !SET_NAME.test(name) || typeof color !== 'string') return null;
  if (typeof date !== 'string' || typeof draft !== 'string') return null;
  const set: ProductionSet = { name, color, date, draft };
  if (lines !== undefined) {
    if (!isStringArray(lines, CAPS.lines)) return null;
    set.lines = lines;
  }
  if (gaps !== undefined) {
    if (!isStringArray(gaps, CAPS.lines)) return null;
    set.gaps = gaps;
  }
  return set;
}

/**
 * The production block of a script's meta, or `null` when there isn't one or any part of it is
 * wrong. It never throws: a hostile or truncated block leaves the script open and unlocked.
 */
export function readProduction(meta: DrafterMeta | null): Production | null {
  const raw = meta?.[KEY];
  if (!isObject(raw)) return null;
  const { lockedAt, firstScene, numbers, pages, sets, baseline, header } = raw;
  if (typeof lockedAt !== 'string' || typeof baseline !== 'string' || baseline === '') return null;
  if (baseline.length > CAPS.baselineChars) return null;
  if (typeof firstScene !== 'number' || !Number.isInteger(firstScene)) return null;
  if (!isStringArray(numbers, CAPS.numbers)) return null;
  if (!Array.isArray(pages) || pages.length > CAPS.pages) return null;
  if (!Array.isArray(sets) || sets.length > CAPS.sets) return null;
  const readPages: LockedPage[] = [];
  for (const p of pages) {
    const page = readPage(p);
    if (!page) return null;
    // A lock writes pages in order, and a rebase keeps a folded page on the line it folded into,
    // so a page's line never runs back: one that does is a hand-made or damaged map.
    const previous = readPages.at(-1);
    if (previous && page.line < previous.line) return null;
    readPages.push(page);
  }
  const readSets: ProductionSet[] = [];
  for (const s of sets) {
    const set = readSet(s);
    if (!set) return null;
    readSets.push(set);
  }
  const production: Production = {
    lockedAt,
    firstScene,
    numbers,
    pages: readPages,
    sets: readSets,
    baseline,
  };
  // A header that is wrong is ignored on its own: the lock and the marks still stand.
  const readHeader = headerOf(header);
  if (readHeader !== undefined) production.header = readHeader;
  return production;
}

/**
 * The meta to give `setMeta`: the other keys untouched, the production block set (pages written
 * back as `[label, line, printed]` tuples, which are short on one line), or removed for `null`.
 */
export function productionMeta(
  meta: DrafterMeta | null,
  production: Production | null,
): DrafterMeta {
  const next: DrafterMeta = { ...meta };
  if (production === null) {
    delete next[KEY];
    return next;
  }
  next[KEY] = { ...production, pages: production.pages.map((p) => [p.label, p.line, p.printed]) };
  return next;
}
