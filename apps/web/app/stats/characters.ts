import type { Cast } from '@drafter/cast';
import { lengthLabel, lengthWords } from '~/outline/labels';
import { pageSeconds, type Rates, shortTime, timeWords } from './time-format';

// The Stats tab's Characters table (seeing-the-script design §4.3): a row per speaking character,
// most speeches first, every figure read from the cast, so the tab, Scaffold, and the grid agree.

export interface CharacterRowView {
  key: string;
  /** As first typed. */
  name: string;
  speeches: number;
  /** Scenes they are in, speaking or silent. */
  scenes: number;
  /** Scenes they speak in: the window's old Scenes figure. */
  speaksIn: number;
  /** Dialogue and lyrics. */
  words: number;
  /** "18%": whole percents that add up to 100 across the table. */
  share: string;
  /** "6/8 p · about 45 s", and the same in words; null until the pages are ready. */
  screen: { text: string; words: string } | null;
  /** "PIA (3), RUFUS (2), MAEVE (1)": the three they share most scenes with; empty for none. */
  often: string;
}

/**
 * Whole percents of `amounts`' total, by largest remainder, so they add up to 100: each is rounded
 * down, then the points left go one each to the largest remainders, the earlier first on a tie.
 * All zeros (or none) share nothing.
 */
export function shares(amounts: readonly number[]): number[] {
  const total = amounts.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((n) => (n * 100) / total);
  const whole = exact.map(Math.floor);
  let left = 100 - whole.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, i) => ({ i, rest: n - (whole[i] as number) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    whole[i] = (whole[i] as number) + 1;
    left--;
  }
  return whole;
}

/** A screen time in pages and in minutes at the script's page rate. */
function screenTime(eighths: number, minutesPerPage: number): { text: string; words: string } {
  const seconds = pageSeconds(eighths, minutesPerPage);
  if (eighths === 0) return { text: '0 p', words: 'no time' };
  return {
    text: `${lengthLabel(eighths)} · about ${shortTime(seconds)}`,
    words: `${lengthWords(eighths)}, ${timeWords(seconds)}`,
  };
}

/** The Characters table's rows, in the cast's order (most speeches first). */
export function characterRows(cast: Cast, rates: Rates): CharacterRowView[] {
  const names = new Map(cast.characters.map((c) => [c.key, c.name]));
  const figures = cast.characters.map((c) => cast.figures.get(c.key));
  const percents = shares(figures.map((f) => f?.words ?? 0));
  return cast.characters.map((character, i) => {
    const f = figures[i];
    return {
      key: character.key,
      name: character.name,
      speeches: f?.speeches ?? 0,
      scenes: f?.scenes.length ?? 0,
      speaksIn: f?.speaksIn ?? 0,
      words: f?.words ?? 0,
      share: `${percents[i] ?? 0}%`,
      screen: f?.screenEighths == null ? null : screenTime(f.screenEighths, rates.minutesPerPage),
      often: (f?.sharedWith ?? [])
        .slice(0, 3)
        .map((other) => `${names.get(other.key) ?? other.key} (${other.scenes})`)
        .join(', '),
    };
  });
}
