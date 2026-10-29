import nspell from 'nspell';

// The nspell wrapper (technical design §10; Plan D, Call 21). Loading a dictionary reads its
// whole .aff and .dic, so a checker is made once per language and reused for every check.

export interface Checker {
  /** True when nspell knows `word`, or knows it with its accents taken off (`café` as `cafe`). */
  correct(word: string): boolean;
  /** At most `limit` suggestions, in nspell's order (the likeliest first). */
  suggest(word: string, limit?: number): string[];
}

/** How many suggestions the spelling menu offers. */
export const SUGGESTION_LIMIT = 5;

const MARKS = /\p{M}/gu;

/** `word` without its accents: decomposed (NFD), its combining marks removed. */
function withoutAccents(word: string): string {
  return word.normalize('NFD').replace(MARKS, '');
}

/** nspell reads text or a Node Buffer; a plain Uint8Array (as `fetch` gives) is decoded first. */
const asText = (data: Uint8Array | string) =>
  typeof data === 'string' ? data : new TextDecoder().decode(data);

export function createChecker(dictionary: {
  aff: Uint8Array | string;
  dic: Uint8Array | string;
}): Checker {
  const spell = nspell(asText(dictionary.aff), asText(dictionary.dic));
  return {
    correct(word) {
      if (spell.correct(word)) return true;
      const bare = withoutAccents(word);
      return bare !== word && spell.correct(bare);
    },
    suggest(word, limit = SUGGESTION_LIMIT) {
      return spell.suggest(word).slice(0, limit);
    },
  };
}
