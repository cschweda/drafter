import { type Cast, castOf, locationKey, nameMap, shares } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import {
  estimateSeconds,
  linesPerPage,
  type SceneIndex,
  type Section,
  sceneIndex,
  structureStrip,
} from '@drafter/outline';
import { scriptAuthor } from '@drafter/render-html-file';
import type { Template } from '@drafter/templates';
import { defaultStatus, finishedMap, gapsOf, isPlanned, isStub } from './gaps';
import { STORY_MAP_LIMITS } from './limits';
import { pickQuotes, quoteCandidates, signatureLines } from './lines';
import { mailtoOf } from './mailto';
import { intervalOf, movesSentence, pairsOf, settingOf, stageLines, topSections } from './stage';
import { actMood, hooksOf, sceneLine, threadsOf } from './summaries';
import type {
  MapAct,
  MapCharacter,
  MapKind,
  MapOptions,
  MapPlace,
  MapQuote,
  MapScene,
  StoryMap,
  TimeKind,
} from './types';
import {
  dateWords,
  followOn,
  initialsOf,
  insideWords,
  minutesWords,
  placeWords,
  timeOf,
  titleCase,
} from './words';

// The story-map model (story-map design §3–§5): what Drafter already computes for the Script tab,
// Stats, and Scaffold (the scene index, its pages, and the cast), turned into one plain object of
// numbers, short strings, and indexes in plain words, with the lines of dialogue, the scene
// summaries, the hooks, and the threads; the gaps and the status; and a play's interval,
// settings, who's on stage, and pairs.

export interface MapInput {
  doc: Doc;
  template: Template;
  layout: Layout;
  options: MapOptions;
}

export { STORY_MAP_LIMITS } from './limits';

/** The palette slots a lead's colour comes from (design §4.1); the white ring is apart. */
const SLOTS = 7;

/**
 * A leading "Act One:" label: "Act", a number in figures, Roman numerals, or words, and an
 * optional colon, period, or dash. Anchored, and each part matches different characters, so it is
 * linear in the title.
 */
const ACT_LABEL =
  /^act\s+(?:\d+|(?=[ivx]+\b)x{0,3}(?:ix|iv|v?i{0,3})|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*[:.\-–—]?\s*/i;

/** An extension that means the speaker is only heard. */
const VOICE = /V\.O\.|O\.S\./i;

/** The section's title without its "Act One:" label. */
export function actTitle(section: Section): string {
  return section.title.trim().replace(ACT_LABEL, '').trim();
}

/** Each scene's place on the page axis: the Structure strip's, else end to end by length. */
function spansOf(index: SceneIndex, perPage: number | null): Array<[number, number]> {
  const strip = structureStrip(index, perPage);
  if (strip.unit === 'pages') {
    return (strip.rows.at(-1)?.blocks ?? []).map((b) => [b.from, b.to] as [number, number]);
  }
  let at = 0;
  return index.scenes.map((scene) => {
    const from = at;
    at += (scene.pages?.eighths ?? 0) / 8;
    return [from, at];
  });
}

/** Whether each speaking character is only ever heard: every cue of theirs `V.O.` or `O.S.` */
function voicesOf(index: SceneIndex, doc: Doc): Map<string, boolean> {
  const voices = new Map<string, boolean>();
  const units = [index.opening?.speeches ?? [], ...index.items.map((item) => item.speeches)];
  for (const unit of units) {
    for (const speech of unit) {
      const block = doc.blocks[speech.block];
      const extension = block?.kind === 'character' ? block.sem.extension : null;
      const heard = extension !== null && VOICE.test(extension);
      const key = speech.name.toUpperCase();
      voices.set(key, (voices.get(key) ?? true) && heard);
    }
  }
  return voices;
}

/** A name as the page shows it: as typed when it has small letters, else in title case. */
function displayName(name: string): string {
  const chars = Array.from(name);
  const mixed =
    chars.some((c) => c !== c.toUpperCase()) && chars.some((c) => c !== c.toLowerCase());
  return mixed ? name : titleCase(name);
}

/** Titles that stay with the name after them (`Mrs. Aubert`), lowercased, without a period. */
const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'mx',
  'miss',
  'dr',
  'prof',
  'rev',
  'fr',
  'capt',
  'sgt',
  'lt',
  'col',
  'gen',
  'sir',
  'dame',
  'lord',
  'lady',
]);

/** The first word (with a title before it: `Dr. Rhee`), and the rest. */
function splitName(name: string): { first: string; rest: string } {
  const words = name.trim().split(/\s+/);
  const titled =
    words.length > 1 && TITLES.has((words[0] as string).toLowerCase().replace(/\.$/, ''));
  const take = titled ? 2 : 1;
  return { first: words.slice(0, take).join(' '), rest: words.slice(take).join(' ') };
}

/** The `p`th percentile (0–1) of sorted `values`, between neighbours. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (at - lo);
}

/** "Longest: scene 47, 6 min. Most run 1–3 min." */
function paceOf(scenes: readonly MapScene[]): string {
  if (scenes.length === 0) return '';
  let longest = scenes[0] as MapScene;
  for (const scene of scenes) if (scene.minutes > longest.minutes) longest = scene;
  const sorted = scenes.map((s) => s.minutes).sort((a, b) => a - b);
  const a = Math.round(percentile(sorted, 0.25));
  const b = Math.round(percentile(sorted, 0.75));
  const most =
    b < 1
      ? 'Most run under a minute.'
      : Math.max(1, a) === b
        ? `Most run about ${b} min.`
        : `Most run ${Math.max(1, a)}–${b} min.`;
  return `Longest: scene ${longest.n}, ${minutesWords(longest.minutes)}. ${most}`;
}

/** Whole percents, `part` of `whole`; 0 for nothing. */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** The characters the page shows, by screen time, with their leads, colours, and shares. */
function charactersOf(cast: Cast, index: SceneIndex, doc: Doc, scenes: readonly MapScene[]) {
  const voices = voicesOf(index, doc);
  const kept = cast.characters
    .map((character) => ({ character, figures: cast.figures.get(character.key) }))
    .filter(({ figures }) => figures && !(figures.words === 0 && figures.scenes.length < 2))
    .map(({ character, figures }) => {
      const presence = (figures?.scenes ?? []).map((p) => ({
        scene: p.scene,
        speaking: p.speaking,
      }));
      const minutes = presence.reduce((n, p) => n + (scenes[p.scene]?.minutes ?? 0), 0);
      return { character, words: figures?.words ?? 0, presence, minutes };
    });
  // A stable sort: ties keep the cast's order.
  kept.sort((a, b) => b.minutes - a.minutes);
  const percents = shares(kept.map((k) => k.words));
  let slot = 0;
  const characters: MapCharacter[] = kept.map((k, i) => {
    const name = displayName(k.character.name);
    const lead = i < STORY_MAP_LIMITS.leads;
    const voice = lead && voices.get(k.character.key) === true;
    const color = lead && !voice ? slot++ % SLOTS : null;
    return {
      key: k.character.key,
      name,
      ...splitName(name),
      initial: Array.from(initialsOf(name))[0] ?? '',
      lead,
      color,
      voice,
      minutes: k.minutes,
      scenes: k.presence.length,
      share: percents[i] ?? 0,
      hook: null,
      age: null,
      signature: null,
      presence: k.presence,
    };
  });
  return characters;
}

/**
 * The places (a play's settings), by time spent there, the top 24 sized in five steps; and how
 * many more. Scenes are grouped by their place in plain words (`locationKey`), each shown as first
 * written; a place with a follow-on time in its heading (`GARAGE - LATER THAT NIGHT`) is already
 * the same place. Scenes `skip` says are left out.
 */
function placesOf(
  scenes: readonly MapScene[],
  skip: (scene: MapScene) => boolean,
): { places: MapPlace[]; more: number } {
  const byKey = new Map<string, { name: string; scenes: number; minutes: number }>();
  for (const scene of scenes) {
    if (scene.place === null || skip(scene)) continue;
    const key = locationKey(scene.place);
    const place = byKey.get(key) ?? { name: scene.place, scenes: 0, minutes: 0 };
    place.scenes += 1;
    place.minutes += scene.minutes;
    byKey.set(key, place);
  }
  const all = [...byKey.values()];
  // Stable: ties keep the order they are first visited in.
  all.sort((a, b) => b.minutes - a.minutes || b.scenes - a.scenes);
  const top = all[0]?.minutes ?? 0;
  // Two places or more that all take the same time (as the page shows it, in whole minutes, or
  // none at all): none is bigger than another, so all take the middle size.
  const even = all.length > 1 && all.every((p) => Math.round(p.minutes) === Math.round(top));
  const places = all.slice(0, STORY_MAP_LIMITS.places).map((p) => ({
    ...p,
    size: (even
      ? 3
      : top > 0
        ? Math.min(5, Math.max(1, Math.ceil((p.minutes / top) * 5)))
        : 5) as MapPlace['size'],
  }));
  return { places, more: all.length - places.length };
}

/**
 * The lines of dialogue (design §3.1, §4.4): the picks, each pointed at from its scene, then each
 * character's signature line when it isn't one of them.
 */
function quotesOf(
  doc: Doc,
  index: SceneIndex,
  scenes: readonly MapScene[],
  characters: readonly MapCharacter[],
  at: ReadonlyMap<string, number>,
): MapQuote[] {
  const candidates = quoteCandidates(doc, index).filter((c) => at.has(c.character));
  const picks = pickQuotes(candidates, scenes.length, (s) => scenes[s]?.act ?? null);
  const quotes: MapQuote[] = [];
  const byCue = new Map<number, number>();
  const add = (c: (typeof candidates)[number], inScene: boolean) => {
    byCue.set(c.cue, quotes.length);
    quotes.push({
      scene: c.scene,
      character: at.get(c.character) as number,
      text: c.text,
      cue: c.cue,
      marked: c.marked === 'quote',
      inScene,
    });
  };
  for (const pick of picks) {
    (scenes[pick.scene] as MapScene).quote = quotes.length;
    add(pick, true);
  }
  const signatures = signatureLines(candidates);
  for (const character of characters) {
    const line = signatures.get(character.key);
    if (!line) continue;
    if (!byCue.has(line.cue)) add(line, false);
    character.signature = byCue.get(line.cue) ?? null;
  }
  return quotes;
}

/** The story map's model of `input`: the same input gives the same model. */
export function buildStoryMap(input: MapInput): StoryMap {
  const { doc, template, layout, options } = input;
  const kind: MapKind = template.roleMap.some((rule) => rule.role === 'scene_heading_play')
    ? 'play'
    : 'screenplay';
  const index = sceneIndex(doc, template, layout);
  const perPage = linesPerPage(layout);
  // Only capitals count, as with no dictionary.
  const cast = castOf(index, doc, template, perPage, () => undefined);
  const { minutesPerPage, wordsPerMinute } = options.rates;

  // Acts: a scene before the first act is Act 1's.
  const sections = topSections(index);
  const actIndexOf = (block: number) => {
    let at = 0;
    for (let a = 0; a < sections.length; a++) if ((sections[a] as Section).block < block) at = a;
    return at;
  };

  // A play's settings (Call 16): "The same" takes the scene before's.
  const settings: Array<{ name: string; time: string | null } | null> = [];
  if (kind === 'play') {
    for (const scene of index.scenes) {
      settings.push(settingOf(scene, doc, template, settings.at(-1)?.name ?? null));
    }
  }

  const spans = spansOf(index, perPage);
  let before: TimeKind | null = null;
  const scenes: MapScene[] = index.scenes.map((scene, s) => {
    // Expand outline's stand-in heading names no place and no time.
    const stub = isStub(scene);
    const place = stub ? undefined : cast.places[s];
    const setting = settings[s] ?? null;
    // A planned scene counts no time (design §6.1.2).
    const planned = isPlanned(scene);
    const minutes = planned
      ? 0
      : kind === 'play'
        ? estimateSeconds(scene.timing, wordsPerMinute) / 60
        : ((scene.pages?.eighths ?? 0) / 8) * minutesPerPage;
    const follow = place?.time ? null : followOn(place?.location ?? '');
    const time = timeOf(place?.time ?? follow?.time ?? setting?.time ?? null, before);
    if (!stub) before = time.kind;
    const [from, to] = spans[s] ?? [0, 0];
    const location =
      kind === 'play'
        ? (setting?.name ?? '')
        : place?.location
          ? placeWords(follow ? follow.location : place.location)
          : '';
    const named = place?.location ? placeWords(place.location) : '';
    const heading = scene.heading.trim();
    return {
      n: s + 1,
      act: sections.length > 0 ? actIndexOf(scene.block) + 1 : null,
      from,
      to,
      minutes,
      place: location === '' ? null : location,
      // A play's title, unless it names a place or is the setting itself.
      title:
        kind === 'play' &&
        named === '' &&
        heading !== '' &&
        !(setting && locationKey(setting.name) === locationKey(heading))
          ? heading
          : null,
      time: time.time,
      timeKind: time.kind,
      inside: insideWords(place?.inside ?? 'none'),
      what: null,
      chips: [],
      planned,
      todo: false,
      quote: null,
      stage: null,
      moves: null,
    };
  });

  const acts: MapAct[] = sections.map((section, a) => {
    const mine = scenes.flatMap((scene, s) => (scene.act === a + 1 ? [s] : []));
    return {
      n: a + 1,
      title: actTitle(section),
      mood: options.include.summaries ? actMood(section, doc) : null,
      scenes: mine,
      // A planned scene counts no pages.
      pages:
        mine.reduce(
          (n, s) => n + (scenes[s]?.planned ? 0 : (index.scenes[s]?.pages?.eighths ?? 0)),
          0,
        ) / 8,
      minutes: mine.reduce((n, s) => n + (scenes[s]?.minutes ?? 0), 0),
      empty: mine.length === 0,
    };
  });

  const characters = charactersOf(cast, index, doc, scenes);
  const at = new Map(characters.map((c, i) => [c.key, i]));
  scenes.forEach((scene, s) => {
    scene.chips = (cast.inScene[s] ?? [])
      .map(({ row }) => at.get(cast.characters[row]?.key ?? ''))
      .filter((i): i is number => i !== undefined)
      .sort((x, y) => x - y);
  });

  // What happens in each scene, with the speakers' names in capitals in title case.
  if (options.include.summaries) {
    const names = new Set(cast.characters.map((c) => c.key));
    index.scenes.forEach((scene, s) => {
      (scenes[s] as MapScene).what = sceneLine(scene, doc, names);
    });
  }

  // Hooks: an edited one wins, and an empty one means none.
  const hooks = hooksOf(doc, index);
  for (const character of characters) {
    const found = hooks.get(character.key);
    const edited = options.hooks[character.key];
    character.age = found?.age ?? null;
    character.hook =
      edited !== undefined ? (edited.trim() === '' ? null : edited.trim()) : (found?.hook ?? null);
  }

  const quotes = options.include.lines ? quotesOf(doc, index, scenes, characters, at) : [];

  // Who's on stage in a play (Call 28), by the page's characters, in the chips' order.
  if (kind === 'play') {
    const spelled = nameMap(cast.characters.map((c) => ({ name: c.name, word: false })));
    const shown = characters.map((c) => c.name);
    scenes.forEach((scene, s) => {
      const lines = scene.planned
        ? []
        : stageLines(doc, index, s, spelled, cast)
            .flatMap((line) => {
              const i = at.get(cast.characters[line.character]?.key ?? '');
              return i === undefined ? [] : [{ ...line, character: i }];
            })
            .sort((x, y) => x.character - y.character);
      scene.stage = lines;
      scene.moves = movesSentence(lines, shown);
    });
  }

  // Two lanes when at least half the scenes say inside or outside, or a time.
  const placed = index.scenes.filter((scene, s) => {
    const p = cast.places[s];
    return p !== undefined && !isStub(scene) && (p.inside !== 'none' || p.time !== null);
  }).length;
  const lanes = scenes.length > 0 && placed * 2 >= scenes.length ? 'two' : 'one';
  const sum = (list: readonly MapScene[]) => list.reduce((n, s) => n + s.minutes, 0);
  const known = scenes.filter((s) => s.inside !== null);
  const timed = scenes.filter((s) => s.timeKind !== null);
  // Nothing written yet: no split to draw.
  const split =
    lanes === 'two' && sum(scenes) > 0
      ? {
          indoors: percent(sum(known.filter((s) => s.inside === 'Inside')), sum(known)),
          night: percent(sum(timed.filter((s) => s.timeKind === 'night')), sum(timed)),
        }
      : null;

  // The gaps, and the status they give unless the writer chose one (design §6).
  const pages = layout.pages.filter((p) => p.number > 0).length;
  const gaps = gapsOf(index, doc, acts, scenes, options.plannedPages, pages, kind);
  const status = options.status ?? defaultStatus(gaps);
  const todo = new Set(gaps.todo);
  for (const scene of scenes) scene.todo = todo.has(scene.n);

  // Finished leaves the planned scenes out, and so their places.
  const { places, more } = placesOf(scenes, (scene) => status === 'finished' && scene.planned);
  const author = scriptAuthor(doc).trim();
  const contact = options.contact?.trim() ?? '';
  const draft = Math.max(1, Math.floor(options.draft.number));

  const map: StoryMap = {
    kind,
    status,
    title: options.title,
    writer: author === '' ? null : { name: author, initials: initialsOf(author) },
    greeting: options.greeting,
    logline: options.logline,
    explain: options.explain,
    draftLabel: `Draft ${String(draft).padStart(2, '0')}`,
    shortId: options.draft.id.slice(0, 7),
    updated: options.updated === null ? null : dateWords(options.updated),
    facts: {
      pages,
      minutes: Math.round(sum(scenes)),
      scenes: scenes.length,
      characters: characters.length,
      places: places.length + more,
    },
    acts,
    scenes,
    axis: scenes.at(-1)?.to ?? 0,
    lanes,
    split,
    pace: paceOf(scenes.filter((scene) => !scene.planned)),
    characters,
    pairs: pairsOf(kind, characters, cast, scenes),
    places,
    placesMore: more,
    quotes,
    threads: options.include.threads ? threadsOf(doc, index) : [],
    gaps,
    interval: kind === 'play' ? intervalOf(doc, index, acts) : null,
    contact:
      options.include.contact && contact !== ''
        ? { text: contact, mailto: mailtoOf(contact) }
        : null,
  };
  // Last, so every index above is the in-progress one until then.
  return status === 'finished' ? finishedMap(map) : map;
}
