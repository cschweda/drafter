import type { Doc } from '@drafter/fountain';
import { type NoteEntry, noteEntries } from '@drafter/notes';
import { type Scene, type SceneIndex, STAGE_STUB, STUB_HEADING, wordsIn } from '@drafter/outline';
import { STORY_MAP_LIMITS } from './limits';
import type { MapAct, MapGaps, MapKind, MapScene, MapStatus, StoryMap } from './types';

// What isn't written yet (story-map design §6; Call 17): an act with no scenes, a planned scene,
// a to-do in a scene, and the planned length, with nothing guessed. The progress read, the
// sentence that names the acts, the status they give by default, and what Finished leaves out.

/** A play's stub heading, without its `##`. */
const STAGE_STUB_TITLE = STAGE_STUB.replace(/^#+\s*/, '');

/** Expand outline's stand-in heading, in a screenplay or a play: it names no place. */
export function isStub(scene: Scene): boolean {
  const heading = scene.heading.trim();
  return heading === STUB_HEADING || heading === STAGE_STUB_TITLE;
}

/**
 * A planned scene (design §6.1.2): no action and no dialogue, and no printed words but the
 * heading's. A heading alone, with a synopsis, or with notes; and Expand outline's stubs.
 */
export function isPlanned(scene: Scene): boolean {
  return (
    scene.timing.spoken === 0 &&
    scene.timing.actionLines === 0 &&
    scene.words <= wordsIn(scene.heading)
  );
}

/** A note headed `TODO:` or tagged `#todo`, and not `#resolved`. */
function isOpenTodo(entry: NoteEntry): boolean {
  const note = entry.note;
  if (!note || note.resolved) return false;
  const head = note.head;
  return (head?.kind === 'category' && head.name === 'todo') || note.tags.includes('todo');
}

/**
 * The open to-dos in the script (each note `todoScenes` counts, wherever it is), as a number: the
 * notes' text never leaves here.
 */
export function openTodos(doc: Doc): number {
  let count = 0;
  for (const entry of noteEntries(doc)) if (isOpenTodo(entry)) count++;
  return count;
}

/**
 * The scenes (0-based) with a to-do: a note headed `TODO:` or tagged `#todo`, not `#resolved`.
 * Only the mark counts; the note's text never leaves here.
 */
export function todoScenes(doc: Doc, index: SceneIndex): Set<number> {
  const out = new Set<number>();
  let s = 0;
  for (const entry of noteEntries(doc)) {
    if (!isOpenTodo(entry)) continue;
    // Entries and scenes are both in source order.
    const at = entry.span.from;
    while (s < index.scenes.length && (index.scenes[s] as Scene).span.to <= at) s++;
    const scene = index.scenes[s];
    if (scene && scene.span.from <= at) out.add(s);
  }
  return out;
}

/** "1, 2 and 3". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type ActState = { kind: 'written' } | { kind: 'under-way'; parts: string[] } | { kind: 'to-come' };

/** What a run of scenes is: written, under way (and why), or still to come. */
function stateOf(
  scenes: readonly number[],
  planned: ReadonlySet<number>,
  todo: ReadonlySet<number>,
  tail: boolean,
): ActState {
  if (scenes.length === 0) return { kind: 'to-come' };
  const p = scenes.filter((s) => planned.has(s)).length;
  const t = scenes.filter((s) => todo.has(s)).length;
  const parts: string[] = [];
  if (p > 0) parts.push(plural(p, 'scene planned', 'scenes planned'));
  if (t > 0) parts.push(`${t} to do`);
  if (tail) parts.push('the ending still to come');
  return parts.length === 0 ? { kind: 'written' } : { kind: 'under-way', parts };
}

/** The written acts, or the acts still to come, together: "Acts 1 and 2 are written." */
function together(numbers: readonly string[], what: string): string[] {
  if (numbers.length === 0) return [];
  return numbers.length === 1
    ? [`Act ${numbers[0]} is ${what}.`]
    : [`Acts ${listWords(numbers)} are ${what}.`];
}

/** What the sentence is built from. */
interface SentenceInput {
  kind: MapKind;
  acts: readonly MapAct[];
  scenes: number;
  planned: ReadonlySet<number>;
  todo: ReadonlySet<number>;
  tail: boolean;
  pages: number;
  plannedPages: number | null;
}

/**
 * The sentence (design §6.3), which never says more than the numbers do:
 * - An early draft (under `earlyPages` pages or `earlyScenes` scenes written) gives only its pages
 *   and scenes: "4 of 40 planned pages · 6 scenes so far".
 * - One act or none: the play or the script as a whole ("The play is under way: …").
 * - With pages still to write, no act is written: "The writing has reached Act 3: 14 scenes so
 *   far.", then each act with gaps, then the acts still to come.
 * - Else the written acts together (an act is written only with no planned scene and no to-do),
 *   each act under way with what it lacks, then the acts still to come. Only the acts the writer
 *   marked are named.
 */
function sentenceOf(input: SentenceInput): string {
  const { kind, acts, planned, todo, tail, pages, plannedPages } = input;
  const written = input.scenes - planned.size;
  if (pages < STORY_MAP_LIMITS.earlyPages || written < STORY_MAP_LIMITS.earlyScenes) {
    const length =
      plannedPages === null
        ? plural(pages, 'page', 'pages')
        : `${pages} of ${plannedPages} planned pages`;
    return `${length} · ${plural(written, 'scene', 'scenes')} so far`;
  }
  if (acts.length <= 1) {
    const whole = kind === 'play' ? 'The play' : 'The script';
    const all = Array.from({ length: input.scenes }, (_, s) => s);
    const state = stateOf(all, planned, todo, tail);
    if (state.kind === 'written') return `${whole} is written.`;
    if (state.kind === 'to-come') return `${whole} is still to come.`;
    return `${whole} is under way: ${listWords(state.parts)}.`;
  }
  const states = acts.map((act) => stateOf(act.scenes, planned, todo, false));
  const numbers = (state: ActState['kind']) =>
    acts.filter((_, a) => states[a]?.kind === state).map((act) => String(act.n));
  const underWay = acts.flatMap((act, a) => {
    const state = states[a];
    return state?.kind === 'under-way'
      ? [`Act ${act.n} is under way: ${listWords(state.parts)}.`]
      : [];
  });
  const out: string[] = [];
  if (tail) {
    const reached = acts.filter((act) => act.scenes.length > 0).at(-1) as MapAct;
    out.push(
      `The writing has reached Act ${reached.n}: ${plural(written, 'scene', 'scenes')} so far.`,
    );
  } else {
    out.push(...together(numbers('written'), 'written'));
  }
  out.push(...underWay, ...together(numbers('to-come'), 'still to come'));
  return out.join(' ');
}

/**
 * The gaps (design §6.1–§6.3): `written` is the pages written (the layout's body pages);
 * `plannedPages` the planned length, or null. A planned length of 0 or less, or one that isn't a
 * number, is none. The percent is written over planned, at most 100; the tail runs from the
 * pages written to the planned length when that is more.
 */
export function gapsOf(
  index: SceneIndex,
  doc: Doc,
  acts: readonly MapAct[],
  scenes: readonly MapScene[],
  plannedPages: number | null,
  written: number,
  kind: MapKind = 'screenplay',
): MapGaps {
  const planned = new Set<number>();
  index.scenes.forEach((scene, s) => {
    if (isPlanned(scene)) planned.add(s);
  });
  const todo = todoScenes(doc, index);
  const length =
    plannedPages !== null && Number.isFinite(plannedPages) && plannedPages > 0
      ? plannedPages
      : null;
  const percent = length === null ? null : Math.min(100, Math.round((written / length) * 100));
  const tail = length !== null && length > written ? { from: written, to: length } : null;
  const emptyActs = acts.filter((a) => a.scenes.length === 0).map((a) => a.n);
  const sorted = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b).map((s) => s + 1);
  return {
    found: emptyActs.length > 0 || planned.size > 0 || todo.size > 0 || tail !== null,
    planned: sorted(planned),
    todo: sorted(todo),
    emptyActs,
    tail,
    percent,
    written,
    plannedPages: length,
    sentence: sentenceOf({
      kind,
      acts,
      scenes: scenes.length,
      planned,
      todo,
      tail: tail !== null,
      pages: written,
      plannedPages: length,
    }),
  };
}

/** The status when the writer hasn't chosen (design §6.4): in progress when any gap is found. */
export function defaultStatus(gaps: MapGaps): MapStatus {
  return gaps.found ? 'in-progress' : 'finished';
}

/**
 * The map as Finished shows it (design §6.4): the planned scenes left out (the rest numbered 1, 2,
 * 3 again, and every index into the scenes moved with them), no to-do marks, no tail, no percent,
 * and no sentence. Acts that only held planned scenes are empty now. The kept scenes run end to
 * end again from where the first one started, so the strip has no hole, and the axis ends with them.
 */
export function finishedMap(map: StoryMap): StoryMap {
  const kept: number[] = [];
  const moved = new Map<number, number>();
  map.scenes.forEach((scene, s) => {
    if (scene.planned) return;
    moved.set(s, kept.length);
    kept.push(s);
  });
  // End to end again from where the first scene starts, each its own length: no holes.
  let at = map.scenes[0]?.from ?? 0;
  const scenes = kept.map((s, i) => {
    const scene = map.scenes[s] as MapScene;
    const from = at;
    at += scene.to - scene.from;
    return { ...scene, n: i + 1, todo: false, from, to: at };
  });
  const acts = map.acts.map((act) => {
    const mine = act.scenes.flatMap((s) => (moved.has(s) ? [moved.get(s) as number] : []));
    return { ...act, scenes: mine, empty: mine.length === 0 };
  });
  const characters = map.characters.map((c) => {
    const presence = c.presence.flatMap((p) =>
      moved.has(p.scene) ? [{ ...p, scene: moved.get(p.scene) as number }] : [],
    );
    return { ...c, presence, scenes: presence.length };
  });
  // Planned scenes have no dialogue, so no line of dialogue is in one; moved all the same.
  const quotes = map.quotes.map((q) => ({ ...q, scene: moved.get(q.scene) ?? q.scene }));
  // Threads count scenes from 1; one set up in a planned scene goes, a payoff there is unpaid.
  const number = (n: number | null) => {
    if (n === null) return null;
    const to = moved.get(n - 1);
    return to === undefined ? null : to + 1;
  };
  const threads = map.threads.flatMap((t) => {
    const from = number(t.from);
    return from === null ? [] : [{ ...t, from, to: number(t.to) }];
  });
  return {
    ...map,
    scenes,
    acts,
    characters,
    quotes,
    threads,
    facts: { ...map.facts, scenes: scenes.length },
    axis: scenes.at(-1)?.to ?? 0,
    gaps: {
      ...map.gaps,
      planned: [],
      todo: [],
      emptyActs: acts.filter((a) => a.empty).map((a) => a.n),
      tail: null,
      percent: null,
      sentence: '',
    },
  };
}
