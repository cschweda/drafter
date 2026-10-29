import { parse } from '@drafter/fountain';
import type { Checker } from './checker';
import { harvestedWords, isKnown, knownSet, scriptDictionary } from './known';
import { type Token, tokenize } from './tokens';
import { fountainUnits, markdownUnits, type Unit } from './units';

// An incremental checker (technical design §10; Plan D, Call 5). The worker sends the whole text
// after a pause; the session tokenizes only the units (blocks) whose key it hasn't seen, and asks
// the checker only about words it hasn't asked about. The known words (names, locations, the
// script's dictionary, My dictionary) are rebuilt each check and filter the cached verdicts, so
// adding a word never checks anything again.

export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

export interface CheckInput {
  source: string;
  kind: 'fountain' | 'markdown';
  /** Check notes and boneyard. */
  notes: boolean;
  /** My dictionary. */
  mine: readonly string[];
}

export interface SpellSession {
  /** Every misspelling in `input.source`, in order. Reuses each unit's tokens by key and each word's verdict. */
  check(input: CheckInput): Misspelling[];
  suggest(word: string): string[];
  /** For tests: units tokenized and words sent to the checker since the last call. */
  work(): { units: number; words: number };
}

/** The most entries each cache keeps; the least recently used goes first. */
export interface SessionLimits {
  /** Unit keys whose tokens are kept. */
  units: number;
  /** Words whose verdict is kept. */
  words: number;
}

const LIMITS: SessionLimits = { units: 20_000, words: 200_000 };

/** A Map that keeps at most `limit` entries, dropping the least recently used. */
class Bounded<V> {
  readonly #map = new Map<string, V>();
  constructor(readonly limit: number) {}

  get(key: string): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      // Moved to the end: Map keeps insertion order, so the first key is the oldest.
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.#map.set(key, value);
    if (this.#map.size > this.limit) {
      this.#map.delete(this.#map.keys().next().value as string);
    }
  }
}

const LETTER = /\p{L}/gu;
/**
 * One or two letters (`e.g.`'s pieces, `'n'`, `'em`, `ok`): never marked, since a missed check is
 * better than a false mark.
 */
const isTiny = (word: string) => (word.match(LETTER)?.length ?? 0) <= 2;

export function createSpellSession(checker: Checker, limits: SessionLimits = LIMITS): SpellSession {
  /** Each unit's tokens, offsets from the unit's start. */
  const tokens = new Bounded<Token[]>(limits.units);
  const verdicts = new Bounded<boolean>(limits.words);
  let work = { units: 0, words: 0 };

  const tokensOf = (unit: Unit): Token[] => {
    let found = tokens.get(unit.key);
    if (found === undefined) {
      found = tokenize(unit.text).filter((t) => !isTiny(t.word));
      tokens.set(unit.key, found);
      work.units++;
    }
    return found;
  };

  const correct = (word: string): boolean => {
    let verdict = verdicts.get(word);
    if (verdict === undefined) {
      verdict = checker.correct(word);
      verdicts.set(word, verdict);
      work.words++;
    }
    return verdict;
  };

  return {
    check({ source, kind, notes, mine }) {
      let units: Unit[];
      let known: Set<string>;
      if (kind === 'fountain') {
        const doc = parse(source);
        units = fountainUnits(doc, { notes });
        known = knownSet(harvestedWords(doc), scriptDictionary(doc), mine);
      } else {
        units = markdownUnits(source);
        known = knownSet(mine);
      }
      const out: Misspelling[] = [];
      for (const unit of units) {
        for (const token of tokensOf(unit)) {
          if (isKnown(token.word, known) || correct(token.word)) continue;
          out.push({ from: unit.from + token.from, to: unit.from + token.to, word: token.word });
        }
      }
      // A note is its own unit after its block's, so the order is the source's only once sorted.
      return out.sort((a, b) => a.from - b.from);
    },
    suggest(word) {
      return checker.suggest(word);
    },
    work() {
      const done = work;
      work = { units: 0, words: 0 };
      return done;
    },
  };
}
