import { markdownAnchors, splitLines } from '@drafter/compare';
import {
  Candidates,
  draftName,
  findCuts,
  hash53,
  headingKey,
  type ScenePrint,
  sameScene,
  scenePrints,
  sketchOf,
  type WorkKind,
} from '@drafter/history';
import { wordsIn } from '../markdown/words';
import { hashText } from '../storage/hash';
import type { DraftRow } from './store';

// Draft by draft (drafts-and-cuts design §2.4): the drafts in order, Draft 01 → 02, 02 → 03 … up
// to now, each step with what changed in numbers, so the whole history reads as a short timeline.
// Steps are always between consecutive drafts (Call 25); any two stay in the Drafts list's Compare.
// Pure, and safe in a worker: the history worker counts each step (`stepCounts`), and the counts
// are kept by the pair of IDs, so a list opened again counts only what is new.

/** What changed in one step, in numbers. */
export interface StepCounts {
  /** Words in `to` less words in `from` (`wordsIn`, as the Drafts list counts them). */
  words: number;
  /** Pages, when known: null, since laying out every draft costs a layout each (Task 2's call). */
  pages: number | null;
  /** Scenes (a script) or `#`–`###` sections (a document) only in `to`. */
  added: number;
  /** Whole scenes or sections that left (`findCuts`, without the passages). */
  cut: number;
  /** In both, matched, but not the same. */
  changed: number;
  /** The share of `to`'s words not in a unit kept exactly as it was: 0 to 1. */
  newShare: number;
}

export interface DraftStep extends StepCounts {
  from: DraftRow;
  /** The next draft, or the text being written now after the last one. */
  to: DraftRow | 'now';
}

/** How the app counts a step: in the history worker. The default counts here. */
export type CountStep = (before: string, after: string, kind: WorkKind) => Promise<StepCounts>;

// ---- Units: scenes, or a document's opening and sections ------------------------------------------

interface Unit {
  print: ScenePrint;
  words: number;
  /** A document's opening: matched with the other opening, never counted as a section. */
  opening: boolean;
}

function sceneUnits(text: string): Unit[] {
  const { slots, prints } = scenePrints(text);
  const byHash = new Map(prints.map((p) => [p.hash, p]));
  return slots.map((slot) => {
    const print = byHash.get(slot.hash) as ScenePrint;
    return { print, words: print.words, opening: false };
  });
}

const WORD = /[\p{L}\p{N}'’]+/gu;
const LEVEL = /^ {0,3}(#{1,3})/;

/** A document's opening (the text before its first heading) and each `#`–`###` section. */
function sectionUnits(text: string): Unit[] {
  const { lines } = splitLines(text);
  const anchors = markdownAnchors(text);
  const unit = (first: number, end: number, level: number, title: string): Unit => {
    const all = lines.slice(first, end).join('\n').trimEnd();
    const body = level === 0 ? all : lines.slice(first + 1, end).join('\n');
    const words = (body.match(WORD) ?? []).map((w) => w.toLowerCase());
    return {
      print: {
        hash: hash53(`${level}\n${all.replace(/[ \t]+$/gm, '')}`),
        headingKey: level === 0 ? '\u0000' : headingKey(title),
        heading: title,
        ...sketchOf(words),
        words: words.length,
        preview: '',
      },
      words: wordsIn(all),
      opening: level === 0,
    };
  };
  const units = [unit(0, anchors[0]?.line ?? lines.length, 0, '')];
  anchors.forEach((a, k) => {
    const level = (LEVEL.exec(lines[a.line] as string)?.[1] ?? '#').length;
    units.push(unit(a.line, anchors[k + 1]?.line ?? lines.length, level, a.title));
  });
  return units;
}

/**
 * What changed between two texts: each unit of `after` is the same as one of `before` (by hash),
 * changed (`sameScene` with one, found among the candidates that could match), or added; whole
 * units cut are `findCuts`'s, so the count agrees with Cuts.
 */
export function stepCounts(before: string, after: string, kind: WorkKind): StepCounts {
  const units = kind === 'fountain' ? sceneUnits : sectionUnits;
  const was = units(before);
  const now = units(after);
  const kept = new Set(was.map((u) => u.print.hash));
  const candidates = new Candidates<ScenePrint>();
  for (const u of was) if (!u.opening) candidates.add(u.print, u.print);
  let added = 0;
  let changed = 0;
  let total = 0;
  let fresh = 0;
  for (const u of now) {
    total += u.words;
    if (kept.has(u.print.hash)) continue;
    fresh += u.words;
    if (u.opening) continue;
    if (candidates.of(u.print).some((p) => sameScene(p, u.print))) changed++;
    else added++;
  }
  const cut = findCuts(before, after, kind).filter((c) => c.where.within === null).length;
  return {
    words: wordsIn(after) - wordsIn(before),
    pages: null,
    added,
    cut,
    changed,
    newShare: total === 0 ? 0 : fresh / total,
  };
}

// ---- The steps -----------------------------------------------------------------------------------

/** Counts kept by `kind`, the earlier draft's ID and the later text's, newest last. */
const cache = new Map<string, StepCounts>();
const CACHE_MAX = 256;

/** Forgets every counted step (tests). */
export function forgetSteps(): void {
  cache.clear();
}

function remember(key: string, counts: StepCounts) {
  cache.delete(key);
  cache.set(key, counts);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

const countHere: CountStep = async (before, after, kind) => stepCounts(before, after, kind);

/**
 * The steps between consecutive drafts (`rows` in any order), oldest first, then the last draft to
 * `nowText`. Only the script's own drafts are steps: an outside one (another computer's Draft 04,
 * or a draft file changed outside Drafter) is left out, so each number is one step. `texts` reads a draft's text, only for a step not counted before; `count` counts one
 * (the app's runs in the history worker).
 */
export async function draftSteps(
  rows: readonly DraftRow[],
  texts: (n: number) => Promise<string>,
  kind: WorkKind,
  nowText: string,
  count: CountStep = countHere,
): Promise<DraftStep[]> {
  const ordered = rows.filter((row) => !row.outside).sort((a, b) => a.n - b.n);
  if (ordered.length === 0) return [];
  const nowId = await hashText(nowText);
  const read = new Map<number, Promise<string>>();
  const textOf = (n: number) => {
    let text = read.get(n);
    if (!text) {
      text = texts(n);
      read.set(n, text);
    }
    return text;
  };
  const steps: DraftStep[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const from = ordered[i] as DraftRow;
    const to: DraftRow | 'now' = ordered[i + 1] ?? 'now';
    const key = `${kind}\n${from.id}\n${to === 'now' ? nowId : to.id}`;
    let counts = cache.get(key);
    if (!counts) {
      const before = await textOf(from.n);
      const after = to === 'now' ? nowText : await textOf(to.n);
      counts = await count(before, after, kind);
      remember(key, counts);
    }
    steps.push({ from, to, ...counts });
  }
  return steps;
}

// ---- What a step says ------------------------------------------------------------------------------

const number = (n: number) => Math.abs(n).toLocaleString('en-US');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${number(n)}`;

/** "Draft 02 → Draft 03", "Draft 03 → now". */
export const stepTitle = (step: Pick<DraftStep, 'from' | 'to'>): string =>
  `${draftName(step.from.n)} → ${step.to === 'now' ? 'now' : draftName(step.to.n)}`;

/** "Draft 02 to Draft 03": the step as its buttons and messages name it. */
export const stepName = (step: Pick<DraftStep, 'from' | 'to'>): string =>
  `${draftName(step.from.n)} to ${step.to === 'now' ? 'now' : draftName(step.to.n)}`;

/** "18% new", "under 1% new". */
function shareOf(share: number): string {
  const percent = Math.round(share * 100);
  return percent === 0 && share > 0 ? 'under 1% new' : `${percent}% new`;
}

/**
 * The numbers in words (§2.4): "+1,240 words · 3 scenes added · 2 scenes cut · 5 changed · 18% new", a
 * document's in sections ("2 sections cut": whole ones only, beside a Cuts list of every cut); "No changes" when the two are the same.
 */
export function stepLine(step: StepCounts, kind: WorkKind): string {
  const { words, pages, added, cut, changed, newShare } = step;
  if (words === 0 && added === 0 && cut === 0 && changed === 0 && newShare === 0)
    return 'No changes';
  const unit = kind === 'fountain' ? 'scene' : 'section';
  const parts = [`${signed(words)} ${Math.abs(words) === 1 ? 'word' : 'words'}`];
  if (pages !== null) parts.push(`${signed(pages)} ${Math.abs(pages) === 1 ? 'page' : 'pages'}`);
  parts.push(
    `${number(added)} ${added === 1 ? unit : `${unit}s`} added`,
    `${number(cut)} ${cut === 1 ? unit : `${unit}s`} cut`,
    `${number(changed)} changed`,
    shareOf(newShare),
  );
  return parts.join(' · ');
}
