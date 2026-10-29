import { type Doc, setMeta, type TextChange } from '@drafter/fountain';
import { lookupForms } from './tokens';

// The words never flagged in a script (Phase 2 design §12, §5.5; Plan D, Call 6): every word of
// every cue's name and every scene heading's location, harvested and never saved, and the script's
// dictionary, `dictionary` in the metadata block, which travels with the file.

/** Each word of a name or a location: letters, marks, and digits, with apostrophes between them. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/**
 * Lowercased: every word of every cue's name and of every scene heading's location, and a
 * possessive's base (`ZEPHYRINE'S` gives `zephyrine's` and `zephyrine`). Never cut as a plural: a
 * name ending in s (`ODALYS`) is itself; plurals are `lookupForms`' at lookup.
 */
export function harvestedWords(doc: Doc): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => {
    for (const [word] of text.matchAll(WORD)) {
      const lower = word.toLowerCase().replaceAll('’', "'");
      out.add(lower);
      if (lower.endsWith("'s") && lower.length > 2) out.add(lower.slice(0, -2));
    }
  };
  for (const block of doc.blocks) {
    if (block.kind === 'character') add(block.sem.name);
    else if (block.kind === 'scene_heading') add(block.sem.location);
  }
  return out;
}

/** `meta.dictionary`'s strings; anything else there is ignored. */
export function scriptDictionary(doc: Doc): string[] {
  const entry = doc.meta?.dictionary;
  return Array.isArray(entry) ? entry.filter((w): w is string => typeof w === 'string') : [];
}

/**
 * A `/*` that isn't closed, or one inside a boneyard: the block setMeta writes would close it, so
 * Drafter writes nothing until the writer fixes it (as the note categories do).
 */
function hasStrayBoneyard(doc: Doc): boolean {
  return doc.regions.some(
    (region) =>
      !region.closed ||
      (region.kind === 'boneyard' &&
        doc.source.slice(region.span.from + 2, region.span.to - 2).includes('/*')),
  );
}

const collator = new Intl.Collator('en', { sensitivity: 'base' });
/** Case-insensitively, then by code unit, so the order never depends on the browser. */
const byWord = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Adds `word` to `meta.dictionary` (kept sorted case-insensitively, without duplicates) through
 * setMeta; [] when it's there already or a `/*` is stray. The block's other entries are kept.
 */
export function addToScriptDictionary(doc: Doc, word: string): TextChange[] {
  const entry = word.trim();
  if (entry === '' || hasStrayBoneyard(doc)) return [];
  const words = scriptDictionary(doc);
  const lower = entry.toLowerCase();
  if (words.some((w) => w.toLowerCase() === lower)) return [];
  const dictionary = [...words, entry].sort(byWord);
  return setMeta(doc, { ...doc.meta, dictionary });
}

/** Lowercased union. */
export function knownSet(...lists: Iterable<string>[]): Set<string> {
  const out = new Set<string>();
  for (const list of lists)
    for (const word of list) out.add(word.toLowerCase().replaceAll('’', "'"));
  return out;
}

/** Any of lookupForms(word). */
export function isKnown(word: string, known: ReadonlySet<string>): boolean {
  return lookupForms(word).some((form) => known.has(form));
}

/**
 * A hyphenated compound (a token's `compound`) is known when the whole of it is, as written
 * (`walkie-talkie`) or with its hyphens taken out (`prelap` for `pre-lap`).
 */
export function isKnownCompound(compound: string, known: ReadonlySet<string>): boolean {
  return isKnown(compound, known) || isKnown(compound.replaceAll('-', ''), known);
}
