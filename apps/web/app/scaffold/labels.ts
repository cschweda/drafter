import type { Cast, Place } from '@drafter/cast';
import { estimateSeconds, type Scene } from '@drafter/outline';
import { lengthWords, sceneNumber } from '../outline/labels';
import { pageSeconds, type Rates, shortTime, timeWords } from '../stats/time-format';
import type { ScaffoldPage } from './session';

// What Scaffold's scene page says (seeing-the-script design §5.2): its heading, the scene's facts
// (where, when, how long), and a row for each character in it. Read from the cast and the scene
// index; nothing here counts anything again.

/** A play's `## Scene 2`, or any heading that isn't in the INT./EXT. form (§3.6). */
export const NO_PLACE = 'This scene’s heading doesn’t name a place.';

/**
 * Who counts as in a scene, as the scene and character pages say it (seeing-the-script design §3,
 * Calls 5 to 7): a mention counts, a voice-over counts as speaking, a name that is also a word
 * counts in capitals only (until the dictionary answers, and always for a word like Will), and a
 * name of two words or more counts only whole.
 */
export const PRESENCE_NOTE =
  'Someone is in a scene when they speak in it or their name is in its action: a mention counts as being there, and a voice-over, such as (V.O.), counts as speaking in the scene. A name that is also an ordinary word, like Tom, counts in the action only in capitals (TOM) until the dictionary has answered, and always so for a word like Will. A name of two words or more counts only as the whole name, never one word of it.';

/** "Scene 12 · INT. KITCHEN - NIGHT", the scene page's heading. */
export function sceneTitle(scene: Scene): string {
  const number = `Scene ${sceneNumber(scene)}`;
  return scene.heading ? `${number} · ${scene.heading}` : number;
}

const INSIDE: Record<Place['inside'], string | null> = {
  inside: 'Inside',
  outside: 'Outside',
  both: 'Inside and outside',
  none: null,
};

/** A time with "about" before it; no time at all is "0 s", not "about 0 s". */
const about = (seconds: number) =>
  seconds > 0 ? `about ${shortTime(seconds)}` : shortTime(seconds);

/**
 * A fact of the scene page's list: `words` is what a screen reader hears, when it differs; `link`,
 * the start of `value` that is a link to another Scaffold page (the place, to its location page).
 */
export interface SceneFact {
  term: string;
  value: string;
  words?: string;
  link?: { text: string; page: ScaffoldPage };
}

/**
 * The scene's facts: Where (the location and inside or outside), When (the time of day, when the
 * heading has one), and Length: its pages, its page, and its minutes at the script's page rate
 * once the pages are ready, else the estimate from the dialogue, which says so (Call 27).
 */
export function sceneFacts(scene: Scene, place: Place, rates: Rates): SceneFact[] {
  const facts: SceneFact[] = [];
  if (place.location === null) {
    facts.push({ term: 'Where', value: NO_PLACE });
  } else {
    const inside = INSIDE[place.inside];
    const link =
      place.key === null
        ? {}
        : { link: { text: place.location, page: { kind: 'location', key: place.key } as const } };
    facts.push(
      inside
        ? {
            term: 'Where',
            value: `${place.location} · ${inside}`,
            words: `${place.location}, ${inside.toLowerCase()}`,
            ...link,
          }
        : { term: 'Where', value: place.location, ...link },
    );
  }
  if (place.time) facts.push({ term: 'When', value: place.time });
  if (scene.pages) {
    const { page, eighths } = scene.pages;
    const seconds = pageSeconds(eighths, rates.minutesPerPage);
    facts.push({
      term: 'Length',
      value: `${lengthWords(eighths)} · page ${page} · ${about(seconds)}`,
      words: `${lengthWords(eighths)}, page ${page}, ${timeWords(seconds)}`,
    });
  } else {
    const seconds = estimateSeconds(scene.timing, rates.wordsPerMinute);
    facts.push({
      term: 'Length',
      value: `${about(seconds)} (from the dialogue)`,
      words: `${timeWords(seconds)}, from the dialogue`,
    });
  }
  return facts;
}

/** One character in the scene page's table. */
export interface SceneRow {
  key: string;
  /** As first typed. */
  name: string;
  /** Their speeches here, or "Silent". */
  speeches: string;
  words: number;
  /** Time speaking: their words at the script's pace, and its share of the scene's estimate; null when silent. */
  time: { text: string; words: string; share: string } | null;
  /** This is the first scene they are in. */
  first: boolean;
  /** How many other scenes they are in. */
  more: number;
}

/**
 * Everyone in scene `sceneIndex` (`scene`, from the index the cast was worked out from): speakers
 * in the order of their first speech here, then the silent in the order their names first appear
 * in the action (Call 28). Time speaking is their words at the script's words a minute, as a share
 * of the scene's estimate from the dialogue, never over 100% (a dual pair's two sides are both
 * counted in full, while the estimate counts the longer).
 */
export function sceneRows(cast: Cast, sceneIndex: number, scene: Scene, rates: Rates): SceneRow[] {
  const firstSpeech = new Map<string, number>();
  scene.speeches.forEach((speech, i) => {
    const key = speech.name.toUpperCase();
    if (!firstSpeech.has(key)) firstSpeech.set(key, i);
  });
  const sceneSeconds = estimateSeconds(scene.timing, rates.wordsPerMinute);
  const firsts = new Set(cast.firstIn.get(sceneIndex) ?? []);
  const here = (cast.inScene[sceneIndex] ?? []).map(({ row, presence }) => {
    const character = cast.characters[row];
    return { row, presence, key: character?.key ?? '', name: character?.name ?? '' };
  });
  const order = (p: (typeof here)[number]) =>
    p.presence.speaking
      ? (firstSpeech.get(p.key) ?? Number.MAX_SAFE_INTEGER)
      : (p.presence.firstMention ?? Number.MAX_SAFE_INTEGER);
  here.sort(
    (a, b) =>
      Number(b.presence.speaking) - Number(a.presence.speaking) ||
      order(a) - order(b) ||
      a.row - b.row,
  );
  return here.map(({ presence, key, name }): SceneRow => {
    let time: SceneRow['time'] = null;
    if (presence.speaking) {
      const seconds = (presence.words / rates.wordsPerMinute) * 60;
      const share = sceneSeconds > 0 ? Math.min(1, seconds / sceneSeconds) : 0;
      time = {
        text: about(seconds),
        words: timeWords(seconds),
        share: `${Math.round(share * 100)}%`,
      };
    }
    return {
      key,
      name,
      speeches: presence.speaking ? String(presence.speeches) : 'Silent',
      words: presence.words,
      time,
      first: firsts.has(key),
      more: Math.max(0, (cast.figures.get(key)?.scenes.length ?? 1) - 1),
    };
  });
}

/**
 * The rows of the scene with session id `id`, from the cast and the scenes it was worked out from
 * (`basis`): the scene is found there by its id as it was then, never by its place, which a scene
 * added or removed above it has changed since. Null while the cast hasn't that scene (a new one), so
 * the page says Counting… rather than show another scene's people.
 */
export function rowsFor(
  cast: Cast | null,
  basis: { index: { scenes: readonly Scene[] }; ids: readonly string[] } | null,
  id: string,
  rates: Rates,
): SceneRow[] | null {
  if (!cast || !basis) return null;
  const at = basis.ids.indexOf(id);
  const scene = basis.index.scenes[at];
  return scene ? sceneRows(cast, at, scene, rates) : null;
}
