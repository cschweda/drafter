import type { Layout } from '@drafter/layout';
import { type ProductionSet, REVISION_COLORS } from '@drafter/production';

// What the Production tab and the status bar say of a production (production design §5).

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A set's swatch color for a style attribute: its own when it is `#rrggbb` (it comes from the
 * file, so anything else is never put in a style), else the default for its name ("Double Blue"
 * takes Blue's), else null, for no swatch.
 */
export function swatchOf(set: Pick<ProductionSet, 'name' | 'color'>): string | null {
  if (typeof set.color === 'string' && HEX.test(set.color)) return set.color;
  return REVISION_COLORS[set.name.replace(/^Double /, '')] ?? null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-11-09` as "9 November 2026"; anything else as it is. */
export function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** How many pages have a line marked by the set named `name`. */
export function pagesMarked(layout: Layout | null, name: string): number {
  if (!layout) return 0;
  return layout.pages.filter((page) =>
    page.lines.some((line) => line.mark?.set === name || line.right?.mark?.set === name),
  ).length;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Blue revision, 12 November 2026, 14 pages marked". */
export function openSetLine(set: ProductionSet, marked: number): string {
  return `${set.name} revision, ${longDate(set.date)}, ${plural(marked, 'page', 'pages')} marked`;
}
