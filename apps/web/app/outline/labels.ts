import type { Scene, SceneColor, Section } from '@drafter/outline';
import { DEFAULT_RATES, pageSeconds, type Rates, shortTime, timeWords } from '../stats/time-format';

// What the Outline says about a row, on screen and to a screen reader (Phase 2 design §6.1).

/** A length in eighths of a page, short: `1/8 p`, `1 p`, `1 3/8 pp`. */
export function lengthLabel(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  const amount = [whole > 0 ? String(whole) : '', rest > 0 ? `${rest}/8` : '']
    .filter(Boolean)
    .join(' ');
  return `${amount} ${eighths > 8 ? 'pp' : 'p'}`;
}

/** The same length in words: `1/8 page`, `1 page`, `1 3/8 pages`. */
export function lengthWords(eighths: number): string {
  const short = lengthLabel(eighths);
  return short.replace(/ pp$/, ' pages').replace(/ p$/, ' page');
}

/** The colors' swatches: decoration only, since the color's name is always shown beside it. */
export const SWATCH: Record<SceneColor, string> = {
  red: '#d9534f',
  orange: '#e8883a',
  yellow: '#e5c13a',
  green: '#4caf6a',
  teal: '#2fa7a0',
  blue: '#4a86d9',
  purple: '#9a6ad6',
  pink: '#e06aa8',
  gray: '#8c93a1',
};

/** A color's name as the writer reads it: Drafter's word, or what the note says. */
export const colorName = (value: string): string => value;

/** The swatch for a color note's value, or none for a word Drafter doesn't know. */
export const swatchOf = (value: string): string | undefined =>
  (SWATCH as Record<string, string | undefined>)[value];

/** "Scene 12" or "Scene 12A": the locked number if it has one, else its place. */
export const sceneNumber = (scene: Scene): string => scene.number ?? String(scene.ordinal);

/** A row's time at the page rate: '1 min 25 s', or '' without pages. */
export function rowTime(eighths: number | null, rates: Rates): string {
  return eighths === null ? '' : shortTime(pageSeconds(eighths, rates.minutesPerPage));
}

/** The same in words, for a row's name: 'about 1 minute 25 seconds'. */
const rowTimeWords = (eighths: number, rates: Rates): string =>
  timeWords(pageSeconds(eighths, rates.minutesPerPage));

/**
 * A scene row's name: "Scene 12, INT. KITCHEN - NIGHT, blue, page 12, 1 3/8 pages, about 1 minute
 * 25 seconds", the time at the script's page rate (`rates`, a minute a page when not given).
 */
export function sceneName(scene: Scene, rates: Rates = DEFAULT_RATES): string {
  const parts = [`Scene ${sceneNumber(scene)}`, scene.heading || 'Untitled scene'];
  if (scene.color) parts.push(colorName(scene.color.value));
  if (scene.pages) {
    parts.push(
      `page ${scene.pages.page}`,
      lengthWords(scene.pages.eighths),
      rowTimeWords(scene.pages.eighths, rates),
    );
  }
  return parts.join(', ');
}

/** A section row's name: "Act One, 5 scenes, 12 pages, about 12 minutes". */
export function sectionName(section: Section, rates: Rates = DEFAULT_RATES): string {
  const parts = [section.title || 'Untitled section'];
  parts.push(`${section.scenes} ${section.scenes === 1 ? 'scene' : 'scenes'}`);
  if (section.eighths !== null) {
    parts.push(lengthWords(section.eighths), rowTimeWords(section.eighths, rates));
  }
  return parts.join(', ');
}
