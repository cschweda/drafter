import { SCENE_SWATCH } from '@drafter/notes';
import { type Lanes, type LaneUnit, rulerMarks, type ThreadInfo } from '@drafter/outline';
import { wordsLabel } from '../novel/labels';
import { lengthLabel, lengthWords } from '../outline/labels';
import { type LaneRow, laneRows } from './grid-keys';

// What the Lanes, their table, and the phone's list say (threads design §7.3, §7.5): each row's
// header and name, each block's name and card, a length in the lanes' unit, the ruler's marks, and
// the table's cells. Drafter's own words; color never says anything alone.

export type Noun = 'scene' | 'passage';

const plural = (n: number, noun: Noun) => `${n} ${n === 1 ? noun : `${noun}s`}`;

/** "A", "A and C", "A, B, and C". */
export function andList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

/** A unit's length as shown: "1 3/8 pp" or "1,200 words". */
export const lengthText = (unit: Lanes['unit'], length: number): string =>
  unit === 'pages' ? lengthLabel(length) : wordsLabel(length);

/** The same, as it is read: "1 3/8 pages" or "1,200 words". */
export const lengthSpoken = (unit: Lanes['unit'], length: number): string =>
  unit === 'pages' ? lengthWords(length) : wordsLabel(length);

/** A script unit's heading without the number its `heading` starts with. */
function headingOf(u: LaneUnit, noun: Noun): string {
  if (noun === 'passage') return u.heading;
  const prefix = `${u.label} `;
  return u.heading.startsWith(prefix) ? u.heading.slice(prefix.length) : u.heading;
}

/** "Scene 14, INT. WAREHOUSE – NIGHT" or a passage's title. */
export const unitTitle = (u: LaneUnit, noun: Noun): string =>
  noun === 'scene' ? `Scene ${u.label}, ${headingOf(u, noun)}` : u.heading;

/** "thread A", "threads A and C", "no thread"; "…, from its chapter" when inherited. */
export function threadsPhrase(u: LaneUnit): string {
  if (u.threads.length === 0) return 'no thread';
  const said = `${u.threads.length === 1 ? 'thread' : 'threads'} ${andList(u.threads)}`;
  return u.inherited ? `${said}, from its chapter` : said;
}

/** A block's name: "Scene 14, INT. WAREHOUSE – NIGHT, 2 pages, threads A and C". */
export const blockName = (u: LaneUnit, lanes: Lanes, noun: Noun): string =>
  `${unitTitle(u, noun)}, ${lengthSpoken(lanes.unit, u.length)}, ${threadsPhrase(u)}`;

/** A block's card: its title, its length, and every thread it is in. */
export function cardLines(u: LaneUnit, lanes: Lanes, noun: Noun): string[] {
  const threads =
    u.threads.length === 0
      ? 'No thread'
      : `${u.threads.length === 1 ? 'Thread' : 'Threads'}: ${u.threads.join(' · ')}${u.inherited ? ' (from its chapter)' : ''}`;
  return [unitTitle(u, noun), lengthText(lanes.unit, u.length), threads];
}

/** What the Lanes say with no threads yet (threads design §7.3). */
export const noThreadsYet = (noun: Noun): string =>
  noun === 'scene'
    ? 'No threads yet. Add one from a scene’s menu: Threads…'
    : 'No threads yet. Add one from a chapter’s or section’s menu: Threads…';

/** What they say with no scenes or passages at all. */
export const nothingYet = (noun: Noun): string =>
  noun === 'scene'
    ? 'No scenes yet. Each scene heading you write shows here.'
    : 'No chapters yet. A chapter starts with # and its title.';

/** One row of the Lanes, the table, and the list, with what each says about it. */
export interface LaneRowView extends LaneRow {
  /** The thread's label as first typed, or "No thread". */
  label: string;
  name: string | null;
  /** The swatch's color, or null for No thread. */
  swatch: string | null;
  /** The units it is in, not counting a section's threads from its chapter. */
  count: number;
  /** "Thread A, The heist, 9 scenes", or "No thread, 3 scenes". */
  header: string;
  /** Its units' lengths, added: as shown. */
  length: string;
  /** Its share of the work: "12%", "<1%". */
  share: string;
  /** Its units, runs of three or more folded: "1, 2, 5 to 9". */
  list: string;
}

/** Of `indexes` (into `units`), runs of three or more in a row folded: "1, 2, 5 to 9". */
function folded(units: readonly LaneUnit[], indexes: readonly number[], noun: Noun): string {
  const name = (i: number) => {
    const u = units[i] as LaneUnit;
    const said = noun === 'scene' ? u.label : u.heading;
    return u.inherited ? `${said} (from its chapter)` : said;
  };
  const parts: string[] = [];
  for (let i = 0; i < indexes.length; ) {
    const first = indexes[i] as number;
    // A section's threads from its chapter are named one by one, never folded.
    if (units[first]?.inherited) {
      parts.push(name(first));
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < indexes.length &&
      (indexes[j + 1] as number) === (indexes[j] as number) + 1 &&
      !units[indexes[j + 1] as number]?.inherited
    ) {
      j++;
    }
    if (j - i >= 2) parts.push(`${name(first)} to ${name(indexes[j] as number)}`);
    else for (let k = i; k <= j; k++) parts.push(name(indexes[k] as number));
    i = j + 1;
  }
  return parts.join(noun === 'scene' ? ', ' : '; ');
}

function shareOf(length: number, total: number): string {
  if (!(total > 0) || length <= 0) return '0%';
  const pct = (length / total) * 100;
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

/** The rows of `lanes`, described with `info`'s names and colors. */
export function laneRowViews(lanes: Lanes, info: readonly ThreadInfo[], noun: Noun): LaneRowView[] {
  const byKey = new Map(info.map((t) => [t.key, t]));
  return laneRows(lanes).map((row) => {
    const sum = row.units.reduce((n, i) => n + (lanes.units[i] as LaneUnit).length, 0);
    const own = row.units.filter((i) => !(lanes.units[i] as LaneUnit).inherited).length;
    const common = {
      ...row,
      count: own,
      length: lengthText(lanes.unit, sum),
      share: shareOf(sum, lanes.total),
      list: folded(lanes.units, row.units, noun),
    };
    if (row.key === null) {
      return {
        ...common,
        label: 'No thread',
        name: null,
        swatch: null,
        header: `No thread, ${plural(own, noun)}`,
      };
    }
    const found = byKey.get(row.key);
    const label = found?.label ?? lanes.threads.find((t) => t.key === row.key)?.label ?? row.key;
    const name = found?.name ?? null;
    return {
      ...common,
      label,
      name,
      swatch: found ? SCENE_SWATCH[found.color] : null,
      header: [`Thread ${label}`, name, plural(own, noun)].filter(Boolean).join(', '),
    };
  });
}

export interface LaneMark {
  /** 0–1 along the axis. */
  at: number;
  /** The number shown, or '' for a tick. */
  text: string;
}

/** Word spacings a ruler numbers at, smallest first. */
const WORD_STEPS = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
/** How far apart, in pixels, the ruler's numbers are meant to be. */
const WORD_GAP_PX = 56;

/**
 * The ruler's marks: page numbers (by the Structure strip's steps) for lanes in pages, thousands of
 * words ("12k") for lanes in words, numbered at the step whose numbers fall nearest 56 px apart.
 */
export function laneMarks(lanes: Lanes, widthPx: number): LaneMark[] {
  if (!(lanes.total > 0) || !(widthPx > 0)) return [];
  if (lanes.unit === 'pages') {
    const strip = { unit: 'pages' as const, start: 0, length: lanes.total / 8, rows: [] };
    // The strip's numbers fall about 40 px apart; the lanes' ruler is wider-set (about 56 px), so
    // it is measured as if 0.7 of its width: the marks are fractions of the axis either way.
    return rulerMarks(strip, widthPx * 0.7).map((m) => ({
      at: m.at,
      text: m.numbered ? String(m.page) : '',
    }));
  }
  const pxPerWord = widthPx / lanes.total;
  let step = WORD_STEPS[0] as number;
  for (const s of WORD_STEPS) {
    if (Math.abs(s * pxPerWord - WORD_GAP_PX) <= Math.abs(step * pxPerWord - WORD_GAP_PX)) step = s;
  }
  const marks: LaneMark[] = [];
  for (let n = step; n < lanes.total; n += step) {
    marks.push({ at: n / lanes.total, text: n >= 1000 ? `${n / 1000}k` : String(n) });
  }
  return marks;
}
