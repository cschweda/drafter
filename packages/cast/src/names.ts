// A character's name in the action (seeing-the-script design §3.2): the spellings it counts in, and
// one linear scan of a block's text that finds every name in it, the longest first.

/** One word of text: where it starts, and the marks (not spaces) between it and the word before. */
export interface Token {
  word: string;
  at: number;
  gap: string;
}

/** A run of letters, digits, apostrophes, and hyphens. One quantifier: linear on any text. */
const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;

const EDGE = new Set(["'", '’', '-']);

/**
 * The words of `text`, each without a trailing `'s` or `’s` (a possessive) and without the
 * apostrophes or hyphens at its edges (`'JO'` is JO).
 */
export function tokens(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    let from = 0;
    let to = raw.length;
    if (to > 2 && (raw[to - 2] === "'" || raw[to - 2] === '’') && /[sS]/.test(raw[to - 1] ?? '')) {
      to -= 2;
    }
    while (from < to && EDGE.has(raw[from] as string)) from++;
    while (to > from && EDGE.has(raw[to - 1] as string)) to--;
    if (from === to) continue;
    const at = match.index + from;
    out.push({ word: raw.slice(from, to), at, gap: marks(text, last, at) });
    last = at + (to - from);
  }
  return out;
}

/** The characters of `text` from `from` to `to` that aren't white space. */
function marks(text: string, from: number, to: number): string {
  let out = '';
  for (let i = from; i < to; i++) {
    const c = text[i] as string;
    if (c.trim() !== '') out += c;
  }
  return out;
}

/** Upper-cases the first letter, and each after a hyphen or an apostrophe; the rest lower. */
function capitalise(word: string): string {
  let out = '';
  let start = true;
  for (const c of word.toLowerCase()) {
    out += start ? c.toUpperCase() : c;
    start = c === '-' || c === "'" || c === '’';
  }
  return out;
}

/** A spelling of a name as words, and the marks between them (`DR. VOSS`: `['DR', 'VOSS']`, `['', '.']`). */
interface Phrase {
  words: string[];
  gaps: string[];
}

function phrases(name: string, word: boolean): Phrase[] {
  const found = tokens(name);
  if (found.length === 0) return [];
  const gaps = found.map((t, i) => (i === 0 ? '' : t.gap));
  const typed = found.map((t) => t.word);
  const spelled = [typed.map((w) => w.toUpperCase())];
  // A name that is also an ordinary word counts only in capitals (§3.2).
  if (!word) spelled.push(typed.map(capitalise), typed);
  const seen = new Set<string>();
  const out: Phrase[] = [];
  for (const words of spelled) {
    const key = words.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ words, gaps });
  }
  return out;
}

const joined = ({ words, gaps }: Phrase) =>
  words.map((w, i) => (i === 0 ? w : `${gaps[i]} ${w}`)).join('');

/**
 * The spellings `name` counts in, as text: in capitals; and, unless it is an ordinary word, with
 * the first letter of each word capitalised, and as the cue spells it (`McCLANE`).
 */
export function spellings(name: string, word: boolean): string[] {
  return phrases(name, word).map(joined);
}

/** One spelling of one character: `character` is its place in the list `nameMap` was given. */
export interface Spelling extends Phrase {
  character: number;
}

/** Each spelling by its first word, the longest names first. */
export type NameMap = Map<string, Spelling[]>;

/** The map of every spelling of `names` by first word; `word` says the name is an ordinary word. */
export function nameMap(names: ReadonlyArray<{ name: string; word: boolean }>): NameMap {
  const map: NameMap = new Map();
  names.forEach(({ name, word }, character) => {
    for (const phrase of phrases(name, word)) {
      const first = phrase.words[0] as string;
      let list = map.get(first);
      if (!list) {
        list = [];
        map.set(first, list);
      }
      list.push({ ...phrase, character });
    }
  });
  // Stable, so names of one length keep the order they came in.
  for (const list of map.values()) list.sort((a, b) => b.words.length - a.words.length);
  return map;
}

/**
 * Calls `found` with the character and the offset in `text` of every name in it, in order. One
 * pass over the words: at each, the names starting with it are tried longest first, and a match
 * goes on past its last word, so ANN LEE is never also ANN.
 */
export function matchNames(
  text: string,
  map: NameMap,
  found: (character: number, at: number) => void,
): void {
  if (map.size === 0) return;
  const words = tokens(text);
  let i = 0;
  while (i < words.length) {
    const here = words[i] as Token;
    const list = map.get(here.word);
    let length = 0;
    if (list) {
      for (const spelling of list) {
        if (fits(words, i, spelling)) {
          found(spelling.character, here.at);
          length = spelling.words.length;
          break;
        }
      }
    }
    i += Math.max(1, length);
  }
}

function fits(words: readonly Token[], i: number, spelling: Spelling): boolean {
  if (i + spelling.words.length > words.length) return false;
  for (let k = 1; k < spelling.words.length; k++) {
    const token = words[i + k] as Token;
    if (token.word !== spelling.words[k] || token.gap !== spelling.gaps[k]) return false;
  }
  return true;
}
