// The words of a stretch of text worth checking (Phase 2 design §12; Plan D, Calls 6 and 21).
// Offsets are UTF-16 code units, as the source's are, so a token maps straight back onto it.

export interface Token {
  from: number;
  to: number;
  /** The source text with ’ read as '. */
  word: string;
}

/** A whitespace-delimited chunk. */
const CHUNK = /\S+/gu;
/** Letters, marks, and digits, with apostrophes only between them. A hyphen, `*`, or `_` ends one. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const DIGIT = /\p{N}/u;
const LATIN = /\p{Script=Latin}/u;
const LETTER = /\p{L}/gu;
const LOWER = /\p{Ll}/u;

/** Punctuation around a chunk, such as the parentheses or the full stop around an address. */
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
/** `name.example.org`: dotted labels ending in a top-level domain of 2–6 letters. */
const DOMAIN = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[A-Za-z]{2,6}$/u;

/** A web or e-mail address: never checked, whole. */
function isAddress(chunk: string): boolean {
  if (chunk.includes('://') || /\p{L}@\p{L}/u.test(chunk)) return true;
  const bare = chunk.replace(EDGES, '');
  return /^www\./iu.test(bare) || DOMAIN.test(bare);
}

/** An all-capital word of three letters or fewer, such as `INT`, `TV`, or `I`. */
function isShortCapitals(word: string): boolean {
  const letters = word.match(LETTER)?.length ?? 0;
  return letters <= 3 && !LOWER.test(word);
}

/**
 * The words of `text` to check, offset by `offset`. Leaves out: a word with a digit; a whole web
 * or e-mail address (a whitespace-delimited chunk with `://`, `www.`, a letter@letter, or a dotted
 * domain ending in 2–6 letters); an all-capital word of 3 letters or fewer; a word with no Latin
 * letter. A hyphenated word is its parts.
 */
export function tokenize(text: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  for (const chunk of text.matchAll(CHUNK)) {
    if (isAddress(chunk[0])) continue;
    for (const match of chunk[0].matchAll(WORD)) {
      const word = match[0];
      if (DIGIT.test(word) || !LATIN.test(word) || isShortCapitals(word)) continue;
      const from = offset + chunk.index + match.index;
      tokens.push({ from, to: from + word.length, word: word.replaceAll('’', "'") });
    }
  }
  return tokens;
}

/** The lowercased forms a known-words set is asked about: the word, then without a final 's (or ’s). */
export function lookupForms(word: string): string[] {
  const lower = word.toLowerCase().replaceAll('’', "'");
  return lower.endsWith("'s") && lower.length > 2 ? [lower, lower.slice(0, -2)] : [lower];
}
