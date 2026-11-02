// Answers of a size an AI app can hold (§7.3): a list comes a page at a time, whole items while
// the answer's JSON stays under the budget, and one item too large for a page comes in parts.
import { MAX_ANSWER_CHARS } from './envelope';

/** A page of items, and where the next page starts (null: this was the last). */
export interface Page<T> {
  items: T[];
  next: number | null;
}

let budgetForTests: number | undefined;

/** The characters an answer may use: MAX_ANSWER_CHARS, unless a test set a smaller one. */
export function answerBudget(): number {
  return budgetForTests ?? MAX_ANSWER_CHARS;
}

/** For tests only: a smaller budget, so paging shows on a few files; undefined puts it back. */
export function __setBudgetForTests(budget: number | undefined): void {
  budgetForTests = budget;
}

/** What one more item adds to a JSON array: its own JSON and a comma. */
export function itemCost(item: unknown): number {
  return JSON.stringify(item).length + 1;
}

/**
 * Items from `start`, whole, while `overhead` (the answer's JSON without them) plus the array's
 * JSON stays within `budget`; always at least one item when any are left.
 */
export function pageOf<T>(
  items: readonly T[],
  start: number,
  budget: number,
  overhead: number,
): Page<T> {
  const page: T[] = [];
  // `[]`, then each item and a comma; the last comma isn't written, so this errs by one.
  let used = overhead + 2;
  let i = start;
  for (; i < items.length; i++) {
    const item = items[i] as T;
    const cost = itemCost(item);
    if (page.length > 0 && used + cost - 1 > budget) break;
    page.push(item);
    used += cost;
  }
  return { items: page, next: i < items.length ? i : null };
}

/** What a code point costs inside a JSON string, as `JSON.stringify` writes it. */
function escapedLength(code: number): number {
  if (code === 0x22 || code === 0x5c) return 2;
  if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) return 2;
  if (code < 0x20) return 6;
  // A lone surrogate is written as `\udxxx`.
  if (code >= 0xd800 && code <= 0xdfff) return 6;
  return code > 0xffff ? 2 : 1;
}

/**
 * An item's text too large for one page, in parts whose JSON-escaped length (and so their own) is
 * at most `budget`: whole lines while they fit, and a line longer than a part cut at code points,
 * never inside a surrogate pair. The parts joined are the text exactly.
 */
export function partsOf(text: string, budget: number): string[] {
  if (budget < 6) throw new RangeError('A part needs room for at least one escaped character.');
  const parts: string[] = [];
  let partStart = 0;
  let partCost = 0;
  /** Where the current line began, and what the part held before it. */
  let lineStart = 0;
  let costBeforeLine = 0;
  let i = 0;
  const cut = (at: number) => {
    parts.push(text.slice(partStart, at));
    partStart = at;
  };
  while (i < text.length) {
    const code = text.codePointAt(i) as number;
    const width = code > 0xffff ? 2 : 1;
    const cost = escapedLength(code);
    if (partCost + cost > budget && lineStart > partStart) {
      // The part ends where this line began; the line starts the next part.
      cut(lineStart);
      partCost -= costBeforeLine;
      costBeforeLine = 0;
    }
    if (partCost + cost > budget) {
      // The line alone is longer than a part: cut it here, between code points.
      cut(i);
      partCost = 0;
      lineStart = i;
      costBeforeLine = 0;
    }
    partCost += cost;
    i += width;
    if (code === 0x0a) {
      lineStart = i;
      costBeforeLine = partCost;
    }
  }
  if (partStart < text.length || parts.length === 0) parts.push(text.slice(partStart));
  return parts;
}

/**
 * `text` whole when its JSON-escaped length is at most `max`; else its start, cut between code
 * points (never inside a surrogate pair) so that it is, and `cut: true`.
 */
export function clipText(text: string, max: number): { text: string; cut: boolean } {
  let cost = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i) as number;
    const next = cost + escapedLength(code);
    if (next > max) return { text: text.slice(0, i), cut: true };
    cost = next;
    i += code > 0xffff ? 2 : 1;
  }
  return { text, cut: false };
}

/** Items from `start`, whole, while their JSON array stays within `room`: possibly none. */
export function fitting<T>(items: readonly T[], room: number): T[] {
  const kept: T[] = [];
  let used = 2;
  for (const item of items) {
    const cost = itemCost(item);
    if (used + cost - 1 > room) break;
    kept.push(item);
    used += cost;
  }
  return kept;
}
