import { matchNames, type NameMap, nameMap, tokens } from '@drafter/cast';
import type { Block, Doc } from '@drafter/fountain';
import { noteEntries, setupsAndPayoffs } from '@drafter/notes';
import type { Scene, SceneIndex, Section } from '@drafter/outline';
import type { MapThread } from './types';
import { titleCase } from './words';

// What happens in each scene, an act's mood, a character's hook, and the threads (story-map
// design §3.2–§3.4, §4.2; Calls 7–9, 13). Every scan is one pass over the writer's text.

/** A scene's line and an act's mood, in words at most. */
const SUMMARY_WORDS = 12;
/** A hook, in words at most. */
const HOOK_WORDS = 8;
/** An age's parenthesis, inside, in characters at most. */
const AGE_CHARS = 12;

/** Words a period after doesn't end a sentence (`Dr. Rhee`), lowercased. */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'st',
  'jr',
  'sr',
  'mt',
  'prof',
  'capt',
  'sgt',
  'lt',
  'col',
  'gen',
  'rev',
  'fr',
]);
/** What may close a sentence after its stop: quotes and brackets. */
const CLOSERS = new Set(['"', '”', "'", '’', ')', ']']);
/** The dashes that set off a phrase. */
const DASHES = new Set(['–', '—', '―']);
/** What a cut at a word drops from its end before the "…". */
const TRAILING = new Set([' ', ',', ';', ':', '-', '–', '—', '―', '…']);
/** A comma or dashes just after a name (or its age), and the spaces after them: anchored, linear. */
const LEAD = /^[,\-–—―][\s,\-–—―]*/u;

const isSpace = (c: string | undefined) => c !== undefined && c.trim() === '';
const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
const isStop = (c: string | undefined) => c === '.' || c === '!' || c === '?';

/** Whether the period at `i` closes an abbreviation or an initial (`Dr.`, `J.`). */
function abbreviation(text: string, i: number): boolean {
  let from = i;
  while (from > 0 && isLetter(text[from - 1])) from--;
  const word = text.slice(from, i);
  if (word === '') return false;
  if (Array.from(word).length === 1) return word !== word.toLowerCase();
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** Where the sentence that starts at `from` ends: just past its stop and any closing quote. */
function sentenceEnd(text: string, from = 0): number {
  for (let i = from; i < text.length; i++) {
    if (!isStop(text[i])) continue;
    let j = i + 1;
    while (j < text.length && isStop(text[j])) j++;
    while (j < text.length && CLOSERS.has(text[j] as string)) j++;
    if (j < text.length && !isSpace(text[j])) {
      i = j - 1;
      continue;
    }
    if (j === i + 1 && text[i] === '.' && abbreviation(text, i)) continue;
    return j;
  }
  return text.length;
}

/** The first sentence of `text`, its spaces collapsed. */
const firstSentence = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.slice(0, sentenceEnd(flat)).trim();
};

/** At most `most` words, cut at a word with "…". */
function clampWords(text: string, most: number): string {
  const words = text.split(' ').filter((w) => w !== '');
  if (words.length <= most) return words.join(' ');
  let cut = words.slice(0, most).join(' ');
  // Without the marks a cut would leave hanging; a loop, not a pattern, so linear.
  while (cut !== '' && TRAILING.has(cut.at(-1) as string)) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** The capitals-only map of `names`: a name counts in the text only in capitals. */
const capitalsMap = (names: Iterable<string>) =>
  nameMap([...names].map((name) => ({ name, word: true })));

/** Each name `map` finds in `text`: where it starts, and just past its last word. */
function nameRuns(
  text: string,
  map: NameMap,
  names: readonly string[],
): Array<{ character: number; from: number; to: number }> {
  const words = tokens(text);
  const out: Array<{ character: number; from: number; to: number }> = [];
  let w = 0;
  matchNames(text, map, (character, at) => {
    while (w < words.length && (words[w] as { at: number }).at < at) w++;
    const length = Math.max(1, tokens(names[character] ?? '').length);
    const last = words[w + length - 1] ?? words[w];
    const to = last ? last.at + last.word.length : at;
    out.push({ character, from: at, to });
  });
  return out;
}

/** An age's parenthesis at `j` (`(71)`, `(late 30s)`): at most 12 characters inside, holding a digit. */
function ageAt(text: string, j: number): { age: string; end: number } | null {
  if (text[j] !== '(') return null;
  const close = text.indexOf(')', j + 1);
  if (close < 0 || close - j - 1 > AGE_CHARS) return null;
  const age = text.slice(j + 1, close).trim();
  return /\p{N}/u.test(age) ? { age, end: close + 1 } : null;
}

/**
 * `text` with the names in capitals in title case (`MARA'S` → `Mara's`), the rest of a name in
 * capitals with them (`ODILE VANCE`). With `ages` false, an age just after a name is left out.
 */
function nameCase(text: string, map: NameMap, names: readonly string[], ages = true): string {
  let out = '';
  let at = 0;
  for (const run of nameRuns(text, map, names)) {
    if (run.from < at) continue;
    const to = pastCapitals(text, run.to);
    out += text.slice(at, run.from) + titleCase(text.slice(run.from, to));
    at = to;
    const s = text.slice(at, at + 2);
    if (s === "'S" || s === '’S') {
      out += `${s[0]}s`;
      at += 2;
    }
    if (!ages) {
      const age = ageAt(text, isSpace(text[at]) ? at + 1 : at);
      if (age) at = age.end;
    }
  }
  return out + text.slice(at);
}

/** A block's printed text, its lines joined by spaces. */
function printed(block: Block): string {
  return block.lines
    .filter((line) => !line.transparent)
    .map((line) => line.inline.map((run) => run.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A scene's line (Call 7): its first synopsis's first sentence, else its first action paragraph's;
 * at most 12 words, cut at a word with "…". `names` (in capitals) in the text become title case.
 * Null for a scene with neither.
 */
export function sceneLine(scene: Scene, doc: Doc, names: ReadonlySet<string>): string | null {
  let text = '';
  for (const synopsis of scene.synopses) {
    const block = doc.blocks[synopsis.block];
    text = block ? printed(block) : '';
    if (text !== '') break;
  }
  for (let b = scene.block + 1; text === '' && b < doc.blocks.length; b++) {
    const block = doc.blocks[b] as Block;
    if (block.span.from >= scene.span.to) break;
    if (block.kind === 'action') text = printed(block);
  }
  if (text === '') return null;
  const list = [...names];
  const line = clampWords(
    nameCase(firstSentence(text), capitalsMap(list), list, false),
    SUMMARY_WORDS,
  );
  return line === '' ? null : line;
}

/** An act's mood (Call 8): its section's first synopsis, before its first scene; first sentence, 12 words. */
export function actMood(section: Section, doc: Doc): string | null {
  for (let b = section.block + 1; b < doc.blocks.length; b++) {
    const block = doc.blocks[b] as Block;
    if (block.span.from >= section.introEnd) break;
    if (block.kind === 'section' || block.kind === 'scene_heading') break;
    if (block.kind !== 'synopsis') continue;
    const text = printed(block);
    if (text !== '') return clampWords(firstSentence(text), SUMMARY_WORDS);
  }
  return null;
}

export interface Hook {
  hook: string | null;
  age: string | null;
}

/** Every speaker's name as first typed, by key: the opening's, each section's, each scene's. */
function speakerNames(index: SceneIndex): Map<string, string> {
  const out = new Map<string, string>();
  const units = [index.opening?.speeches ?? [], ...index.items.map((item) => item.speeches)];
  for (const unit of units) {
    for (const speech of unit) {
      const key = speech.name.toUpperCase();
      if (!out.has(key)) out.set(key, speech.name);
    }
  }
  return out;
}

/** Just past a run of words in capitals after `at` (the rest of a name: `ODILE` `VANCE`). */
function pastCapitals(text: string, at: number): number {
  let i = at;
  for (;;) {
    let j = i;
    while (isSpace(text[j])) j++;
    let k = j;
    while (k < text.length && /[\p{L}\p{M}'’.-]/u.test(text[k] as string)) k++;
    const word = text.slice(j, k).replace(/\.$/, '');
    const letters = Array.from(word).filter((c) => c.toLowerCase() !== c.toUpperCase());
    if (j === i || letters.length < 2 || letters.some((c) => c === c.toLowerCase())) return i;
    i = j + word.length;
  }
}

/** The hook from an introduction: what follows the name at `at` in `text`. */
function hookFrom(text: string, at: number, map: NameMap, names: readonly string[]): Hook {
  let i = pastCapitals(text, at);
  let j = i;
  while (isSpace(text[j])) j++;
  const aged = ageAt(text, j);
  if (aged) i = aged.end;
  const age = aged?.age ?? null;
  const end = sentenceEnd(text, i);
  let rest = text.slice(i, end).trim();
  // Set off by a comma or a dash, the hook is that phrase: up to the next comma or dash.
  const lead = LEAD.exec(rest)?.[0] ?? '';
  rest = rest.slice(lead.length);
  if (lead !== '') {
    for (let k = 0; k < rest.length; k++) {
      const c = rest[k] as string;
      const hyphen =
        c === '-' && (rest[k + 1] === '-' || (isSpace(rest[k - 1]) && isSpace(rest[k + 1])));
      if (c === ',' || DASHES.has(c) || hyphen) {
        rest = rest.slice(0, k);
        break;
      }
    }
  }
  rest = rest.trim().replace(/\.$/, '').trim();
  const hook = rest === '' ? null : clampWords(nameCase(rest, map, names), HOOK_WORDS);
  return { hook, age };
}

/**
 * Every speaker's hook and age (Call 13), by key, from the first action paragraph that names them
 * in capitals: an age from a parenthesis just after the name (at most 12 characters, holding a
 * digit), and the rest of that sentence, or the phrase a comma or dash sets off, at most 8 words.
 */
export function hooksOf(doc: Doc, index: SceneIndex): Map<string, Hook> {
  const byKey = speakerNames(index);
  const keys = [...byKey.keys()];
  const names = keys.map((k) => byKey.get(k) as string);
  const map = capitalsMap(names);
  const out = new Map<string, Hook>();
  for (const block of doc.blocks) {
    if (out.size === keys.length) break;
    if (block.kind !== 'action') continue;
    const text = printed(block);
    for (const run of nameRuns(text, map, names)) {
      const key = keys[run.character] as string;
      if (!out.has(key)) out.set(key, hookFrom(text, run.to, map, names));
    }
  }
  return out;
}

/** One character's hook and age; `key` is their name in capitals. */
export function hookOf(doc: Doc, index: SceneIndex, key: string): Hook {
  return hooksOf(doc, index).get(key) ?? { hook: null, age: null };
}

/**
 * The threads (Call 9): each Setup label from the scene of its first setup to the scene of the
 * first payoff after it (scene numbers, 1-based); `to` null while a setup is unpaid. A note in no
 * scene counts for nothing; a label with no setup in a scene is left out. In scene order.
 */
export function threadsOf(doc: Doc, index: SceneIndex): MapThread[] {
  const sceneAt = (offset: number) => {
    const s = index.scenes.findIndex(
      (scene) => scene.span.from <= offset && offset < scene.span.to,
    );
    return s < 0 ? null : s + 1;
  };
  const out: MapThread[] = [];
  for (const thread of setupsAndPayoffs(noteEntries(doc))) {
    const setup = thread.setups.find((e) => sceneAt(e.span.from) !== null);
    if (!setup) continue;
    const payoff = thread.payoffs.find(
      (e) => e.span.from > setup.span.from && sceneAt(e.span.from) !== null,
    );
    out.push({
      label: thread.label,
      from: sceneAt(setup.span.from) as number,
      to: thread.unpaid || !payoff ? null : sceneAt(payoff.span.from),
    });
  }
  return out.sort((a, b) => a.from - b.from);
}
