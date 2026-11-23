/**
 * Words a period after doesn't end a sentence (`Dr. Vance`), lowercased. The scene summaries'
 * list (`@drafter/story-atlas`), made longer.
 */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'st',
  'jr',
  'sr',
  'mt',
  'fr',
  'prof',
  'capt',
  'sgt',
  'lt',
  'col',
  'gen',
  'sen',
  'rev',
  'vs',
  'etc',
]);

const STOPS = new Set(['.', '!', '?', '…']);
/** What may close a sentence after its stop: quotes and brackets. */
const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']']);
/** What can start a sentence: a capital, a digit, an opening quote or bracket, or a dash. */
const STARTER = /^[\p{Lu}\p{Lt}\p{N}"'“‘«([¿¡\-–—―]/u;
const LETTER = /\p{L}/u;

/** The longest word a period can follow without ending a sentence, in letters: `capt`, `prof`. */
const LONGEST = 4;
/** How far back from the first place a sentence's stop is looked for, in characters. */
const REACH = 8;

/** Whether the period at `i` closes an abbreviation or an initial (`Dr.`, `J.`). */
function abbreviation(text: string, i: number): boolean {
  let from = i;
  // One letter more than any abbreviation has: a longer word is none of them.
  while (from > 0 && i - from <= LONGEST && LETTER.test(text[from - 1] as string)) from--;
  const word = text.slice(from, i);
  if (word === '' || word.length > LONGEST) return false;
  // A capital of two code units (an astral letter) is one letter too.
  if (Array.from(word).length === 1) return word !== word.toLowerCase();
  return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * Where sentences end in a line of text, when another sentence follows: each place is just past a
 * sentence's stop (`.`, `!`, `?`, `…`, or several) and any quote or bracket that closes it. A stop
 * ends a sentence when a space follows and then something a sentence can start with; a lone period
 * after a title, an abbreviation, or an initial doesn't (`Dr. Vance`, `etc.`, `J. Edgar`).
 *
 * Only places after `from` and up to `to` are given, and only the text around them is read: no
 * run of marks, brackets, letters or spaces is followed past `to`, or more than a few characters
 * back from `from`. So a page's worth of a very long paragraph costs a page's worth of work,
 * whatever the paragraph is made of. The end of the text is never one of the places: nothing
 * follows it, and the caller knows where it is.
 */
export function sentenceEnds(text: string, from = 0, to = text.length): number[] {
  const out: number[] = [];
  const last = Math.min(to, text.length);
  // A sentence that ends just after `from` may have its stop before it.
  let i = Math.max(0, from);
  const back = Math.max(0, i - REACH);
  while (i > back && (STOPS.has(text[i - 1] as string) || CLOSERS.has(text[i - 1] as string))) i--;
  for (; i < last; i++) {
    if (!STOPS.has(text[i] as string)) continue;
    let end = i + 1;
    while (end <= last && STOPS.has(text[end] as string)) end++;
    const alone = end === i + 1 && text[i] === '.';
    while (end <= last && CLOSERS.has(text[end] as string)) end++;
    // The run goes on past the last place: its end is not one of those asked for.
    if (end > last) break;
    let next = end;
    while (text[next] === ' ') next++;
    const follows = next > end && next < text.length && STARTER.test(text.slice(next, next + 2));
    if (follows && end > from && !(alone && abbreviation(text, i))) out.push(end);
    i = end - 1;
  }
  return out;
}
