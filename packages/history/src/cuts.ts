import { diffLines, MAX_TOKENS, markdownAnchors, splitLines } from '@drafter/compare';
import { wordsIn } from '@drafter/markdown';
import { CANDIDATES_MAX, Candidates } from './candidates';
import { cutText } from './cuts-file';
import type { WorkKind } from './draft-file';
import { hash32, hash53 } from './hash';
import { coveredBy } from './match';
import { headingKey, type ScenePrint, scenePrints, sketchOf } from './print';

// Finding what left a text (drafts-and-cuts design §3.1): the scenes of a script, and the
// chapters, sections and passages of a Markdown document, that were in `before` and are not in
// `after`. Moved text is never a cut, nor is text lightly edited.

/** A piece of `before` that is not in `after`. */
export interface FoundCut {
  /** The scene, chapter or section heading; for a passage, its first 8 words and "…". */
  title: string;
  /** Exactly as it was in `before`, from its first word to its last. */
  text: string;
  /** The headings either side of it, as they are in `after`; null at the start or the end. */
  where: { after: string | null; before: string | null };
}

/** The fewest words a passage removed without its heading has to have to be a cut. */
export const CUT_MIN_WORDS = 50;

/**
 * A replaced passage is a cut when it shares under this share of its word pairs with what
 * replaced it (Call: "shares under half its word pairs"), so a light rewrite is not one.
 */
export const CUT_KEEP_SHARE = 0.5;

/** The pieces of `before` that left it in `after`, in the order they stood in `before`. */
export function findCuts(before: string, after: string, kind: WorkKind): FoundCut[] {
  return kind === 'fountain' ? sceneCuts(before, after) : markdownCuts(before, after);
}

// Scripts.

/**
 * Every scene of `before` no scene of `after` covers, judged exactly as Deleted scenes judges
 * (`coveredBy`, looked for among only the scenes that could match). The same text twice is one
 * cut. Its neighbours are the nearest scenes either side that are still there, by their heading now.
 */
function sceneCuts(before: string, after: string): FoundCut[] {
  const was = scenePrints(before);
  const now = scenePrints(after);
  const wasPrints = new Map(was.prints.map((p) => [p.hash, p]));
  const candidates = new Candidates<ScenePrint>();
  for (const p of now.prints) candidates.add(p, p);
  const coverOf = new Map<string, ScenePrint | null>();
  const scale = now.prints.length / Math.max(1, was.slots.length);
  const cover = (print: ScenePrint, near: number): ScenePrint | null => {
    let found = coverOf.get(print.hash);
    if (found === undefined) {
      found = null;
      for (const p of candidates.of(print, near)) {
        if (coveredBy(print, p)) {
          found = p;
          break;
        }
      }
      coverOf.set(print.hash, found);
    }
    return found;
  };
  const covers = was.slots.map((slot, i) =>
    cover(wasPrints.get(slot.hash) as ScenePrint, i * scale),
  );
  const names = covers.map((p) => p?.heading ?? null);
  const { prev, next } = neighbours(names);
  const out: FoundCut[] = [];
  const seen = new Set<string>();
  const nowLines = new Set(splitLines(after).lines.filter((line) => HAS_WORD.test(line)));
  was.slots.forEach((slot, i) => {
    if (covers[i] !== null) return;
    const text = cutText(before.slice(slot.from, slot.to));
    // Every line of it is still in the text, elsewhere: nothing of it left.
    if (splitLines(text).lines.every((line) => !HAS_WORD.test(line) || nowLines.has(line))) return;
    if (seen.has(text)) return;
    seen.add(text);
    const heading = (wasPrints.get(slot.hash) as ScenePrint).heading.trim();
    out.push({
      title: heading || firstWords(text),
      text,
      where: { after: prev[i] ?? null, before: next[i] ?? null },
    });
  });
  return out;
}

/** For each item, the nearest name before it and after it that isn't null. */
function neighbours(names: readonly (string | null)[]): {
  prev: (string | null)[];
  next: (string | null)[];
} {
  const prev: (string | null)[] = [];
  const next: (string | null)[] = new Array(names.length).fill(null);
  let last: string | null = null;
  for (const name of names) {
    prev.push(last);
    if (name !== null) last = name;
  }
  last = null;
  for (let i = names.length - 1; i >= 0; i--) {
    next[i] = last;
    const name = names[i] as string | null;
    if (name !== null) last = name;
  }
  return { prev, next };
}

// Markdown documents.

/** Words as `@drafter/compare`'s `lineSimilarity` counts them. */
const WORD = /[\p{L}\p{N}'’]+/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;
const LEVEL = /^ {0,3}(#{1,3})/;
/** A word-level diff's tokens, as `diffWords` makes them. */
const TOKEN = /[\p{L}\p{N}'’]+|\s+|./gsu;
/** The key of the opening (the text before the first heading), which no heading folds to. */
const OPENING = '\u0000';
/** How many units under the same heading a unit is compared with, nearest first. */
const SAME_HEADING_LOOK = 32;

/** One part of a Markdown text: the opening, or a heading of level 1 to 3 and what follows it. */
interface Unit {
  /** 0 for the opening. */
  level: number;
  title: string;
  key: string;
  /** Its lines, `[first, end)`. */
  first: number;
  end: number;
  /** Its text in the document, without the blank lines after it. */
  from: number;
  to: number;
  /** The words under its heading, as `lineSimilarity` reads them. */
  words: string[];
  print: ScenePrint;
  /** The words under its heading counted, and its word pairs, made when first needed. */
  counts?: Map<string, number>;
  pairs?: number[];
  pairSet?: Set<number>;
}

interface Parsed {
  text: string;
  lines: string[];
  starts: number[];
  units: Unit[];
}

function parseMarkdown(text: string): Parsed {
  const { lines, starts } = splitLines(text);
  const anchors = markdownAnchors(text);
  const lineEnd = (end: number) => (end < lines.length ? (starts[end] as number) : text.length);
  const unit = (first: number, end: number, level: number, title: string): Unit => {
    const from = starts[first] as number;
    const raw = text.slice(from, lineEnd(end));
    const to = from + raw.trimEnd().length;
    const bodyFrom = level === 0 ? from : Math.min(lineEnd(first + 1), to);
    const body = text.slice(bodyFrom, to);
    const words = body.match(WORD) ?? [];
    const key = level === 0 ? OPENING : headingKey(title);
    return {
      level,
      title,
      key,
      first,
      end,
      from,
      to,
      words,
      print: {
        hash: hash53(`${level}\n${text.slice(from, to).replace(/\r\n?/g, '\n')}`),
        headingKey: key,
        heading: title,
        ...sketchOf(words.map((w) => w.toLowerCase())),
        words: words.length,
        preview: '',
      },
    };
  };
  const units: Unit[] = [unit(0, anchors[0]?.line ?? lines.length, 0, '')];
  anchors.forEach((a, k) => {
    const level = (LEVEL.exec(lines[a.line] as string)?.[1] ?? '#').length;
    units.push(unit(a.line, anchors[k + 1]?.line ?? lines.length, level, a.title));
  });
  return { text, lines, starts, units };
}

function countsOf(unit: Unit): Map<string, number> {
  if (!unit.counts) {
    unit.counts = new Map();
    for (const w of unit.words) unit.counts.set(w, (unit.counts.get(w) ?? 0) + 1);
  }
  return unit.counts;
}

/** How many of `a`'s words are in `b`, a repeated word as often as both have it. */
function shared(a: Unit, b: Unit): number {
  const counts = countsOf(b);
  const used = new Map<string, number>();
  let n = 0;
  for (const w of a.words) {
    const u = used.get(w) ?? 0;
    if (u < (counts.get(w) ?? 0)) {
      n++;
      used.set(w, u + 1);
    }
  }
  return n;
}

/**
 * How well the unit `now` holds the earlier unit `was` (which has words), or null when it
 * doesn't: under the same heading, a body alike by `lineSimilarity` (Dice) at 0.5 or more, half
 * of `was`'s words in it (it grew), or, for a body of 8 words or more, three quarters of its word
 * pairs in `was` (it was cut down: the passages that left are found apart); under any heading,
 * alike at 0.75 or more, or, for a body of 8 words or more, three quarters of `was`'s words in it
 * (merged into another, or the half of a split moved under a new heading).
 */
function holds(was: Unit, now: Unit): Held | null {
  const a = was.words.length;
  const b = now.words.length;
  if (b === 0) return null;
  const same = was.key === now.key;
  const most = Math.min(a, b);
  // Neither rule can pass, whatever the words: skip counting them.
  const diceMax = (2 * most) / (a + b);
  const containMax = most / a;
  const possible = same
    ? diceMax >= 0.5 || containMax >= 0.5 || b >= 8
    : diceMax >= 0.75 || (a >= 8 && containMax >= 0.75);
  if (!possible) return null;
  const n = shared(was, now);
  const dice = (2 * n) / (a + b);
  const contain = n / a;
  if (same && (dice >= 0.5 || contain >= 0.5)) return { score: 2 + dice, sure: dice >= 0.5 };
  if (same && b >= 8 && pairShare(now, was) >= 0.75) return { score: 1 + dice, sure: false };
  if (dice >= 0.75 || (a >= 8 && contain >= 0.75)) return { score: dice, sure: dice >= 0.5 };
  return null;
}

/**
 * How a unit is held: `score` ranks the units that hold it; `sure` is false when the rule that
 * matched lets most of its words go (it grew, was cut down, or was merged, by words alone, or is
 * the only unit under its heading). Such a unit is checked again once its passages are known.
 */
interface Held {
  score: number;
  sure: boolean;
}

/** A score past which no other unit is looked at: under its heading, and alike at 0.9 or more. */
const SURE_SCORE = 2.9;

function pairsOf(unit: Unit): number[] {
  unit.pairs ??= grams(
    unit.words.map((w) => w.toLowerCase()),
    2,
  );
  return unit.pairs;
}

/** The share of `a`'s word pairs that are among `b`'s. */
function pairShare(a: Unit, b: Unit): number {
  const mine = pairsOf(a);
  if (mine.length === 0) return 0;
  b.pairSet ??= new Set(pairsOf(b));
  let n = 0;
  for (const g of mine) if (b.pairSet.has(g)) n++;
  return n / mine.length;
}

/** The first `n` words of `text` on one line, and "…" when there were more. */
function firstWords(text: string, n = 8): string {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((w) => w !== '');
  return words.length > n ? `${words.slice(0, n).join(' ')}…` : words.join(' ');
}

/** Lower-cased words, for comparing word pairs and triples. */
function lowerWords(text: string): string[] {
  return (text.match(WORD) ?? []).map((w) => w.toLowerCase());
}

/** Hashes of every `size` words in a row. */
function grams(words: readonly string[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + size <= words.length; i++)
    out.push(hash32(words.slice(i, i + size).join(' ')));
  return out;
}

/** The word pairs of a text, to look others' up in. */
function pairSet(text: string): Set<number> {
  return new Set(grams(lowerWords(text), 2));
}

/** The share of `text`'s word pairs found in `pairs`; 1 when it has none. */
function pairsKept(text: string, pairs: ReadonlySet<number>): number {
  const mine = grams(lowerWords(text), 2);
  if (mine.length === 0) return 1;
  let n = 0;
  for (const g of mine) if (pairs.has(g)) n++;
  return n / mine.length;
}

/** Whether `at` falls inside a word of `s`: between two characters that aren't spaces. */
function midWord(s: string, at: number): boolean {
  return (
    at > 0 && at < s.length && !/\s/u.test(s[at - 1] as string) && !/\s/u.test(s[at] as string)
  );
}

/**
 * The parts of two texts either side of what changed, without the start and end they share:
 * cut back to a word's edge, so a word changed at its start or end isn't split.
 */
function trimCommon(a: string, b: string): { a: [number, number]; b: [number, number] } {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  while (p > 0 && (midWord(a, p) || midWord(b, p))) p--;
  let s = 0;
  while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  while (s > 0 && (midWord(a, a.length - s) || midWord(b, b.length - s))) s--;
  return { a: [p, a.length - s], b: [p, b.length - s] };
}

/**
 * Every chapter (`#`) and section (`##`, `###`) of `before` that no unit of `after` holds, and
 * every passage of `CUT_MIN_WORDS` words or more removed from the rest.
 *
 * Sections: each is looked for by its exact text, then among the units of `after` that could
 * hold it (by a sketch value in common, as scenes are; the nearest `SAME_HEADING_LOOK` under the
 * same heading; an empty one under its heading), so the work grows with the sections, not their
 * square. A unit with no words under its heading is never a cut on its own; it is gone when no
 * heading of `after` folds to its own. A gone chapter whose sections are all gone is one cut.
 *
 * Passages: each unit still there is diffed line by line with the unit that holds it. A run of
 * removed lines (blank lines in between don't break it; a line still somewhere in `after` does)
 * of `CUT_MIN_WORDS` words or more, less what it shares at its start and end with what replaced
 * it, is a cut when nothing replaced it or the replacement shares under `CUT_KEEP_SHARE` of its
 * word pairs. Otherwise (a light rewrite) a word-level diff finds any long run taken out of it.
 * A passage with half its word triples somewhere in `after` moved, and is not a cut.
 */
function markdownCuts(before: string, after: string): FoundCut[] {
  const was = parseMarkdown(before);
  const now = parseMarkdown(after);
  const nowUnits = now.units;
  const indexOf = new Map(nowUnits.map((u, i) => [u, i]));
  const byHash = new Map<string, Unit>();
  const candidates = new Candidates<Unit>();
  const byKey = new Map<string, number[]>();
  nowUnits.forEach((u, i) => {
    if (!byHash.has(u.print.hash)) byHash.set(u.print.hash, u);
    candidates.add(u.print, u);
    const list = byKey.get(u.key);
    if (list) list.push(i);
    else byKey.set(u.key, [i]);
  });

  const wasKeys = new Map<string, number>();
  for (const u of was.units) wasKeys.set(u.key, (wasKeys.get(u.key) ?? 0) + 1);
  const scale = nowUnits.length / Math.max(1, was.units.length);
  const matchOf = (u: Unit, index: number): { unit: Unit; sure: boolean } | null => {
    const exact = byHash.get(u.print.hash);
    if (exact) return { unit: exact, sure: true };
    if (u.words.length === 0) {
      // Nothing to lose: there while its heading is.
      const same = byKey.get(u.key);
      return same ? { unit: nowUnits[same[0] as number] as Unit, sure: true } : null;
    }
    const target = index * scale;
    const look = new Set(candidates.of(u.print, target));
    const same = byKey.get(u.key) ?? [];
    if (same.length > 0) {
      // The nearest under the same heading, by where it would be now.
      let lo = 0;
      let hi = same.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((same[mid] as number) < target) lo = mid + 1;
        else hi = mid;
      }
      let left = lo - 1;
      let right = lo;
      for (let k = 0; k < SAME_HEADING_LOOK && (left >= 0 || right < same.length); k++) {
        const takeRight =
          right < same.length &&
          (left < 0 || (same[right] as number) - target <= target - (same[left] as number));
        look.add(nowUnits[same[takeRight ? right++ : left--] as number] as Unit);
      }
    }
    // Nearest first, at most CANDIDATES_MAX, and none after one that is surely it.
    const order = [...look].sort(
      (a, b) =>
        Math.abs((indexOf.get(a) as number) - target) -
        Math.abs((indexOf.get(b) as number) - target),
    );
    let best: { unit: Unit; held: Held } | null = null;
    for (const c of order.slice(0, CANDIDATES_MAX)) {
      const held = holds(u, c);
      if (held !== null && (best === null || held.score > best.held.score)) {
        best = { unit: c, held };
        if (held.score >= SURE_SCORE) break;
      }
    }
    if (best) return { unit: best.unit, sure: best.held.sure };
    // A heading only one unit has on each side is that unit, however much of it was rewritten,
    // while it has words: the passages that left it are found apart.
    const only = same.length === 1 ? (nowUnits[same[0] as number] as Unit) : null;
    return only && only.words.length > 0 && wasKeys.get(u.key) === 1
      ? { unit: only, sure: false }
      : null;
  };

  const units = was.units;
  const held = units.map((u, i) =>
    u.level === 0 ? { unit: nowUnits[0] as Unit, sure: true } : matchOf(u, i),
  );
  const matches = held.map((h) => h?.unit ?? null);
  /** A unit's name now, for its neighbours: the heading of the unit that holds it. */
  const names = units.map((u, i) => {
    const m = matches[i];
    return u.level === 0 || !m || m.level === 0 ? null : m.title;
  });
  const { prev, next } = neighbours(names);

  // Each unit's subtree ends at the next unit of its level or above.
  const subtreeEnd = new Array<number>(units.length).fill(units.length);
  const open: number[] = [];
  units.forEach((u, i) => {
    while (open.length > 0 && (units[open[open.length - 1] as number] as Unit).level >= u.level) {
      subtreeEnd[open.pop() as number] = i;
    }
    if (u.level > 0) open.push(i);
  });
  /** How many units up to each are still there, and how many have words. */
  const thereBefore = [0];
  const wordyBefore = [0];
  units.forEach((u, i) => {
    thereBefore.push((thereBefore[i] as number) + (matches[i] ? 1 : 0));
    wordyBefore.push((wordyBefore[i] as number) + (u.words.length > 0 ? 1 : 0));
  });

  const found: { at: number; cut: FoundCut }[] = [];
  const inCut = new Array<boolean>(units.length).fill(false);
  const nowLines = new Set(now.lines.filter((line) => HAS_WORD.test(line)));
  /** Whether every line with words of `was`'s lines `[first, end)` is a line of `after` too. */
  const linesThere = (first: number, end: number): boolean => {
    for (let k = first; k < end; k++) {
      const line = was.lines[k] as string;
      if (HAS_WORD.test(line) && !nowLines.has(line)) return false;
    }
    return true;
  };
  /** A unit (and those under it to `last`) as a cut, unless all its words moved elsewhere. */
  const sectionCut = (i: number, last: number) => {
    const u = units[i] as Unit;
    if (linesThere(u.first + 1, (units[last] as Unit).end)) return;
    const text = before.slice(u.from, (units[last] as Unit).to);
    found.push({
      at: u.from,
      cut: {
        title: u.title.trim() || firstWords(text),
        text,
        where: { after: prev[i] ?? null, before: next[last] ?? null },
      },
    });
  };
  for (let i = 1; i < units.length; i++) {
    if (matches[i] || inCut[i]) continue;
    const u = units[i] as Unit;
    const end = subtreeEnd[i] as number;
    let last = i;
    if (thereBefore[end] === thereBefore[i]) {
      // The whole chapter or section went, with everything under it.
      if (wordyBefore[end] === wordyBefore[i]) continue; // headings only: nothing to keep
      last = end - 1;
    } else if (u.words.length === 0) {
      continue;
    }
    for (let k = i; k <= last; k++) inCut[k] = true;
    sectionCut(i, last);
  }

  // Passages, in the units still there.
  let triples: Set<number> | null = null;
  const moved = (text: string): boolean => {
    const mine = grams(lowerWords(text), 3);
    if (mine.length === 0) return false;
    triples ??= new Set(grams(lowerWords(after), 3));
    let n = 0;
    for (const g of mine) if (triples.has(g)) n++;
    return n / mine.length >= CUT_KEEP_SHARE;
  };
  units.forEach((u, i) => {
    const m = matches[i];
    if (!m || inCut[i]) return;
    const where = {
      after: u.level === 0 ? null : (names[i] ?? null),
      before: next[i] ?? null,
    };
    let any = false;
    if (wordsIn(before.slice(u.from, u.to)) >= CUT_MIN_WORDS) {
      for (const [from, text] of passages(was, u, now, m, nowLines)) {
        if (moved(text)) continue;
        found.push({ at: from, cut: { title: firstWords(text), text, where } });
        any = true;
      }
    }
    // Held only by a rule that lets most of its words go, with no passage long enough to keep:
    // when under half its word pairs are still in the unit that holds it, the unit is the cut,
    // so a short section rewritten or cut down under its own heading is never lost.
    if (!any && held[i]?.sure === false && pairShare(u, m) < CUT_KEEP_SHARE) sectionCut(i, i);
  });

  found.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: FoundCut[] = [];
  for (const { cut } of found) {
    const text = cutText(cut.text);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ ...cut, text });
  }
  return out;
}

/** Where line `i` of a parsed text ends, before its line break. */
const endOfLine = (p: Parsed, i: number) => (p.starts[i] as number) + (p.lines[i] as string).length;

/**
 * The passages of `u` (in `was`) that are not in `m` (in `now`), as [offset in `was`, text]: see
 * `markdownCuts`. A line diff of the two units, so the work is the units' lines plus the
 * changes; a word-level diff only inside a change, and only up to `MAX_TOKENS` tokens a side.
 */
function passages(
  was: Parsed,
  u: Unit,
  now: Parsed,
  m: Unit,
  nowLines: ReadonlySet<string>,
): [number, string][] {
  const a = was.lines.slice(u.first, u.end);
  const b = now.lines.slice(m.first, m.end);
  const out: [number, string][] = [];

  /** Lines `[i0, i1)` of `was` removed, `[j0, j1)` of `now` added in their place. */
  const change = (i0: number, i1: number, j0: number, j1: number) => {
    // Blank lines at either end of what was added are where the change met unchanged ones.
    const added = j1 > j0 ? now.text.slice(now.starts[j0], endOfLine(now, j1 - 1)).trim() : '';
    let addedPairs: Set<number> | null = null;
    // Runs of lines gone from everywhere; a blank line neither breaks nor starts one.
    let start = -1;
    let last = -1;
    const flush = () => {
      if (start >= 0) {
        const from = was.starts[start] as number;
        addedPairs ??= pairSet(added);
        removed(from, was.text.slice(from, endOfLine(was, last)), added, addedPairs);
      }
      start = -1;
    };
    for (let i = i0; i < i1; i++) {
      const line = was.lines[i] as string;
      if (!HAS_WORD.test(line)) continue;
      if (nowLines.has(line)) {
        flush();
        continue;
      }
      if (start < 0) start = i;
      last = i;
    }
    flush();
  };

  const removed = (from: number, text: string, added: string, addedPairs: ReadonlySet<number>) => {
    if (wordsIn(text) < CUT_MIN_WORDS) return;
    const {
      a: [p, q],
      b: [r, s],
    } = trimCommon(text, added);
    const gone = text.slice(p, q);
    const instead = added.slice(r, s);
    const take = (at: number, piece: string) => {
      const trimmed = piece.trim();
      if (wordsIn(trimmed) < CUT_MIN_WORDS) return;
      out.push([from + p + at + piece.indexOf(trimmed), trimmed]);
    };
    if (!HAS_WORD.test(instead) || pairsKept(gone, addedPairs) < CUT_KEEP_SHARE) {
      take(0, gone);
      return;
    }
    // A light rewrite: only a long run taken out of it is a cut.
    const x = gone.match(TOKEN) ?? [];
    const y = instead.match(TOKEN) ?? [];
    if (x.length <= MAX_TOKENS && y.length <= MAX_TOKENS) {
      for (const [at, piece, put] of wordChanges(x, y)) {
        if (wordsIn(piece) >= CUT_MIN_WORDS && pairsKept(piece, pairSet(put)) < CUT_KEEP_SHARE) {
          take(at, piece);
        }
      }
      return;
    }
    // Too long for a word diff: lines that are mostly gone, in runs.
    let runFrom = -1;
    let runTo = -1;
    let offset = 0;
    const end = () => {
      if (runFrom >= 0) take(runFrom, gone.slice(runFrom, runTo));
      runFrom = -1;
    };
    for (const line of gone.split('\n')) {
      if (HAS_WORD.test(line)) {
        if (pairsKept(line, addedPairs) < CUT_KEEP_SHARE) {
          if (runFrom < 0) runFrom = offset;
          runTo = offset + line.length;
        } else end();
      }
      offset += line.length + 1;
    }
    end();
  };

  // Changes, joined across unchanged runs of blank lines.
  let open: [number, number, number, number] | null = null;
  const close = () => {
    if (open) change(...open);
    open = null;
  };
  for (const run of diffLines(a, b)) {
    const i0 = u.first + run.old[0];
    const i1 = u.first + run.old[1];
    const j0 = m.first + run.new[0];
    const j1 = m.first + run.new[1];
    if (run.kind === 'same') {
      let blank = true;
      for (let i = i0; i < i1 && blank; i++) blank = !HAS_WORD.test(was.lines[i] as string);
      if (!blank) close();
      else if (open) {
        open[1] = i1;
        open[3] = j1;
      }
      continue;
    }
    if (!open) open = [i0, i1, j0, j1];
    else {
      open[1] = Math.max(open[1], i1);
      open[3] = Math.max(open[3], j1);
    }
  }
  close();
  return out;
}

/**
 * The changes of a word-level diff of two token lists (as `diffWords` makes them), each as
 * [offset in the first text, what it took out, what it put in]. Unchanged runs of only spaces,
 * or of one or two characters, between two changes are part of the change, as in `diffWords`.
 * (`diffWords` itself gives each side's parts but not which removal went with which addition.)
 */
function wordChanges(x: readonly string[], y: readonly string[]): [number, string, string][] {
  const offsets = [0];
  for (const t of x) offsets.push((offsets[offsets.length - 1] as number) + t.length);
  const runs = diffLines(x, y);
  const out: [number, string, string][] = [];
  let cur: { i0: number; i1: number; j0: number; j1: number } | null = null;
  const flush = () => {
    if (cur) {
      out.push([
        offsets[cur.i0] as number,
        x.slice(cur.i0, cur.i1).join(''),
        y.slice(cur.j0, cur.j1).join(''),
      ]);
    }
    cur = null;
  };
  runs.forEach((run, k) => {
    if (run.kind === 'same') {
      const text = x.slice(run.old[0], run.old[1]).join('');
      const small = /^\s+$/u.test(text) || [...text].length <= 2;
      if (cur && small && k + 1 < runs.length) {
        cur.i1 = run.old[1];
        cur.j1 = run.new[1];
      } else flush();
      return;
    }
    if (!cur) cur = { i0: run.old[0], i1: run.old[1], j0: run.new[0], j1: run.new[1] };
    else {
      cur.i1 = Math.max(cur.i1, run.old[1]);
      cur.j1 = Math.max(cur.j1, run.new[1]);
    }
  });
  flush();
  return out;
}
