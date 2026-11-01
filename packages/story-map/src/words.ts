import type { Place } from '@drafter/cast';
import type { MapScene, TimeKind } from './types';

// Plain words (story-map design §5): the page is for people who have never seen a script, so a
// heading's parts become a place, a time, and "Inside" or "Outside", and lengths are minutes.
// Every scan here is one pass over the text; no pattern can backtrack on what the writer typed.

/** The small words title case leaves in lower case, except at the start. */
const SMALL = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/** A letter that has an upper and a lower case. */
const cased = (c: string) => c.toLowerCase() !== c.toUpperCase();
const isUpper = (c: string) => cased(c) && c === c.toUpperCase();
const isLower = (c: string) => cased(c) && c === c.toLowerCase();
const isSpace = (c: string | undefined) => c !== undefined && c !== '' && c.trim() === '';

/** One word in title case: its first letter, and the first after a hyphen, in capitals. */
function titleWord(word: string, first: boolean): string {
  const chars = Array.from(word);
  // Typed in mixed case (`McCLANE`, `iPhone`): the writer chose it.
  if (chars.some(isUpper) && chars.some(isLower)) return word;
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  const out = Array.from(lower);
  let start = true;
  for (let i = 0; i < out.length; i++) {
    const c = out[i] as string;
    if (start && cased(c)) {
      out[i] = c.toUpperCase();
      start = false;
    } else if (c === '-') start = true;
    // `O'NEIL`: one letter, then an apostrophe.
    else if ((c === "'" || c === '’') && i === 1) start = true;
  }
  return out.join('');
}

/** Each word in title case; letters with no case (東京, بيت) are left as they are. */
export function titleCase(text: string): string {
  let first = true;
  return text
    .split(/(\s+)/)
    .map((part) => {
      if (part === '' || isSpace(part[0])) return part;
      const word = titleWord(part, first);
      first = false;
      return word;
    })
    .join('');
}

/** The dashes a heading may use between its parts: hyphen, the Unicode dashes, and minus. */
const DASHES = new Set(['-', '‐', '‑', '‒', '–', '—', '―', '−']);

/** `text` without a trailing locked scene number (`#12A#`). */
function withoutNumber(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith('#')) return trimmed;
  const open = trimmed.lastIndexOf('#', trimmed.length - 2);
  return open < 0 ? trimmed : trimmed.slice(0, open).trimEnd();
}

/** A heading's parts after a slash with a space beside it (`KITCHEN / EXT. GARDEN`); `24/7` stays. */
function slashParts(part: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < part.length; i++) {
    if (part[i] === '/' && (isSpace(part[i - 1]) || isSpace(part[i + 1]))) {
      out.push(part.slice(from, i));
      from = i + 1;
    }
  }
  out.push(part.slice(from));
  return out;
}

/** `INT.`, `EXT.`, `EST.`, `INT./EXT.`, `I/E` at a part's start: anchored, one pass. */
const PREFIX =
  /^(?:int\.?\s*\/\s*ext|ext\.?\s*\/\s*int|i\s*\/\s*e|e\s*\/\s*i|int|ext|est)\.?(?=\s|$)/i;

/** A part without a leading `INT.` or `EXT.` (a heading of two places names it for each), trimmed. */
const withoutPrefix = (part: string) => part.trim().replace(PREFIX, '').trim();

/** A heading's location in plain words: "HALL HOUSE - BACK ROOM #3#" → "Hall House, Back Room". */
export function placeWords(location: string): string {
  const text = withoutNumber(location);
  const parts: string[] = [];
  let from = 0;
  for (let i = 1; i < text.length - 1; i++) {
    if (DASHES.has(text[i] as string) && isSpace(text[i - 1]) && isSpace(text[i + 1])) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts
    .flatMap(slashParts)
    .map(withoutPrefix)
    .filter((part) => part !== '')
    .map(titleCase)
    .join(', ');
}

/** Whether a time follows on from the scene before (`LATER THAT NIGHT`, `MOMENTS LATER`). */
const followsOn = (key: string) => key.startsWith('LATER ') || key.endsWith(' LATER');

/**
 * A location's last part when it is a follow-on time the cast doesn't read as one
 * (`GARAGE - LATER THAT NIGHT`): split off, as typed. Otherwise the location as it is.
 */
export function followOn(location: string): { location: string; time: string | null } {
  const text = location.trimEnd();
  for (let i = text.length - 2; i > 0; i--) {
    if (DASHES.has(text[i] as string) && isSpace(text[i - 1]) && isSpace(text[i + 1])) {
      const part = text.slice(i + 1).trim();
      if (!followsOn(part.toUpperCase().split(/\s+/).join(' '))) break;
      return { location: text.slice(0, i).trimEnd(), time: part };
    }
  }
  return { location, time: null };
}

const DAY = new Set(['DAY', 'MORNING', 'AFTERNOON']);
const NIGHT = new Set(['NIGHT']);
const TWILIGHT = new Set(['DAWN', 'DUSK', 'SUNSET', 'SUNRISE', 'EVENING']);
/** Times that are no time of their own: the scene takes the one before's. */
const FOLLOWS = new Set(['LATER', 'SAME', 'CONTINUOUS', 'MOMENTS LATER']);

/**
 * A heading's time in words and its colour: day, night, or twilight. A time that follows on
 * (`LATER`, `CONTINUOUS`) shows none and takes `before`'s colour; no time is none.
 */
export function timeOf(
  time: string | null,
  before: TimeKind | null,
): { time: string | null; kind: TimeKind | null } {
  if (time === null) return { time: null, kind: null };
  const key = time.trim().toUpperCase().split(/\s+/).join(' ');
  if (FOLLOWS.has(key)) return { time: null, kind: before };
  // `LATER THAT NIGHT`, `MOMENTS LATER`: it follows on, so the colour is the scene before's.
  if (followsOn(key)) {
    return { time: titleCase(time.trim()), kind: before };
  }
  const kind = DAY.has(key)
    ? 'day'
    : NIGHT.has(key)
      ? 'night'
      : TWILIGHT.has(key)
        ? 'twilight'
        : null;
  return { time: titleCase(time.trim()), kind };
}

/** Inside, outside, or both, in words; null for a heading that says neither. */
export function insideWords(inside: Place['inside']): MapScene['inside'] {
  if (inside === 'inside') return 'Inside';
  if (inside === 'outside') return 'Outside';
  if (inside === 'both') return 'Inside and out';
  return null;
}

/** "under a minute", "2 min", "about 1 hr 50 min": a length to watch, in whole minutes. */
export function minutesWords(minutes: number): string {
  const whole = Math.round(minutes);
  if (!(whole >= 1)) return 'under a minute';
  if (whole < 60) return `${whole} min`;
  const rest = whole % 60;
  return `about ${Math.floor(whole / 60)} hr${rest > 0 ? ` ${rest} min` : ''}`;
}

const LETTER = /[\p{L}\p{N}]/u;

/** The first letter (or digit) of each of the first two words, as typed: "Wren Abernathy" → "WA". */
export function initialsOf(name: string): string {
  let out = '';
  let count = 0;
  for (const word of name.split(/\s+/)) {
    if (count === 2) break;
    const c = Array.from(word).find((ch) => LETTER.test(ch));
    if (c === undefined) continue;
    out += c;
    count++;
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Nov 2026", in UTC, so every reader sees the day it was written. */
export function dateWords(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
