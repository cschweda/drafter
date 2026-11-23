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
 * the first letter of each word capitalised, and as the cue spells it (`McBRIDE`).
 */
export function spellings(name: string, word: boolean): string[] {
  return phrases(name, word).map(joined);
}

/** One spelling of one character: `character` is its place in the list `nameMap` was given. */
export interface Spelling extends Phrase {
  character: number;
}

/**
 * The spellings that start with one word: the one-word names, and the longer ones down a tree of
 * the words that follow. A word many names start with (`THE`), or two words (`THE OLD`), costs
 * one lookup of the next word, never a try of every name.
 */
export interface NameStart {
  alone: Spelling[];
  next: Map<string, NameNode>;
}

/**
 * The longer spellings that reach this word by one way: those ending at it, and the rest by their
 * next step. Every spelling here has the same words and the same marks between them, so the first
 * is the one found.
 */
export interface NameNode {
  ends: Spelling[];
  next: Map<string, NameNode>;
}

/**
 * A step of the tree: a word and the marks before it (`DR. VOSS` and `DR VOSS` part ways here, so
 * names alike in their words never have to be tried one by one).
 */
export const stepKey = (gap: string, word: string): string => `${gap}\u0000${word}`;

/**
 * The most words a name is looked for by. No one is called more, and a name of thousands of the
 * same word made every place that word stood a walk of thousands of steps.
 */
export const MAX_NAME_WORDS = 12;

/** Each spelling by its first word, then word by word. */
export type NameMap = Map<string, NameStart>;

/** The map of every spelling of `names` by first word; `word` says the name is an ordinary word. */
export function nameMap(names: ReadonlyArray<{ name: string; word: boolean }>): NameMap {
  const map: NameMap = new Map();
  names.forEach(({ name, word }, character) => {
    for (const phrase of phrases(name, word)) {
      if (phrase.words.length > MAX_NAME_WORDS) continue;
      const first = phrase.words[0] as string;
      let start = map.get(first);
      if (!start) {
        start = { alone: [], next: new Map() };
        map.set(first, start);
      }
      if (phrase.words.length === 1) {
        start.alone.push({ ...phrase, character });
        continue;
      }
      let level = start.next;
      let node: NameNode | undefined;
      for (let k = 1; k < phrase.words.length; k++) {
        const key = stepKey(phrase.gaps[k] as string, phrase.words[k] as string);
        node = level.get(key);
        if (!node) {
          node = { ends: [], next: new Map() };
          level.set(key, node);
        }
        level = node.next;
      }
      // In the order the names came, so of two spelled alike the first is the one found.
      (node as NameNode).ends.push({ ...phrase, character });
    }
  });
  return map;
}

/**
 * Calls `found` with the character and the offset in `text` of every name in it, in order. One
 * pass over the words: at each, the tree is followed as far as the words go, the longest name
 * that fits is taken, then the one-word names; a match goes on past its last word, so ANN LEE is
 * never also ANN.
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
    const start = map.get(here.word);
    let length = 0;
    if (start) {
      let match: Spelling | undefined;
      let level = start.next;
      const last = Math.min(words.length, i + MAX_NAME_WORDS);
      for (let k = i + 1; k < last; k++) {
        const token = words[k] as Token;
        const node = level.get(stepKey(token.gap, token.word));
        if (!node) break;
        match = node.ends[0] ?? match;
        level = node.next;
      }
      match ??= start.alone[0];
      if (match) {
        found(match.character, here.at);
        length = match.words.length;
      }
    }
    i += Math.max(1, length);
  }
}
