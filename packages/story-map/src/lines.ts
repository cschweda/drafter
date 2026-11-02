import type { Block, Doc } from '@drafter/fountain';
import { type NoteEntry, noteEntries, wholeMarkOf } from '@drafter/notes';
import type { SceneIndex } from '@drafter/outline';

// Lines of dialogue (story-map design §3.1, Calls 4–6): one speech under one cue, cleaned for a
// reader who has never seen a script, and picked here and there through the scenes. Never dual
// dialogue, never an exchange. The writer steers the picks with `[[Quote]]` and `[[No quote]]`.

/** One speech that passes the length rule. */
export interface QuoteCandidate {
  /** Its scene's index in `index.scenes`. */
  scene: number;
  /** The cue's block. */
  cue: number;
  /** The speaker's key: the cue's name in capitals. */
  character: string;
  text: string;
  /** A `[[Quote]]` or `[[No quote]]` note in the speech, or on the line just under it. */
  marked: 'quote' | 'no-quote' | null;
  /** 3 for 6–12 words, 1 for 3–5 or 13–18; 2 more for its scene's last speech. */
  score: number;
}

/** The most lines on the page. */
const MOST = 12;
/** Scenes between two picks, at least. */
const APART = 3;
/** Lines a speaker may have, at most. */
const PER_SPEAKER = 3;
/** A line's characters, at most, and a marked line's. */
const WIDE = 110;
const WIDE_MARKED = 160;

/** What a speech is made of after its cue, as the layout groups it. */
const PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);
/** Blocks that print nothing: a `^` speech still pairs with the speech before them. */
const QUIET = new Set<Block['kind']>(['note', 'boneyard', 'synopsis']);
/** Words a picked line never starts with. */
const FILLERS = new Set(['and', 'but', 'so', 'yeah', 'well', 'oh', 'um', 'no']);
/** What a picked line ends with: a sentence's end or a closing quote. */
const ENDS = new Set(['.', '!', '?', '”', '"', '’']);

/** On the line just after the block before it: no blank line between. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

/** The last block of the speech whose cue is `cue`: the cue and the parts right after it. */
function speechEnd(doc: Doc, cue: number): number {
  let end = cue;
  for (let b = cue + 1; b < doc.blocks.length; b++) {
    const block = doc.blocks[b] as Block;
    if (!PARTS.has(block.kind) || !adjacent(block)) break;
    end = b;
  }
  return end;
}

/**
 * The speech's printed dialogue lines (`Line.inline`), joined by spaces, its spaces collapsed:
 * no cue or extension, no parentheticals, no notes or boneyard, no emphasis marks.
 */
export function cleanSpeech(doc: Doc, cue: number): string {
  const parts: string[] = [];
  const end = speechEnd(doc, cue);
  for (let b = cue + 1; b <= end; b++) {
    const block = doc.blocks[b] as Block;
    if (block.kind !== 'dialogue') continue;
    for (const line of block.lines) {
      if (line.transparent) continue;
      parts.push(line.inline.map((run) => run.text).join(''));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Every cue that is either side of a dual-dialogue pair, as the layout pairs them. */
function dualCues(doc: Doc): Set<number> {
  const dual = new Set<number>();
  /** The last speech's cue, while nothing that prints has come since. */
  let last: number | null = null;
  for (let b = 0; b < doc.blocks.length; b++) {
    const block = doc.blocks[b] as Block;
    if (block.kind === 'character') {
      if (block.sem.dual) {
        // Paired or not, a `^` speech is never a line on its own.
        dual.add(b);
        if (last !== null && !dual.has(last)) dual.add(last);
      }
      last = b;
      const end = speechEnd(doc, b);
      b = end;
      continue;
    }
    if (!QUIET.has(block.kind)) last = null;
  }
  return dual;
}

/** The whole-body quote mark of each speech, by its cue: `[[No quote]]` wins over `[[Quote]]`. */
function marksOf(doc: Doc, entries: readonly NoteEntry[], cues: readonly number[]) {
  // A note's speech: the one whose blocks hold it, or the one just above it when it is alone on
  // the line after the speech.
  const owner = new Map<number, number>();
  for (const cue of cues) {
    const end = speechEnd(doc, cue);
    for (let b = cue; b <= end; b++) owner.set(b, cue);
    const after = doc.blocks[end + 1];
    if (after?.kind === 'note' && adjacent(after)) owner.set(end + 1, cue);
  }
  const marks = new Map<number, 'quote' | 'no-quote'>();
  for (const entry of entries) {
    const mark = wholeMarkOf(entry.note);
    if (mark !== 'quote' && mark !== 'no-quote') continue;
    const cue = owner.get(entry.block);
    if (cue === undefined) continue;
    // A note block after the speech counts only when it is alone on its line.
    if (doc.blocks[entry.block]?.kind === 'note' && !entry.alone) continue;
    if (marks.get(cue) !== 'no-quote') marks.set(cue, mark);
  }
  return marks;
}

/** The length rule (Call 4): 3–18 words, ≤ 110 characters (160 marked), a sentence's end, no filler. */
function passes(text: string, marked: boolean): boolean {
  if (text === '') return false;
  const words = text.split(' ');
  if (words.length < 3 || words.length > 18) return false;
  if (Array.from(text).length > (marked ? WIDE_MARKED : WIDE)) return false;
  if (!ENDS.has(text.at(-1) as string)) return false;
  const first = (words[0] as string).toLowerCase().replace(/[^\p{L}\p{N}]+$/u, '');
  return !FILLERS.has(first);
}

const baseScore = (text: string) => {
  const words = text.split(' ').length;
  return words >= 6 && words <= 12 ? 3 : 1;
};

/**
 * Every speech in a scene that passes the length rule, in script order: never a dual-dialogue
 * cue's. A `[[No quote]]` speech is listed, marked, so the dialog can show it; it is never picked.
 */
export function quoteCandidates(doc: Doc, index: SceneIndex): QuoteCandidate[] {
  const dual = dualCues(doc);
  const cues = index.scenes.flatMap((scene) => scene.speeches.map((s) => s.block));
  const marks = marksOf(doc, noteEntries(doc), cues);
  const out: QuoteCandidate[] = [];
  index.scenes.forEach((scene, s) => {
    const lastCue = scene.speeches.at(-1)?.block;
    for (const speech of scene.speeches) {
      if (dual.has(speech.block)) continue;
      const marked = marks.get(speech.block) ?? null;
      const text = cleanSpeech(doc, speech.block);
      if (!passes(text, marked === 'quote')) continue;
      out.push({
        scene: s,
        cue: speech.block,
        character: speech.name.toUpperCase(),
        text,
        marked,
        score: baseScore(text) + (speech.block === lastCue ? 2 : 0),
      });
    }
  });
  return out;
}

/** How many lines a script of `scenes` gets by the rule of four: at least 1, at most 12. */
export const lineTarget = (scenes: number) => Math.min(MOST, Math.max(1, Math.round(scenes / 4)));

/**
 * The lines the page shows, in scene order (Call 5). Every `[[Quote]]` line is taken first (the
 * first in its scene, up to 12). Then the scenes are cut into as many even stretches as the rule of
 * four allows, and each stretch without a marked line takes its best line by score (2 more for a
 * speaker with no line yet; ties to the earlier scene, then the earlier speech), when it is at
 * least 3 scenes from every pick and its speaker has fewer than 3. Last, each act with a
 * candidate but no line takes its best one, by the same two rules, while there are fewer than 12.
 * `actOf` gives a scene's act, or null. The same candidates give the same picks.
 */
export function pickQuotes(
  candidates: readonly QuoteCandidate[],
  scenes: number,
  actOf: (scene: number) => number | null,
): QuoteCandidate[] {
  const picks: QuoteCandidate[] = [];
  const taken = new Set<number>();
  const per = new Map<string, number>();
  // Words already on the page: a refrain is picked once.
  const said = new Set<string>();
  const take = (c: QuoteCandidate) => {
    picks.push(c);
    taken.add(c.scene);
    said.add(quoteKey(c.text));
    per.set(c.character, (per.get(c.character) ?? 0) + 1);
  };
  for (const c of candidates) {
    if (picks.length >= MOST) break;
    if (c.marked === 'quote' && !taken.has(c.scene) && !said.has(quoteKey(c.text))) take(c);
  }

  const free = candidates.filter((c) => c.marked === null);
  const fits = (c: QuoteCandidate) =>
    !said.has(quoteKey(c.text)) &&
    (per.get(c.character) ?? 0) < PER_SPEAKER &&
    picks.every((p) => Math.abs(p.scene - c.scene) >= APART);
  /** The best that fits among `list`: by score, a new speaker 2 more; ties to the first. */
  const best = (list: readonly QuoteCandidate[]) => {
    let found: QuoteCandidate | null = null;
    let top = Number.NEGATIVE_INFINITY;
    for (const c of list) {
      if (!fits(c)) continue;
      const score = c.score + (per.has(c.character) ? 0 : 2);
      if (score > top) {
        found = c;
        top = score;
      }
    }
    return found;
  };
  // Candidates in scene order, so a tie goes to the earlier scene.
  const ordered = [...free].sort((a, b) => a.scene - b.scene || a.cue - b.cue);

  const target = lineTarget(scenes);
  for (let k = 0; k < target && picks.length < target; k++) {
    const from = Math.floor((k * scenes) / target);
    const to = Math.floor(((k + 1) * scenes) / target);
    if (picks.some((p) => p.scene >= from && p.scene < to)) continue;
    const found = best(ordered.filter((c) => c.scene >= from && c.scene < to));
    if (found) take(found);
  }

  const acts = new Map<number, QuoteCandidate[]>();
  for (const c of ordered) {
    const act = actOf(c.scene);
    if (act === null) continue;
    const list = acts.get(act) ?? [];
    list.push(c);
    acts.set(act, list);
  }
  for (const act of [...acts.keys()].sort((a, b) => a - b)) {
    if (picks.length >= MOST) break;
    if (picks.some((p) => actOf(p.scene) === act)) continue;
    const found = best(acts.get(act) ?? []);
    if (found) take(found);
  }
  return picks.sort((a, b) => a.scene - b.scene || a.cue - b.cue);
}

/**
 * A line's words for telling repeats apart: lower case, letters and digits only, single spaces.
 * One pass over the text, so linear.
 */
export function quoteKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Each speaker's own best line by the same score (design §4.4): a line whose words `used` doesn't
 * say are elsewhere first, then a `[[Quote]]` line; ties to the earlier. By the speaker's key.
 */
export function signatureLines(
  candidates: readonly QuoteCandidate[],
  used: (c: QuoteCandidate) => boolean = () => false,
): Map<string, QuoteCandidate> {
  const out = new Map<string, QuoteCandidate>();
  const rank = (c: QuoteCandidate) =>
    (used(c) ? 0 : 10_000) + (c.marked === 'quote' ? 1000 : 0) + c.score;
  for (const c of candidates) {
    if (c.marked === 'no-quote') continue;
    const held = out.get(c.character);
    if (!held || rank(c) > rank(held)) out.set(c.character, c);
  }
  return out;
}
