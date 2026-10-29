// The words of a stretch of text worth checking (Phase 2 design §12; Plan D, Calls 6 and 21).
// Offsets are UTF-16 code units, as the source's are, so a token maps straight back onto it.

export interface Token {
  from: number;
  to: number;
  /**
   * The source text from `from` to `to` with ’ read as ' and any `*` inside the word removed, so
   * `un*believ*able` is `unbelievable`: its length may differ from `to - from`.
   */
  word: string;
  /**
   * When the word is one part of a hyphenated compound (`walkie-talkie`, `B-roll`), the whole
   * compound, read as `word` is (`*`s removed, ’ as '); absent otherwise.
   */
  compound?: string;
}

/** A whitespace-delimited chunk. */
const CHUNK = /\S+/gu;
/**
 * Letters, marks, and digits, with apostrophes or emphasis `*`s only between them (`un*believ*able`
 * is one word). A hyphen or `_` ends one, so `snake_case` is two.
 */
const WORD = /[\p{L}\p{M}\p{N}]+(?:(?:['’]|\*+)[\p{L}\p{M}\p{N}]+)*/gu;
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
 * letter. A hyphenated word is its parts, each with the whole as its `compound` (two words joined
 * by one `-`, with any emphasis `*`s beside it; `--`, a dash, or a hyphen at an edge joins nothing).
 */
export function tokenize(text: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  for (const chunk of text.matchAll(CHUNK)) {
    if (isAddress(chunk[0])) continue;
    const matches = [...chunk[0].matchAll(WORD)];
    // Each run of matches joined by single hyphens, as [first, last] indices into `matches`.
    const runOf: number[] = [];
    let first = 0;
    matches.forEach((match, i) => {
      if (i > 0) {
        const before = matches[i - 1] as RegExpExecArray;
        const between = chunk[0].slice(before.index + before[0].length, match.index);
        if (between.replaceAll('*', '') !== '-') first = i;
      }
      runOf.push(first);
    });
    const compoundOf = (i: number): string | undefined => {
      const start = runOf[i] as number;
      let end = i;
      while (end + 1 < matches.length && runOf[end + 1] === start) end++;
      if (start === end) return undefined;
      const a = matches[start] as RegExpExecArray;
      const b = matches[end] as RegExpExecArray;
      return chunk[0]
        .slice(a.index, b.index + b[0].length)
        .replaceAll('*', '')
        .replaceAll('’', "'");
    };
    matches.forEach((match, i) => {
      const word = match[0].replaceAll('*', '').replaceAll('’', "'");
      if (DIGIT.test(word) || !LATIN.test(word) || isShortCapitals(word)) return;
      const from = offset + chunk.index + match.index;
      const compound = compoundOf(i);
      tokens.push({ from, to: from + match[0].length, word, ...(compound && { compound }) });
    });
  }
  return tokens;
}

/**
 * The lowercased forms a known-words set is asked about: the word; without a final 's (or ’s), or a
 * plural possessive's final ' (`Halvorsens'` as `halvorsens`); then that as a plural, without a
 * final `s`, or `es` both ways (`Halvorsens` as `halvorsen`, `Velloxes` as `velloxe` and `vellox`).
 * A word of three letters or fewer is only itself.
 */
export function lookupForms(word: string): string[] {
  const lower = word.toLowerCase().replaceAll('’', "'");
  const forms = [lower];
  if (lower.length <= 3) return forms;
  let base = lower;
  if (base.endsWith("'s")) base = base.slice(0, -2);
  else if (base.endsWith("s'")) base = base.slice(0, -1);
  if (base !== lower) forms.push(base);
  if (base.length <= 3) return forms;
  if (base.endsWith('es')) forms.push(base.slice(0, -1), base.slice(0, -2));
  else if (base.endsWith('s')) forms.push(base.slice(0, -1));
  return forms;
}
