import { type Cast, castOf, shares } from '@drafter/cast';
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
import { pickQuotes, quoteCandidates, signatureLines } from './lines';
import { actMood, hooksOf, sceneLine, threadsOf } from './summaries';
import type {
  MapAct,
  MapCharacter,
  MapGaps,
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
// summaries, the hooks, and the threads. Gaps and a play's own parts are filled by the later steps.

export interface MapInput {
  doc: Doc;
  template: Template;
  layout: Layout;
  options: MapOptions;
}

export const STORY_MAP_LIMITS = Object.freeze({
  leads: 8,
  ranked: 12,
  rest: 8,
  places: 24,
  arcs: 12,
  quotes: 12,
  foldOver: 80,
  minWidth: 0.0015,
} as const);

/** The palette slots a lead's colour comes from (design §4.1); the white ring is apart. */
const SLOTS = 7;

/**
 * A leading "Act One:" label: "Act", a number in figures, Roman numerals, or words, and an
 * optional colon, period, or dash. Anchored, and each part matches different characters, so it is
 * linear in the title.
 */
const ACT_LABEL =
  /^act\s+(?:\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*[:.\-–—]?\s*/i;

/** An extension that means the speaker is only heard. */
const VOICE = /V\.O\.|O\.S\./i;

/** The section's title without its "Act One:" label. */
export function actTitle(section: Section): string {
  return section.title.trim().replace(ACT_LABEL, '').trim();
}

/** The acts: the top-level sections (the smallest depth used), in order. */
function topSections(index: SceneIndex): Section[] {
  if (index.sections.length === 0) return [];
  const depth = Math.min(...index.sections.map((s) => s.depth));
  return index.sections.filter((s) => s.depth === depth);
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

/** The first word, and the rest. */
function splitName(name: string): { first: string; rest: string } {
  const trimmed = name.trim();
  const space = trimmed.search(/\s/);
  if (space < 0) return { first: trimmed, rest: '' };
  return { first: trimmed.slice(0, space), rest: trimmed.slice(space).trim() };
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

/** A mail address the page may link: one `@`, no spaces, no `?` or `&`. */
function mailOf(text: string): string | null {
  const at = text.indexOf('@');
  if (at <= 0 || at !== text.lastIndexOf('@') || at === text.length - 1) return null;
  if (/[\s?&]/.test(text)) return null;
  return `mailto:${text}`;
}

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

/** The places, by time spent there, the top 24 sized in five steps; and how many more. */
function placesOf(cast: Cast, scenes: readonly MapScene[]): { places: MapPlace[]; more: number } {
  const all = [...cast.locations.values()].map((loc) => ({
    name: placeWords(loc.location),
    scenes: loc.scenes.length,
    minutes: loc.scenes.reduce((n, s) => n + (scenes[s]?.minutes ?? 0), 0),
  }));
  // Stable: ties keep the cast's key order.
  all.sort((a, b) => b.minutes - a.minutes || b.scenes - a.scenes);
  const top = all[0]?.minutes ?? 0;
  const places = all.slice(0, STORY_MAP_LIMITS.places).map((p) => ({
    ...p,
    size: (top > 0
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

  const spans = spansOf(index, perPage);
  let before: TimeKind | null = null;
  const scenes: MapScene[] = index.scenes.map((scene, s) => {
    const place = cast.places[s];
    const minutes =
      kind === 'play'
        ? estimateSeconds(scene.timing, wordsPerMinute) / 60
        : ((scene.pages?.eighths ?? 0) / 8) * minutesPerPage;
    const time = timeOf(place?.time ?? null, before);
    before = time.kind;
    const [from, to] = spans[s] ?? [0, 0];
    const location = place?.location ? placeWords(place.location) : '';
    return {
      n: s + 1,
      act: sections.length > 0 ? actIndexOf(scene.block) + 1 : null,
      from,
      to,
      minutes,
      place: location === '' ? null : location,
      title:
        kind === 'play' && location === '' && scene.heading.trim() !== ''
          ? scene.heading.trim()
          : null,
      time: time.time,
      timeKind: time.kind,
      inside: insideWords(place?.inside ?? 'none'),
      what: null,
      chips: [],
      planned: false,
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
      pages: mine.reduce((n, s) => n + (index.scenes[s]?.pages?.eighths ?? 0), 0) / 8,
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

  // Two lanes when at least half the scenes say inside or outside, or a time.
  const placed = index.scenes.filter((_, s) => {
    const p = cast.places[s];
    return p !== undefined && (p.inside !== 'none' || p.time !== null);
  }).length;
  const lanes = scenes.length > 0 && placed * 2 >= scenes.length ? 'two' : 'one';
  const sum = (list: readonly MapScene[]) => list.reduce((n, s) => n + s.minutes, 0);
  const known = scenes.filter((s) => s.inside !== null);
  const timed = scenes.filter((s) => s.timeKind !== null);
  const split =
    lanes === 'two'
      ? {
          indoors: percent(sum(known.filter((s) => s.inside === 'Inside')), sum(known)),
          night: percent(sum(timed.filter((s) => s.timeKind === 'night')), sum(timed)),
        }
      : null;

  const { places, more } = placesOf(cast, scenes);
  const author = scriptAuthor(doc).trim();
  const contact = options.contact?.trim() ?? '';
  const emptyActs = acts.filter((a) => a.empty).map((a) => a.n);
  const pages = layout.pages.filter((p) => p.number > 0).length;
  const gaps: MapGaps = {
    found: emptyActs.length > 0,
    planned: [],
    todo: [],
    emptyActs,
    tail: null,
    percent: null,
    written: pages,
    plannedPages: options.plannedPages,
    sentence: '',
  };
  const draft = Math.max(1, Math.floor(options.draft.number));

  return {
    kind,
    status: options.status ?? (gaps.found ? 'in-progress' : 'finished'),
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
    pace: paceOf(scenes),
    characters,
    pairs: [],
    places,
    placesMore: more,
    quotes,
    threads: options.include.threads ? threadsOf(doc, index) : [],
    gaps,
    interval: null,
    contact:
      options.include.contact && contact !== '' ? { text: contact, mailto: mailOf(contact) } : null,
  };
}
