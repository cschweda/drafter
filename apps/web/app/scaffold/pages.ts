import type { Cast, CharacterFigures, LocationFigures } from '@drafter/cast';
import type { SceneIndex, Speech } from '@drafter/outline';
import { lengthWords, sceneNumber } from '../outline/labels';
import { shares } from '../stats/characters';
import {
  pageRatePhrase,
  pageSeconds,
  type Rates,
  shortTime,
  timeWords,
} from '../stats/time-format';

// What Scaffold's character and location pages, and its Cast and Places lists, say
// (seeing-the-script design §5.3–§5.5): the summary lines, a character's figures, a location's
// times of day, and the lists' filter. Every figure is the cast's, read as the Stats tab reads it,
// so the two never disagree; nothing here counts anything again.

/** A list longer than this shows its first ones and a button for the rest (Call 29). */
export const LINES_SHOWN = 100;

/** A character or a place shown in Scaffold that the script no longer has. */
export const NO_LONGER = 'No longer in the script.';

/** What a figure waits for before the layout has paginated the script. */
export const WHEN_PAGES = 'When the pages are ready';

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * "In 23 of 61 scenes. First in scene 1 (page 1); last in scene 58 (page 104)." The pages are left
 * out until the layout has them. A character who speaks only outside the scenes is in none.
 */
export function characterSummary(f: CharacterFigures, index: SceneIndex, total: number): string {
  const head = `In ${f.scenes.length} of ${plural(total, 'scene')}.`;
  if (f.first === null || f.last === null) return head;
  const at = (s: number) => {
    const scene = index.scenes[s];
    if (!scene) return '';
    const page = scene.pages ? ` (page ${scene.pages.page})` : '';
    return `scene ${sceneNumber(scene)}${page}`;
  };
  return `${head} First in ${at(f.first)}; last in ${at(f.last)}.`;
}

/**
 * A figure of a page's list: `words` is what a screen reader hears, when it differs; `scene`, a
 * scene the figure links to (the scene a character comes back in after their longest absence).
 */
export interface PageFact {
  term: string;
  value: string;
  words?: string;
  scene?: number;
}

/** "41 pages" from page 31 to page 72: whole pages, as the absence's own note says to print it. */
const gapPages = (from: number, to: number) => plural(to - from, 'page');

/**
 * A character's figures (§5.3): screen time in pages and in minutes at the script's page rate;
 * their dialogue, with its share as the Stats tab rounds it (`percent`, from `sharePercents`); their
 * longest absence, linking to the scene they come back in; and every absence of 20 pages or more.
 * The ones that need the pages wait for them.
 */
export function characterFacts(f: CharacterFigures, rates: Rates, percent: number): PageFact[] {
  const facts: PageFact[] = [];
  if (f.screenEighths === null) {
    facts.push({ term: 'Screen time', value: WHEN_PAGES });
  } else {
    const seconds = pageSeconds(f.screenEighths, rates.minutesPerPage);
    const rate = pageRatePhrase(rates.minutesPerPage);
    facts.push({
      term: 'Screen time',
      value: `${lengthWords(f.screenEighths)} · about ${shortTime(seconds)} at ${rate}`,
      words: `${lengthWords(f.screenEighths)}, ${timeWords(seconds)} at ${rate}`,
    });
  }
  facts.push({
    term: 'Dialogue',
    value: `${plural(f.speeches, 'speech', 'speeches')} · ${plural(f.words, 'word')} · ${percent}% of all dialogue`,
  });
  if (f.absences === null) {
    facts.push({ term: 'Longest absence', value: WHEN_PAGES });
    facts.push({ term: 'Long absences', value: WHEN_PAGES });
    return facts;
  }
  const longest = f.longest;
  facts.push(
    longest
      ? {
          term: 'Longest absence',
          value: `page ${longest.from.page} to page ${longest.to.page} (${gapPages(longest.from.page, longest.to.page)})`,
          scene: longest.to.scene,
        }
      : { term: 'Longest absence', value: 'None' },
  );
  facts.push({
    term: 'Long absences',
    value:
      f.absences.length === 0
        ? 'None of 20 pages or more'
        : f.absences
            .map(
              (a) =>
                `${f.character.name}: absent from page ${a.from.page} to page ${a.to.page} (${gapPages(a.from.page, a.to.page)}).`,
            )
            .join(' '),
  });
  return facts;
}

/** Each character's dialogue share in whole percents, as the Stats tab's Characters table gives it. */
export function sharePercents(cast: Cast): Map<string, number> {
  const percents = shares(cast.characters.map((c) => cast.figures.get(c.key)?.words ?? 0));
  return new Map(cast.characters.map((c, i) => [c.key, percents[i] ?? 0]));
}

const SPLIT: ReadonlyArray<[keyof LocationFigures['inside'], string]> = [
  ['inside', 'inside'],
  ['outside', 'outside'],
  ['both', 'inside and outside'],
];

/**
 * "7 scenes · 9 4/8 pages · about 9 min 30 s · inside 6, outside 1." The pages and minutes wait
 * for the layout; a heading with neither INT. nor EXT. adds to no side.
 */
export function locationSummary(f: LocationFigures, rates: Rates): string {
  const parts = [plural(f.scenes.length, 'scene')];
  if (f.eighths !== null) {
    parts.push(
      lengthWords(f.eighths),
      `about ${shortTime(pageSeconds(f.eighths, rates.minutesPerPage))}`,
    );
  }
  const split = SPLIT.filter(([side]) => f.inside[side] > 0)
    .map(([side, words]) => `${words} ${f.inside[side]}`)
    .join(', ');
  if (split) parts.push(split);
  return `${parts.join(' · ')}.`;
}

/** "NIGHT 4, DAY 3": a location's times of day, the most used first; empty when none is named. */
export function timesOfDay(f: LocationFigures): string {
  return Object.entries(f.times)
    .sort(([, a], [, b]) => b - a)
    .map(([time, n]) => `${time} ${n}`)
    .join(', ');
}

/** A speech, with the index of the scene it is in, or null outside every scene. */
export type PlacedSpeech = Speech & { scene: number | null };

/**
 * Every speech of the character `key`, in script order: before the first scene, in a section's own
 * stretch, and in each scene, so the page lists as many as the Stats tab counts.
 */
export function speechesOf(index: SceneIndex, key: string): PlacedSpeech[] {
  const out: PlacedSpeech[] = [];
  const mine = (speech: Speech) => speech.name.toUpperCase() === key;
  for (const speech of index.opening?.speeches ?? [])
    if (mine(speech)) out.push({ ...speech, scene: null });
  let scene = 0;
  for (const item of index.items) {
    const at = item.kind === 'scene' ? scene++ : null;
    for (const speech of item.speeches) if (mine(speech)) out.push({ ...speech, scene: at });
  }
  return out;
}

/** Text folded for the lists' filter: lower case, accents off, the ends trimmed. */
export function filterFold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Whether `name` holds what is typed in a filter; an empty filter holds everything. */
export function matchesFilter(name: string, filter: string): boolean {
  const wanted = filterFold(filter);
  return wanted === '' || filterFold(name).includes(wanted);
}
