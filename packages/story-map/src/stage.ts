import {
  type Cast,
  matchNames,
  type NameMap,
  placeOf,
  sceneBlocks,
  TIMES_OF_DAY,
  tokens,
} from '@drafter/cast';
import type { Block, Doc } from '@drafter/fountain';
import { noteEntries, wholeMarkOf } from '@drafter/notes';
import type { Scene, SceneIndex, Section } from '@drafter/outline';
import type { Template } from '@drafter/templates';
import { isStub } from './gaps';
import { sentenceEnd } from './summaries';
import type { MapAct, MapCharacter, MapPair, StageLine } from './types';
import { placeWords } from './words';

// A play's own parts (story-map design §5.1; Calls 16, 27, 28): the interval, each scene's
// setting, who's on stage from when to when, the sentence that says who moves, and the pairs who
// share the stage most. Every scan is one pass over the writer's text.

/** The acts: the top-level sections (the smallest depth used), in order. */
export function topSections(index: SceneIndex): Section[] {
  if (index.sections.length === 0) return [];
  const depth = Math.min(...index.sections.map((s) => s.depth));
  return index.sections.filter((s) => s.depth === depth);
}

/**
 * The interval (Call 27): a play of two acts or more has one, after Act 1. The first
 * `[[Interval]]` note moves it to the end of the act that holds it (a note before the first act is
 * Act 1's); none comes after the last act, so a mark there means none. Any `[[No interval]]`
 * turns it off. The caller asks only for a play: a screenplay never has one.
 */
export function intervalOf(
  doc: Doc,
  index: SceneIndex,
  acts: readonly MapAct[],
): { afterAct: number } | null {
  if (acts.length < 2) return null;
  const sections = topSections(index);
  let first: number | null = null;
  for (const entry of noteEntries(doc)) {
    const mark = wholeMarkOf(entry.note);
    if (mark === 'no-interval') return null;
    if (mark === 'interval' && first === null) first = entry.span.from;
  }
  if (first === null) return { afterAct: 1 };
  let act = 1;
  sections.forEach((section, a) => {
    if (section.span.from <= (first as number)) act = a + 1;
  });
  return act < acts.length ? { afterAct: act } : null;
}

/** Words that bring a character on: whole words, any case. "comes in" is two. */
const ENTER = new Set(['enters', 'enter', 'appears', 'arrives']);
/** Words that take a character off. "goes out" starts with "goes". */
const LEAVE = new Set(['exits', 'exit', 'leaves', 'goes']);

type Verb = 'enter' | 'leave' | 'all-leave';

/** The verbs in a sentence's words (lowercased), by word index. */
function verbsOf(words: readonly string[]): Array<{ at: number; verb: Verb }> {
  const out: Array<{ at: number; verb: Verb }> = [];
  for (let w = 0; w < words.length; w++) {
    const word = words[w] as string;
    const next = words[w + 1];
    if (word === 'exeunt' || (word === 'all' && (next === 'exit' || next === 'exeunt'))) {
      out.push({ at: w, verb: 'all-leave' });
      if (word === 'all') w++;
    } else if (ENTER.has(word) || (word === 'comes' && next === 'in')) {
      out.push({ at: w, verb: 'enter' });
    } else if (LEAVE.has(word)) {
      out.push({ at: w, verb: 'leave' });
    }
  }
  return out;
}

/** Whether the word at `at` in `text` is in capitals: two cased letters or more, none small. */
function capitalsAt(text: string, at: number): boolean {
  let cased = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i] as string;
    if (!/[\p{L}\p{M}]/u.test(c)) break;
    if (c !== c.toUpperCase()) return false;
    if (c !== c.toLowerCase()) cased++;
  }
  return cased >= 2;
}

/** A block's printed lines. */
const printedLines = (block: Block) =>
  block.lines
    .filter((line) => !line.transparent)
    .map((line) => line.inline.map((run) => run.text).join(''));

/** The blocks that print, for the scene's count of lines. */
const UNPRINTED = new Set(['section', 'synopsis', 'note', 'boneyard', 'page_break']);

/**
 * Who's on stage in the scene at `scene` (Call 28), from when to when, as shares of the scene's
 * lines (each printed line of each block after the heading counts one). `names` is the map of
 * `cast.characters`, in their order, with every spelling (`word: false`), and each line's
 * `character` is a row of `cast.characters`.
 *
 * A character arrives at the earliest of their first speech, their name in capitals in a stage
 * direction, or a direction that names them (in any case) with "enters", "comes in", "appears",
 * or "arrives" in the same sentence. They leave at the end of a line that names them with "exits",
 * "leaves", "goes", or "goes out", or else stay to the end; "Exeunt" and "All exit" take off
 * everyone on stage. Someone who leaves before arriving was there from the start. After leaving, a
 * speech or an "enters" brings them back, and the span runs to their last exit. A name takes the
 * first verb after it in its sentence, before the next name, else the last verb before it
 * ("Enter PELL").
 */
export function stageLines(
  doc: Doc,
  index: SceneIndex,
  scene: number,
  names: NameMap,
  cast: Cast,
): StageLine[] {
  const here = index.scenes[scene];
  const [start, end] = sceneBlocks(index, doc)[scene] ?? [0, 0];
  if (!here) return [];
  const rowOf = new Map(cast.characters.map((c, r) => [c.key, r]));
  const cueRow = new Map<number, number>();
  for (const speech of here.speeches) {
    const row = rowOf.get(speech.name.toUpperCase());
    if (row !== undefined) cueRow.set(speech.block, row);
  }
  let total = 0;
  for (let b = start; b < end; b++) {
    const block = doc.blocks[b] as Block;
    if (!UNPRINTED.has(block.kind)) total += printedLines(block).length;
  }
  if (total === 0) return [];

  const spans = new Map<number, { from: number; to: number; on: boolean }>();
  const arrive = (row: number, at: number, again: boolean) => {
    const span = spans.get(row);
    if (!span) spans.set(row, { from: at, to: 1, on: true });
    else if (again && !span.on) span.on = true;
  };
  const leave = (row: number, at: number) => {
    const span = spans.get(row) ?? { from: 0, to: 1, on: true };
    if (!span.on) return;
    span.on = false;
    span.to = at;
    spans.set(row, span);
  };

  let line = 0;
  for (let b = start; b < end; b++) {
    const block = doc.blocks[b] as Block;
    if (UNPRINTED.has(block.kind)) continue;
    const lines = printedLines(block);
    const row = cueRow.get(b);
    if (block.kind === 'character' && row !== undefined) arrive(row, line / total, true);
    if (block.kind === 'action') {
      // The lines joined by spaces, and where each starts, to place a sentence on its line.
      const starts: number[] = [];
      let text = '';
      for (const l of lines) {
        if (text !== '') text += ' ';
        starts.push(text.length);
        text += l;
      }
      const lineAt = (offset: number) => {
        let k = 0;
        while (k + 1 < starts.length && (starts[k + 1] as number) <= offset) k++;
        return k;
      };
      for (let from = 0; from < text.length; ) {
        const to = sentenceEnd(text, from);
        const sentence = text.slice(from, to);
        const atStart = (line + lineAt(from)) / total;
        const atEnd = (line + lineAt(Math.max(from, to - 1)) + 1) / total;
        actOn(sentence, names, atStart, atEnd, arrive, leave, () => {
          for (const [r, span] of spans) if (span.on) leave(r, atEnd);
        });
        from = to > from ? to : text.length;
      }
    }
    line += lines.length;
  }
  return [...spans]
    .sort(([a], [b]) => a - b)
    .map(([character, span]) => ({
      character,
      from: Math.min(1, Math.max(0, span.from)),
      to: Math.min(1, Math.max(span.from, span.on ? 1 : span.to)),
    }));
}

/** What one sentence of a stage direction does to who's on stage. */
function actOn(
  sentence: string,
  names: NameMap,
  atStart: number,
  atEnd: number,
  arrive: (row: number, at: number, again: boolean) => void,
  leave: (row: number, at: number) => void,
  allLeave: () => void,
): void {
  const words = tokens(sentence);
  const lower = words.map((w) => w.word.toLowerCase());
  const verbs = verbsOf(lower);
  const found: Array<{ row: number; word: number; capitals: boolean }> = [];
  let w = 0;
  matchNames(sentence, names, (row, at) => {
    while (w < words.length && (words[w] as { at: number }).at < at) w++;
    found.push({ row, word: w, capitals: capitalsAt(sentence, at) });
  });
  for (let i = 0; i < found.length; i++) {
    const name = found[i] as (typeof found)[number];
    const nextName = found[i + 1]?.word ?? Number.POSITIVE_INFINITY;
    const after = verbs.find((v) => v.at > name.word && v.at < nextName && v.verb !== 'all-leave');
    const before = [...verbs].reverse().find((v) => v.at < name.word && v.verb !== 'all-leave');
    const verb = after?.verb ?? before?.verb ?? null;
    if (verb === 'enter') arrive(name.row, atStart, true);
    else if (name.capitals) arrive(name.row, atStart, false);
    if (verb === 'leave') leave(name.row, atEnd);
  }
  if (verbs.some((v) => v.verb === 'all-leave')) allLeave();
}

/** By the quarter of the scene (Call 28). */
function quarter(at: number): string {
  if (at < 0.25) return 'early';
  if (at < 0.5) return 'halfway';
  if (at < 0.75) return 'late';
  return 'near the end';
}

/**
 * The sentence under a scene's stage lines (Call 28): for each line that isn't there throughout,
 * "<Name> enters halfway", "<Name> leaves near the end", or "<Name> comes in, then leaves",
 * joined with ". " (no stop at the end); null when nobody moves. `names` by `line.character`.
 */
export function movesSentence(
  lines: readonly StageLine[],
  names: readonly string[],
): string | null {
  const out: string[] = [];
  for (const line of lines) {
    const name = names[line.character] ?? '';
    const enters = line.from > 0;
    const leaves = line.to < 1;
    if (enters && leaves) out.push(`${name} comes in, then leaves`);
    else if (enters) out.push(`${name} enters ${quarter(line.from)}`);
    else if (leaves) out.push(`${name} leaves ${quarter(line.to)}`);
  }
  return out.length === 0 ? null : out.join('. ');
}

/** A setting's words at most, from a first line. */
const SETTING_WORDS = 8;
/** "Scene 4", "scene two": a title that is only a number. */
const SCENE_NUMBER = /^scene\s+[\p{L}\p{N}]+$/iu;
/** "Scene 4: The garden": the label before a title. Anchored, so linear. */
const SCENE_LABEL = /^scene\s+[\p{L}\p{N}]+\s*[:.\-–—]\s*/iu;
const TIMES = new Set(TIMES_OF_DAY.map((t) => t.toLowerCase()));

const capitalised = (text: string) => {
  const first = Array.from(text)[0] ?? '';
  return first.toUpperCase() + text.slice(first.length);
};

/** "The garden at dusk", "The garden, evening": the place, and the time split off its end. */
function splitTime(text: string): { name: string; time: string | null } {
  const words = tokens(text);
  const last = words.at(-1);
  if (!last || words.length < 2 || !TIMES.has(last.word.toLowerCase())) {
    return { name: text, time: null };
  }
  let cut = last.at;
  const before = words[words.length - 2] as (typeof words)[number];
  const joiner = before.word.toLowerCase();
  if (joiner === 'at' || joiner === 'in' || joiner === 'by') cut = before.at;
  else if (joiner === 'the' && ['in', 'at'].includes(words.at(-3)?.word.toLowerCase() ?? '')) {
    cut = (words.at(-3) as (typeof words)[number]).at;
  } else if (!/[,\-–—]/u.test(last.gap)) return { name: text, time: null };
  // Without the comma or dash before the time; a loop, so linear.
  let name = text.slice(0, cut);
  while (name !== '' && /[\s,\-–—]/u.test(name.at(-1) as string)) name = name.slice(0, -1);
  return name === '' ? { name: text, time: null } : { name, time: last.word };
}

/** Whether `text` names someone in capitals: a word of two capital letters or more, none small. */
function hasCapitalsWord(text: string): boolean {
  return tokens(text).some((t) => {
    const letters = Array.from(t.word).filter((c) => c.toLowerCase() !== c.toUpperCase());
    return letters.length >= 2 && letters.every((c) => c !== c.toLowerCase());
  });
}

/**
 * A play's setting for `scene` (Call 16, refined): the place its heading names (`placeOf`); else
 * its `##` title when that is more than "Scene 4" (a "Scene 4:" label before it dropped); else the
 * first sentence of its first stage direction when that has at most 8 words and names nobody in
 * capitals. A time at the end ("at dusk", ", evening") is split off as the time. A setting that
 * starts "The same" is `before`, the setting of the scene before. Null for none of these.
 */
export function settingOf(
  scene: Scene,
  doc: Doc,
  template: Template,
  before: string | null,
): { name: string; time: string | null } | null {
  const place = placeOf(scene, doc, template);
  if (place.location) return { name: placeWords(place.location), time: place.time };
  let text = '';
  const title = scene.heading.trim();
  if (!isStub(scene) && title !== '' && !SCENE_NUMBER.test(title)) {
    text = title.replace(SCENE_LABEL, '').trim();
  }
  if (text === '') {
    for (let b = scene.block + 1; b < doc.blocks.length; b++) {
      const block = doc.blocks[b] as Block;
      if (block.span.from >= scene.span.to) break;
      if (block.kind !== 'action') continue;
      const flat = printedLines(block).join(' ').replace(/\s+/g, ' ').trim();
      const first = flat.slice(0, sentenceEnd(flat)).trim();
      const bare = first.replace(/[.!?…]+$/u, '').trim();
      if (bare !== '' && tokens(bare).length <= SETTING_WORDS && !hasCapitalsWord(bare)) {
        text = bare;
      }
      break;
    }
  }
  if (text === '') return null;
  const { name, time } = splitTime(text);
  const words = tokens(name).map((t) => t.word.toLowerCase());
  if (words[0] === 'the' && words[1] === 'same') {
    return before === null ? null : { name: before, time };
  }
  return { name: capitalised(name), time };
}

/**
 * The pairs (Call 28): a play's leads ranked by the scenes they share, most first, up to 8, none
 * that share no scene; a screenplay's every pair of leads, in order (the half-matrix). `a` comes
 * before `b` in `characters`.
 */
export function pairsOf(
  kind: 'play' | 'screenplay',
  characters: readonly MapCharacter[],
  cast: Cast,
): MapPair[] {
  const leads = characters.flatMap((c, i) => (c.lead ? [i] : []));
  const out: MapPair[] = [];
  for (let x = 0; x < leads.length; x++) {
    const a = leads[x] as number;
    const shared = cast.figures.get((characters[a] as MapCharacter).key)?.sharedWith ?? [];
    for (let y = x + 1; y < leads.length; y++) {
      const b = leads[y] as number;
      const key = (characters[b] as MapCharacter).key;
      out.push({ a, b, scenes: shared.find((s) => s.key === key)?.scenes ?? 0 });
    }
  }
  if (kind === 'screenplay') return out;
  // Stable: ties keep the leads' order.
  return out
    .filter((p) => p.scenes > 0)
    .sort((p, q) => q.scenes - p.scenes)
    .slice(0, 8);
}
