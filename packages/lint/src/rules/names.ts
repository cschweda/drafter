import { characters, type Doc, type DrafterMeta, type Span, setMeta } from '@drafter/fountain';
import { withinOneEdit } from '../distance';
import type { Fix, LintDiagnostic, Rule } from '../types';

// similar-names (technical design §9): two character names one edit apart, one of them rare, are
// probably one character typed two ways. The rest of the rule's conditions are its controls
// against false alarms: five letters in both names (MAX and MAC are too short), one of them cued
// twice or less, and neither the start of the other (DANNY and DANNYS are a prefix apart). A
// fourth, beyond the design: names that differ only in their digits (GUARD 1 and GUARD 2) are
// numbered characters, which are meant, and a typo almost never changes only a digit. And a
// fifth: names whose one edit falls inside a short word (MR. SMITH and MRS. SMITH, JOHN JR. and
// JOHN SR., GUARD A and GUARD B) are different people, and the short word is what tells them apart.

/** The letters a name needs to be compared. A shorter name is one edit from too many others. */
const MIN_LETTERS = 5;

/** A name is the typo only if it is cued this many times or fewer. */
const RARE = 2;

/**
 * The longest name, in code points, that is compared. Longer ones are descriptions, not names,
 * and the index below holds a key for each code point of a name, each nearly as long as the
 * name: with no limit, one cue of a hundred thousand letters would need a hundred thousand keys
 * of that length.
 */
const MAX_LENGTH = 32;

/**
 * The most names that may share one key. Names that differ in one place only (SOLDIER A,
 * SOLDIER B, and so on up to SOLDIER I) are a series the writer meant, not typos of one name, and
 * with no limit a file of twenty thousand of them would have two hundred million pairs to report.
 */
const MAX_SHARING = 8;

/** A word of this many letters or fewer is short: MR, MRS, JR, SR, and a letter such as A or B. */
const SHORT_WORD = 3;

const LETTER = /\p{L}/u;
const SPACE = /\s/u;

/** A decimal digit of any script, not only 0 to 9: `\d` would miss the Arabic-Indic ones. */
const DIGIT = /\p{Nd}/gu;

/** A name with its digits left out: GUARD 1 and GUARD 22 are both "GUARD ". */
const withoutDigits = (key: string) => key.replace(DIGIT, '');

/** A name as the layout compares names, and as this rule does: ignoring case. */
const nameKey = (name: string) => name.trim().toUpperCase();

interface Name {
  /** The name in upper case. Names that are the same in upper case are one name. */
  key: string;
  /** Its cues, however its letters were cased. */
  count: number;
  /** Its place among the names, by where each first appears in the script. */
  order: number;
}

/** A pair of names that are probably one name, the rare one and the one it is a typo of. */
interface Hit {
  rare: Name;
  other: Name;
}

/** Every name cued in the script, once each, in order of first appearance. */
function census(doc: Doc): Name[] {
  const byKey = new Map<string, Name>();
  for (const { name, count } of characters(doc)) {
    const key = nameKey(name);
    const known = byKey.get(key);
    if (known) known.count += count;
    else byKey.set(key, { key, count, order: byKey.size });
  }
  return [...byKey.values()];
}

/** Whether a name has the letters to be compared, and is short enough to be a name. */
function isComparable(key: string): boolean {
  let length = 0;
  let letters = 0;
  for (const point of key) {
    if (++length > MAX_LENGTH) return false;
    if (LETTER.test(point)) letters++;
  }
  return letters >= MIN_LETTERS;
}

/**
 * The names that share each key, as indexes into `names`, in order. A name's keys are the name
 * itself and the name with any one code point left out. Two names one edit apart always share a
 * key, so these are all the pairs worth checking:
 * - one letter differs: leaving that letter out of each gives the same text;
 * - two neighbours are swapped: leaving out the first of them from one name, or the second from
 *   the other, gives the same text;
 * - a letter is missing from one: leaving it out of the other gives the first name.
 * Names that share a key may still be farther apart (ABC and BCA share BC), so each pair is
 * checked.
 */
function sharedKeys(names: readonly Name[]): Map<string, number[]> {
  const shared = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    const sharing = shared.get(key);
    if (!sharing) shared.set(key, [index]);
    // A name is added to each of its keys in turn, so it is the last in the list if it is there.
    else if (sharing.at(-1) !== index) sharing.push(index);
  };
  for (const [index, { key }] of names.entries()) {
    add(key, index);
    let at = 0;
    for (const point of key) {
      add(key.slice(0, at) + key.slice(at + point.length), index);
      at += point.length;
    }
  }
  return shared;
}

/** Two names in upper case, in a fixed order, as one string: the same for either order. */
function pairKey(a: string, b: string): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

/**
 * The pairs of names listed in the metadata's `distinctNames`, as `pairKey`s. It is read with
 * care, because the file's author can type anything there: whatever isn't a list is ignored, and
 * so is each item in it that isn't a pair of strings.
 */
function markedDistinct(meta: DrafterMeta | null): Set<string> {
  const marked = new Set<string>();
  const list: unknown = meta?.distinctNames;
  if (!Array.isArray(list)) return marked;
  for (const item of list as unknown[]) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [a, b] = item as unknown[];
    if (typeof a === 'string' && typeof b === 'string') marked.add(pairKey(nameKey(a), nameKey(b)));
  }
  return marked;
}

/**
 * Whether any of the words that overlap `[from, to)` in `points` is short. A word is a run of
 * code points without whitespace, and its length is counted in letters, so `JR.` has two.
 */
function touchesShortWord(points: readonly string[], from: number, to: number): boolean {
  if (from >= to) return false;
  let start = 0;
  while (start < points.length) {
    if (SPACE.test(points[start] as string)) {
      start++;
      continue;
    }
    let end = start;
    let letters = 0;
    while (end < points.length && !SPACE.test(points[end] as string)) {
      if (LETTER.test(points[end] as string)) letters++;
      end++;
    }
    if (start < to && end > from && letters <= SHORT_WORD) return true;
    start = end;
  }
  return false;
}

/**
 * Whether the one edit between two names falls inside a short word of either. The edit is what
 * lies between the text the names start with in common and the text they end with in common, and
 * the longer name always has something there. A space put in or taken out lies in no word, so
 * `AGENT 47` and `AGENT47` are not spared.
 */
function editIsInShortWord(a: string, b: string): boolean {
  const x = Array.from(a);
  const y = Array.from(b);
  let prefix = 0;
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < x.length - prefix &&
    suffix < y.length - prefix &&
    x[x.length - 1 - suffix] === y[y.length - 1 - suffix]
  ) {
    suffix++;
  }
  return (
    touchesShortWord(x, prefix, x.length - suffix) || touchesShortWord(y, prefix, y.length - suffix)
  );
}

/** Whether one name is the start of the other, by code point. */
function startsTheOther(a: string, b: string): boolean {
  const x = Array.from(a);
  const y = Array.from(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((point, i) => point === long[i]);
}

/** The pair as a finding, if it is one. */
function judge(a: Name, b: Name, distinct: ReadonlySet<string>): Hit | null {
  if (Math.min(a.count, b.count) > RARE) return null;
  if (!withinOneEdit(a.key, b.key) || startsTheOther(a.key, b.key)) return null;
  // Names that are the same once their digits are left out are numbered characters. A
  // difference in anything else is still a typo: the space in AGENT 47 beside AGENT47.
  if (withoutDigits(a.key) === withoutDigits(b.key)) return null;
  if (editIsInShortWord(a.key, b.key)) return null;
  if (distinct.has(pairKey(a.key, b.key))) return null;
  // The typo is the rarer name. With a tie, it is the one that first appears later.
  const aIsRarer = a.count !== b.count ? a.count < b.count : a.order > b.order;
  return aIsRarer ? { rare: a, other: b } : { rare: b, other: a };
}

/** Every pair of the names that is a finding, by rare name and then by the other, each once. */
function similarPairs(names: readonly Name[], distinct: ReadonlySet<string>): Hit[] {
  const hits: Hit[] = [];
  // Two names can share more than one key (swapped neighbours share two), but are judged once.
  const judged = new Set<number>();
  for (const sharing of sharedKeys(names).values()) {
    if (sharing.length < 2 || sharing.length > MAX_SHARING) continue;
    for (let i = 0; i < sharing.length; i++) {
      for (let j = i + 1; j < sharing.length; j++) {
        const first = sharing[i] as number;
        const second = sharing[j] as number;
        const pair = first * names.length + second;
        if (judged.has(pair)) continue;
        judged.add(pair);
        const hit = judge(names[first] as Name, names[second] as Name, distinct);
        if (hit) hits.push(hit);
      }
    }
  }
  return hits.sort((a, b) => a.rare.order - b.rare.order || a.other.order - b.other.order);
}

/** The cue line where each of the names, by key, first appears. */
function firstCues(doc: Doc, wanted: ReadonlySet<string>): Map<string, Span> {
  const found = new Map<string, Span>();
  for (const block of doc.blocks) {
    if (block.kind !== 'character') continue;
    const key = nameKey(block.sem.name);
    if (!wanted.has(key) || found.has(key)) continue;
    found.set(key, { ...(block.lines[0] ?? block).span });
    if (found.size === wanted.size) break;
  }
  return found;
}

/**
 * The fix that adds the pair to `meta.distinctNames`, rare name first as the message names them.
 * The pairs already listed stay, whatever else is there: only a value that isn't a list is
 * replaced, since there is nothing in it to keep.
 */
function markDistinct(doc: Doc, rare: string, other: string): Fix {
  const listed: unknown = doc.meta?.distinctNames;
  const distinctNames: unknown[] = Array.isArray(listed) ? [...(listed as unknown[])] : [];
  distinctNames.push([rare, other]);
  return {
    title: 'Mark as distinct',
    changes: setMeta(doc, { ...doc.meta, distinctNames }),
  };
}

export const similarNames: Rule = {
  id: 'similar-names',
  severity: 'info',
  run: ({ doc }) => {
    const names = census(doc).filter((name) => isComparable(name.key));
    if (names.length < 2) return [];
    const hits = similarPairs(names, markedDistinct(doc.meta));
    if (hits.length === 0) return [];
    const where = firstCues(doc, new Set(hits.map((hit) => hit.rare.key)));
    return hits.map(
      ({ rare, other }): LintDiagnostic => ({
        ruleId: similarNames.id,
        severity: similarNames.severity,
        // Every name is cued somewhere, and each diagnostic gets a span of its own.
        span: { ...(where.get(rare.key) as Span) },
        message: `"${rare.key}" is one letter from "${other.key}", which has ${other.count} ${other.count === 1 ? 'cue' : 'cues'}. A typo?`,
        fix: markDistinct(doc, rare.key, other.key),
      }),
    );
  },
};
