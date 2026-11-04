import { diffLines, MAX_TOKENS, markdownAnchors, splitLines } from '@drafter/compare';
import { markdownProse, wordsIn } from '@drafter/markdown';
import { CANDIDATES_MAX, Candidates } from './candidates';
import { cutText } from './cuts-file';
import type { WorkKind } from './draft-file';
import { hash32, hash53 } from './hash';
import { coveredBy } from './match';
import { headingKey, type ScenePrint, type SceneSlot, scenePrints, sketchOf } from './print';

// Finding what left a text (drafts-and-cuts design §3.1): the scenes, chapters and sections that
// were in `before` and are not in `after`, and every passage that left a scene or section still
// there. The maintainer (2026-11-01): "I've found myself always going back to what I've cut for
// ideas of what to include. So 'cuts' should include all cuts." Moved text is never a cut, nor
// are word-level tweaks, typo fixes, or light rewrites.

/** A piece of `before` that is not in `after`. */
export interface FoundCut {
  /** The scene, chapter or section heading; for a passage, its first 8 words and "…". */
  title: string;
  /** Exactly as it was in `before`, from its first word to its last, with `\n` line breaks. */
  text: string;
  where: {
    /** The headings either side of it, as they are in `after`; null at the start or the end. */
    after: string | null;
    before: string | null;
    /**
     * For a passage, the scene or section it was cut from, so Cuts can group it there: its
     * heading in `before` ('' for a Markdown document's opening) and its place, the scene's
     * number (1, 2, 3…) or the section's (1, 2, 3… in document order; 0 for the opening). Null
     * for a whole scene, chapter or section.
     */
    within: { heading: string; ordinal: number } | null;
  };
}

/**
 * A passage removed from a scene or section still there is a cut when it is a whole element or
 * paragraph (a speech, an action paragraph, a transition, a Markdown paragraph or list item)
 * taken out with nothing in its place, or a run of at least this many words: deleted, or
 * replaced by text that keeps under `CUT_KEEP_SHARE` of its word pairs.
 */
export const CUT_MIN_WORDS = 12;

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
 * (`coveredBy`, looked for among only the scenes that could match), and every passage that left a
 * scene still covered (`PassageFinder`, against the scene now under the covering print nearest
 * its place). A scene's neighbours are the nearest scenes either side still there, by their
 * heading now. A scene whose every line is still in `after` is not a cut.
 */
function sceneCuts(before: string, after: string): FoundCut[] {
  const was = scenePrints(before);
  const now = scenePrints(after);
  const wasPrints = new Map(was.prints.map((p) => [p.hash, p]));
  const candidates = new Candidates<ScenePrint>();
  for (const p of now.prints) candidates.add(p, p);
  const nowPrints = new Map(now.prints.map((p) => [p.hash, p]));
  const coverOf = new Map<string, ScenePrint | null>();
  const scale = now.prints.length / Math.max(1, was.slots.length);
  const cover = (print: ScenePrint, near: number): ScenePrint | null => {
    let found = coverOf.get(print.hash);
    if (found === undefined) {
      // The same version now is its own cover, before any merely like it.
      found = nowPrints.get(print.hash) ?? null;
      for (const p of found ? [] : candidates.of(print, near)) {
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
  /** The scenes now under each print, by their place, for the scene a covered one is diffed with. */
  const nowSlots = new Map<string, number[]>();
  const nowByKey = new Map<string, number[]>();
  now.slots.forEach((slot, k) => {
    file(nowSlots, slot.hash, k);
    file(nowByKey, (nowPrints.get(slot.hash) as ScenePrint).headingKey, k);
  });
  const nowScale = now.slots.length / Math.max(1, was.slots.length);
  /** The scene now each scene was is diffed with: the nearest under its covering print. */
  const there = covers.map((covering, i) => {
    if (!covering) return -1;
    const places = nowSlots.get(covering.hash) ?? [];
    const target = i * nowScale;
    let k = places[0] as number;
    for (const place of places) if (Math.abs(place - target) < Math.abs(k - target)) k = place;
    return k;
  });
  // A scene no scene covers, with a scene of its heading now at about its place that has words
  // and holds no other: the same scene, rewritten or cut hard (a stock line replaced, say), so
  // what left it is found passage by passage rather than the whole scene with its kept lines.
  const taken = new Set(there.filter((k) => k >= 0));
  covers.forEach((covering, i) => {
    if (covering) return;
    const print = wasPrints.get((was.slots[i] as SceneSlot).hash) as ScenePrint;
    if (print.shingles === 0) return;
    for (const k of nearestOf(nowByKey.get(print.headingKey) ?? [], i * nowScale)) {
      const p = nowPrints.get((now.slots[k] as SceneSlot).hash) as ScenePrint;
      if (taken.has(k) || p.shingles === 0) continue;
      covers[i] = p;
      there[i] = k;
      taken.add(k);
      return;
    }
  });
  const names = covers.map((p) => p?.heading ?? null);
  const { prev, next } = neighbours(names);
  const wasSide = side(before);
  const nowSide = side(after);
  const finder = new PassageFinder(wasSide, nowSide);
  const found: { at: number; cut: FoundCut }[] = [];
  was.slots.forEach((slot, i) => {
    const heading = (wasPrints.get(slot.hash) as ScenePrint).heading.trim();
    const covering = covers[i];
    if (covering) {
      // The scene is still there: what left it, passage by passage.
      const scene = now.slots[there[i] as number] as SceneSlot;
      const where = {
        after: covering.heading,
        before: next[i] ?? null,
        within: { heading, ordinal: slot.ordinal },
      };
      for (const [at, text] of finder.find(
        span(wasSide, slot.from, slot.to),
        span(nowSide, scene.from, scene.to),
      )) {
        found.push({ at, cut: { title: firstWords(text), text, where } });
      }
      return;
    }
    // Every line of it is still in the text, elsewhere: nothing of it left.
    const lines = span(wasSide, slot.from, slot.to);
    if (finder.linesThere(lines.first, lines.end)) return;
    const text = before.slice(slot.from, slot.to);
    found.push({
      at: slot.from,
      cut: {
        title: heading || firstWords(text),
        text,
        where: { after: prev[i] ?? null, before: next[i] ?? null, within: null },
      },
    });
  });
  return inOrder(found);
}

/** Files `item` under `key`. */
function file<K, T>(map: Map<K, T[]>, key: K, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** Up to `SAME_HEADING_LOOK` of `places` (ascending), nearest `target` first. */
function nearestOf(places: readonly number[], target: number): number[] {
  let lo = 0;
  let hi = places.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((places[mid] as number) < target) lo = mid + 1;
    else hi = mid;
  }
  let left = lo - 1;
  let right = lo;
  const out: number[] = [];
  while (out.length < SAME_HEADING_LOOK && (left >= 0 || right < places.length)) {
    const takeRight =
      right < places.length &&
      (left < 0 || (places[right] as number) - target <= target - (places[left] as number));
    out.push(places[takeRight ? right++ : left--] as number);
  }
  return out;
}

/** The cuts in `before`'s order, their text with `\n` line breaks, the same text once. */
function inOrder(found: { at: number; cut: FoundCut }[]): FoundCut[] {
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

/** A text's lines, without their breaks, and where each starts. */
interface Side {
  text: string;
  lines: string[];
  starts: number[];
}

interface Parsed extends Side {
  units: Unit[];
}

function side(text: string): Side {
  return { text, ...splitLines(text) };
}

/** Lines `[first, end)` of a text, and whether the first is a heading (a boundary, not text). */
interface Span {
  first: number;
  end: number;
  headed: boolean;
}

/** The line that offset `at` of `side` is on. */
function lineOf(side: Side, at: number): number {
  let lo = 0;
  let hi = side.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((side.starts[mid] as number) <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The lines a scene's span `[from, to)` covers, its heading first. */
function span(side: Side, from: number, to: number): Span {
  return { first: lineOf(side, from), end: lineOf(side, Math.max(from, to - 1)) + 1, headed: true };
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

/** Whether `at` falls inside a word of `s`: between two letters or digits. */
function midWord(s: string, at: number): boolean {
  return (
    at > 0 && at < s.length && HAS_WORD.test(s[at - 1] as string) && HAS_WORD.test(s[at] as string)
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
 * every passage that left one still there (`PassageFinder`).
 *
 * Sections: each is looked for by its exact text, then among the units of `after` that could
 * hold it (by a sketch value in common, as scenes are; the nearest `SAME_HEADING_LOOK` under the
 * same heading; an empty one under its heading), nearest first and at most `CANDIDATES_MAX`, so
 * the work grows with the sections, not their square. A unit with no words under its heading is
 * never a cut on its own; it is gone when no heading of `after` folds to its own. A gone chapter
 * whose sections are all gone is one cut. A unit whose every line is still in `after` is not.
 */
function markdownCuts(before: string, after: string): FoundCut[] {
  // The trailing drafter comment is not prose: a synopsis edited, or facts cleared, is never a cut,
  // and Put back never brings JSON back into the text. Offsets before the comment are unchanged.
  const was = parseMarkdown(markdownProse(before));
  const now = parseMarkdown(markdownProse(after));
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
    // The nearest under the same heading, by where it would be now.
    for (const k of nearestOf(same, target)) look.add(nowUnits[k] as Unit);
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
  const finder = new PassageFinder(was, now);
  const linesThere = (first: number, end: number) => finder.linesThere(first, end);
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
        where: { after: prev[i] ?? null, before: next[last] ?? null, within: null },
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
  units.forEach((u, i) => {
    const m = matches[i];
    if (!m || inCut[i]) return;
    const where = {
      after: u.level === 0 ? null : (names[i] ?? null),
      before: next[i] ?? null,
      within: { heading: u.title, ordinal: i },
    };
    let any = false;
    const from = { first: u.first, end: u.end, headed: u.level > 0 };
    const to = { first: m.first, end: m.end, headed: m.level > 0 };
    for (const [at, text] of finder.find(from, to)) {
      found.push({ at, cut: { title: firstWords(text), text, where } });
      any = true;
    }
    // Held only by a rule that lets most of its words go, with no passage to keep: when under
    // half its word pairs are still in the unit that holds it, the unit is the cut, so a short
    // section rewritten or cut down under its own heading is never lost.
    if (!any && held[i]?.sure === false && pairShare(u, m) < CUT_KEEP_SHARE) sectionCut(i, i);
  });
  return inOrder(found);
}

/** Where line `i` of a text ends, before its line break. */
const endOfLine = (p: Side, i: number) => (p.starts[i] as number) + (p.lines[i] as string).length;

/** A line that starts a list item, which is an element of its own. */
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s/;

/**
 * The passages that left a scene or section still there (see `CUT_MIN_WORDS`), as
 * [offset in `before`, text]. The scene or section is diffed line by line with the one that holds
 * it now, so the work is their lines plus the changes; a word-level diff runs only inside a
 * change, and only up to `MAX_TOKENS` tokens a side.
 *
 * A change is a run of removed and added lines; unchanged blank lines don't end it. Its removed
 * lines are split at lines that moved (a line is there as often in `after` as in `before`), so
 * moved text is never a cut. A passage with half its word triples somewhere in `after` moved too.
 */
class PassageFinder {
  private readonly wasCounts: Map<string, number>;
  private readonly nowCounts: Map<string, number>;
  private triples: Set<number> | null = null;
  private lined: string | null = null;

  constructor(
    private readonly was: Side,
    private readonly now: Side,
  ) {
    this.wasCounts = lineCounts(was.lines);
    this.nowCounts = lineCounts(now.lines);
  }

  /** Whether every line with words of `before`'s lines `[first, end)` is a line of `after` too. */
  linesThere(first: number, end: number): boolean {
    for (let k = first; k < end; k++) {
      const line = this.was.lines[k] as string;
      if (HAS_WORD.test(line) && !this.nowCounts.has(line)) return false;
    }
    return true;
  }

  find(from: Span, to: Span): [number, string][] {
    const { was, now } = this;
    const out: [number, string][] = [];
    const a = was.lines.slice(from.first, from.end);
    const b = now.lines.slice(to.first, to.end);
    // Changes, joined across unchanged runs of blank lines.
    let open: [number, number, number, number] | null = null;
    const close = () => {
      if (open) this.change(from, ...open, out);
      open = null;
    };
    for (const run of diffLines(a, b)) {
      const i0 = from.first + run.old[0];
      const i1 = from.first + run.old[1];
      const j0 = to.first + run.new[0];
      const j1 = to.first + run.new[1];
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

  /** Whether a line with words moved: it is there as often in `after` as in `before`. */
  private moved(line: string): boolean {
    return (this.nowCounts.get(line) ?? 0) >= (this.wasCounts.get(line) ?? 0);
  }

  /** Lines `[i0, i1)` of `before` removed, `[j0, j1)` of `after` added in their place. */
  private change(
    span: Span,
    i0: number,
    i1: number,
    j0: number,
    j1: number,
    out: [number, string][],
  ): void {
    const { was, now } = this;
    // Blank lines at either end of what was added are where the change met unchanged ones.
    const added = j1 > j0 ? now.text.slice(now.starts[j0], endOfLine(now, j1 - 1)).trim() : '';
    let start = -1;
    let last = -1;
    const flush = () => {
      if (start >= 0)
        this.removed(span, was.starts[start] as number, endOfLine(was, last), added, out);
      start = -1;
    };
    for (let i = i0; i < i1; i++) {
      const line = was.lines[i] as string;
      if (!HAS_WORD.test(line)) continue;
      if (this.moved(line)) {
        flush();
        continue;
      }
      if (start < 0) start = i;
      last = i;
    }
    flush();
  }

  /** The text `before[start, end)` removed, with `added` written in its place. */
  private removed(
    span: Span,
    start: number,
    end: number,
    added: string,
    out: [number, string][],
  ): void {
    const text = this.was.text.slice(start, end);
    const common = trimCommon(text, added);
    let [p, q] = common.a;
    const [r, s] = common.b;
    const instead = added.slice(r, s);
    if (!HAS_WORD.test(instead)) {
      this.consider(span, start + p, text.slice(p, q), '', out);
      return;
    }
    // Replaced: out to the spaces either side, so its own punctuation goes with it.
    while (p > 0 && !/\s/u.test(text[p - 1] as string)) p--;
    while (q < text.length && !/\s/u.test(text[q] as string)) q++;
    const gone = text.slice(p, q);
    const x = gone.match(TOKEN) ?? [];
    const y = instead.match(TOKEN) ?? [];
    // Replaced by something else: short unchanged runs between its changes are part of it.
    const replaced = pairsKept(gone, pairSet(instead)) < CUT_KEEP_SHARE;
    if (x.length <= MAX_TOKENS && y.length <= MAX_TOKENS) {
      for (const [at, piece, put] of wordChanges(x, y, replaced)) {
        this.consider(span, start + p + at, piece, put, out);
      }
      return;
    }
    // Too long for a word diff: the whole of it when replaced, else the lines mostly gone.
    if (replaced) {
      this.consider(span, start + p, gone, instead, out);
      return;
    }
    const pairs = pairSet(instead);
    let offset = 0;
    for (const line of gone.split('\n')) {
      if (HAS_WORD.test(line) && pairsKept(line, pairs) < CUT_KEEP_SHARE) {
        this.consider(span, start + p + offset, line, instead, out);
      }
      offset += line.length + 1;
    }
  }

  /** A removed piece at `at` in `before`, with `put` in its place: a cut, or not. */
  private consider(span: Span, at: number, piece: string, put: string, out: [number, string][]) {
    // On a word at both ends: in the middle of a line, past the ", " "; " or "— " it followed.
    const midLine = this.was.text.slice(this.was.starts[lineOf(this.was, at)], at).trim() !== '';
    const lead = (midLine ? /^[\s,;:.!?…—–-]*/u : /^\s*/u).exec(piece)?.[0].length ?? 0;
    const text = piece.slice(lead).trimEnd();
    if (!HAS_WORD.test(text)) return;
    const from = at + lead;
    const words = wordsIn(text);
    const cut = HAS_WORD.test(put)
      ? words >= CUT_MIN_WORDS && pairsKept(text, pairSet(put)) < CUT_KEEP_SHARE
      : words >= CUT_MIN_WORDS || this.whole(span, from, from + text.length);
    if (cut && !this.elsewhere(text) && !this.verbatim(text)) out.push([from, text]);
  }

  /**
   * Whether `before[from, to)` is whole elements: it starts at the start of an element (after a
   * blank line, the heading, or the start of the span, or at a list item) and ends at the end of
   * one (before a blank line, a list item, or the end of the span).
   */
  private whole(span: Span, from: number, to: number): boolean {
    const { was } = this;
    const first = lineOf(was, from);
    const last = lineOf(was, Math.max(from, to - 1));
    if (was.text.slice(was.starts[first], from).trim() !== '') return false;
    if (was.text.slice(to, endOfLine(was, last)).trim() !== '') return false;
    const edge = (i: number) =>
      i < span.first ||
      i >= span.end ||
      (span.headed && i === span.first) ||
      !/\S/.test(was.lines[i] as string);
    const startsHere = edge(first - 1) || LIST_ITEM.test(was.lines[first] as string);
    const endsHere = edge(last + 1) || LIST_ITEM.test(was.lines[last + 1] ?? '');
    return startsHere && endsHere;
  }

  /**
   * Whether `text` is in `after` as it is, as whole lines (a copy of it kept elsewhere). Looked
   * for only when each of its lines is a line of `after`, which a cut's lines rarely all are.
   */
  private verbatim(text: string): boolean {
    const lines = text.split(/\r?\n/);
    if (!lines.every((line) => !HAS_WORD.test(line) || this.nowCounts.has(line))) return false;
    this.lined ??= `\n${cutText(this.now.text)}\n`;
    return this.lined.includes(`\n${cutText(text)}\n`);
  }

  /** Half its word triples are somewhere in `after`: it moved, and is not a cut. */
  private elsewhere(text: string): boolean {
    const mine = grams(lowerWords(text), 3);
    if (mine.length === 0) return false;
    this.triples ??= new Set(grams(lowerWords(this.now.text), 3));
    let n = 0;
    for (const g of mine) if (this.triples.has(g)) n++;
    return n / mine.length >= CUT_KEEP_SHARE;
  }
}

/** How often each line with words occurs. */
function lineCounts(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) if (HAS_WORD.test(line)) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/**
 * The changes of a word-level diff of two token lists (as `diffWords` makes them), each as
 * [offset in the first text, what it took out, what it put in]. Unchanged runs of only spaces,
 * or of one or two characters, between two changes are part of the change, as in `diffWords`;
 * with `foldWords` (a replacement), so are unchanged runs of under three words, the words two
 * different texts happen to share.
 * (`diffWords` itself gives each side's parts but not which removal went with which addition.)
 */
function wordChanges(
  x: readonly string[],
  y: readonly string[],
  foldWords: boolean,
): [number, string, string][] {
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
      const small =
        /^\s+$/u.test(text) ||
        [...text].length <= 2 ||
        (foldWords && (text.match(WORD) ?? []).length < 3);
      // A replacement takes the punctuation at its very start or end with it ("WORD." for "word.").
      const edge = foldWords && !HAS_WORD.test(text);
      if (cur && (small || edge) && (k + 1 < runs.length || edge)) {
        cur.i1 = run.old[1];
        cur.j1 = run.new[1];
      } else flush();
      if (k === 0 && edge) cur = { i0: run.old[0], i1: run.old[1], j0: run.new[0], j1: run.new[1] };
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
