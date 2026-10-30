import type { Doc } from '@drafter/fountain';
import type { Scene } from '@drafter/outline';
import { resolveRole, type Template } from '@drafter/templates';

// Where a scene is (seeing-the-script design §3.6): its location, inside or outside, and its time
// of day, read from the heading. The Stats tab's split of the headings reads `insideOf` and
// `dayOrNight` from here.

export interface Place {
  /** The heading's text without its prefix, its time, and a locked number; as typed. */
  location: string | null;
  /** The location in capitals, its spaces collapsed and every dash read as `-`. */
  key: string | null;
  inside: 'inside' | 'outside' | 'both' | 'none';
  /** The heading's time of day, as typed, when it is one of `TIMES_OF_DAY`. */
  time: string | null;
}

/** The times of day a heading's last part is read as (design Call 13), in capitals. */
export const TIMES_OF_DAY: readonly string[] = Object.freeze([
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'SUNSET',
  'SUNRISE',
  'LATER',
  'CONTINUOUS',
  'SAME',
  'MOMENTS LATER',
]);
const TIMES = new Set(TIMES_OF_DAY);

const isSpace = (c: string | undefined) => c !== undefined && c !== '' && c.trim() === '';

/**
 * A heading's prefix: both inside and outside, in either order (`INT./EXT.`, `EXT./INT.`, `I/E`,
 * `E/I`), or one of `INT.`, `EXT.`, `EST.` with its period, a space, or the end after it. No
 * quantifier is nested and none is next to another that can match the same characters.
 */
const PREFIX =
  /^(?:(?<both>INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|E\/I)\b\.?|(?<one>INT|EXT|EST)(?:\.|(?=\s)|$))/i;

/** Whether a heading's text says inside, outside, both, or neither, by its prefix; and the prefix. */
function prefixOf(text: string): { inside: Place['inside']; length: number } {
  const match = PREFIX.exec(text.trimStart());
  if (!match) return { inside: 'none', length: 0 };
  const length = match[0].length + (text.length - text.trimStart().length);
  if (match.groups?.both) return { inside: 'both', length };
  const one = match.groups?.one?.toUpperCase();
  return { inside: one === 'INT' ? 'inside' : 'outside', length };
}

/** Inside, outside, both, or none, from a heading's text (`INT.`; `EXT.` and `EST.`; both; none). */
export function insideOf(heading: string): Place['inside'] {
  return prefixOf(heading).inside;
}

/**
 * DAY or NIGHT, from the first part after the place that begins with either: the parts are split
 * at ` - ` (or an en dash), so `NIGHT - CONTINUOUS`, `DAY - LATER`, and `NIGHT (1987)` are read,
 * and the place's own words (`DAY CARE`) are not. Null for anything else, or no time. The Stats
 * tab's day and night split. The parts are found by one scan, not a pattern, so a heading of many
 * spaces costs no more than its length.
 */
export function dayOrNight(text: string, prefix: string | null): 'DAY' | 'NIGHT' | null {
  const rest = prefix ? text.slice(prefix.length) : text;
  const cuts: number[] = [];
  for (let i = 1; i < rest.length - 1; i++) {
    const c = rest[i];
    if ((c === '-' || c === '–') && isSpace(rest[i - 1]) && isSpace(rest[i + 1])) cuts.push(i);
  }
  for (let k = 0; k < cuts.length; k++) {
    const part = rest.slice((cuts[k] as number) + 1, cuts[k + 1] ?? rest.length);
    const word = /^\p{L}+/u.exec(part.trim().toUpperCase())?.[0];
    if (word === 'DAY' || word === 'NIGHT') return word;
  }
  return null;
}

/** The dashes a heading may use between its parts: hyphen, the Unicode dashes, and minus. */
const DASHES = new Set(['-', '‐', '‑', '‒', '–', '—', '―', '−']);

/** Where the last dash with white space on both sides is, or -1. */
function lastSeparator(text: string): number {
  for (let i = text.length - 2; i > 0; i--) {
    if (DASHES.has(text[i] as string) && isSpace(text[i - 1]) && isSpace(text[i + 1])) return i;
  }
  return -1;
}

/** In capitals, white space collapsed, every dash a hyphen, and a dash with a space beside it spaced. */
export function locationKey(location: string): string {
  let out = '';
  for (const c of location.toUpperCase()) out += DASHES.has(c) ? '-' : c;
  return out
    .split(/\s+/)
    .filter((part) => part !== '')
    .join(' ')
    .replace(/ ?- ?/g, (dash) => (dash.length > 1 ? ' - ' : '-'));
}

const NONE: Place = { location: null, key: null, inside: 'none', time: null };

/**
 * Where `scene` is: from a screenplay's heading; a stage play's scene (a `##` section) names a
 * place only when written as a screenplay's heading is, `## INT. PARLOR - EVENING` (Call 16).
 */
export function placeOf(scene: Scene, doc: Doc, template: Template): Place {
  const block = doc.blocks[scene.block];
  if (!block) return NONE;
  const text = scene.heading.trim();
  const { inside, length } = prefixOf(text);
  const play = resolveRole(template, block, null) === 'scene_heading_play';
  if (play && length === 0) return NONE;
  let rest = text.slice(length).trim();
  let time: string | null = null;
  const at = lastSeparator(rest);
  if (at >= 0) {
    const part = rest.slice(at + 1).trim();
    if (TIMES.has(part.toUpperCase().split(/\s+/).join(' '))) {
      time = part;
      rest = rest.slice(0, at).trim();
    }
  }
  if (rest === '') return { ...NONE, inside, time };
  return { location: rest, key: locationKey(rest), inside, time };
}
