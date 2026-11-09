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
} as const;

const KEY = 'production';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown, cap: number): v is string[] =>
  Array.isArray(v) && v.length <= cap && v.every((s) => typeof s === 'string');

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function readPage(v: unknown): LockedPage | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [label, line, printed] = v;
  if (typeof label !== 'string' || !isCount(line) || !isCount(printed)) return null;
  return { label, line, printed };
}

function readSet(v: unknown): ProductionSet | null {
  if (!isObject(v)) return null;
  const { name, color, date, draft, lines, gaps } = v;
  if (typeof name !== 'string' || typeof color !== 'string') return null;
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
  const { lockedAt, firstScene, numbers, pages, sets, baseline } = raw;
  if (typeof lockedAt !== 'string' || typeof baseline !== 'string' || baseline === '') return null;
  if (typeof firstScene !== 'number' || !Number.isInteger(firstScene)) return null;
  if (!isStringArray(numbers, CAPS.numbers)) return null;
  if (!Array.isArray(pages) || pages.length > CAPS.pages) return null;
  if (!Array.isArray(sets) || sets.length > CAPS.sets) return null;
  const readPages: LockedPage[] = [];
  for (const p of pages) {
    const page = readPage(p);
    if (!page) return null;
    readPages.push(page);
  }
  const readSets: ProductionSet[] = [];
  for (const s of sets) {
    const set = readSet(s);
    if (!set) return null;
    readSets.push(set);
  }
  return { lockedAt, firstScene, numbers, pages: readPages, sets: readSets, baseline };
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
