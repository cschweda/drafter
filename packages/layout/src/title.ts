import type { TitlePage } from '@drafter/fountain';
import type { Template } from '@drafter/templates';
import { blankLine, columns, isBlank, joined, spanOf } from './lines';
import type { LayoutDiagnostic, LayoutLine, Page, TitlePageMode } from './types';
import { wrap } from './wrap';

/** The title's line, counted from the top edge of the paper. */
const TITLE_LINE = 22;

type Slot = 'title' | 'credit' | 'author' | 'source' | 'contact' | 'draft_date';

const SLOTS: Readonly<Record<string, Slot>> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  contact: 'contact',
  'draft date': 'draft_date',
  date: 'draft_date',
};

const CENTERED: readonly Slot[] = ['title', 'credit', 'author', 'source'];

/** Whether a title page key prints (Title, Credit, Author or Authors, Source, Contact, Draft date or Date); others, such as Copyright and Notes, don't. */
export const titleKeyPrints = (key: string): boolean =>
  Object.hasOwn(SLOTS, key.trim().toLowerCase());

/**
 * The title page with only the fields `mode` keeps: for `'title-author'`, those the layout prints
 * centered (title, credit, author or authors, and source, by the same names it reads), in their
 * order; or null for `'none'`. `'full'` returns it as is. Never changes the one it is given.
 */
export function titlePageFor(tp: TitlePage | null, mode: TitlePageMode): TitlePage | null {
  if (tp === null || mode === 'none') return null;
  if (mode === 'full') return tp;
  const fields = tp.fields.filter((field) => {
    const slot = SLOTS[field.key.trim().toLowerCase()];
    return slot !== undefined && CENTERED.includes(slot);
  });
  return { ...tp, fields };
}

export interface TitleResult {
  page: Page;
  /** The last line that prints, if any does. */
  last: number | null;
}

/**
 * The `centered-feature` title page: title, credit, author, and source
 * centered from line 22 of the paper, a blank line between each; the contact
 * block bottom left; the draft date bottom right, level with the contact
 * block's last line. Other keys (Copyright, Notes, and unknown ones) don't
 * print. Returns null when no field prints.
 */
export function titlePage(
  tp: TitlePage,
  template: Template,
  height: number,
  diagnostics: LayoutDiagnostic[],
): TitleResult | null {
  const { page } = template;
  const width = page.width - page.margin.left - page.margin.right;
  const half = Math.max(1, Math.floor(width / 2));
  const groups = new Map<Slot, LayoutLine[]>();

  for (const field of tp.fields) {
    const slot = SLOTS[field.key.trim().toLowerCase()];
    if (!slot || field.runs.every((runs) => joined(runs).trim() === '')) continue;
    const lines = groups.get(slot) ?? [];
    const bottom = slot === 'contact' || slot === 'draft_date';
    for (const runs of field.runs) {
      for (const piece of wrap(joined(runs), runs, bottom ? half : width)) {
        const length = columns(joined(piece));
        const col =
          slot === 'contact'
            ? 0
            : slot === 'draft_date'
              ? width - length
              : Math.floor((width - length) / 2);
        const span = spanOf(piece, field.span);
        lines.push({ col, runs: piece, role: slot, blockIndex: -1, span, synthetic: 'title' });
      }
    }
    groups.set(slot, lines);
  }
  if (groups.size === 0) return null;

  const middle: LayoutLine[] = [];
  for (const slot of CENTERED) {
    const lines = groups.get(slot);
    if (!lines) continue;
    if (middle.length > 0) middle.push(blankLine(tp.span.from));
    for (const line of lines) middle.push(line);
  }
  const contact = groups.get('contact') ?? [];
  const date = groups.get('draft_date') ?? [];
  const bottom = Math.max(contact.length, date.length);

  // The centered block moves up if it would run into the contact block, and a
  // title page with more lines than the page holds loses the excess.
  const limit = bottom > 0 ? height - bottom - 1 : height;
  let start = Math.min(
    Math.max(0, TITLE_LINE - page.margin.top),
    Math.max(0, limit - middle.length),
  );
  let bottomStart = height - bottom;
  if (middle.length > limit) {
    start = 0;
    bottomStart = bottom > 0 ? middle.length + 1 : height;
    diagnostics.push({
      code: 'title-page-overflow',
      severity: 'warning',
      span: { ...tp.span },
      message: "The title page has more lines than fit on a page, so the last of them don't print.",
    });
  }

  const rows: Array<LayoutLine | null> = Array.from({ length: height }, () => null);
  // Lines go in from `first`; a second line on a row becomes its right part.
  const place = (lines: readonly LayoutLine[], first: number) => {
    lines.forEach((line, k) => {
      const row = first + k;
      if (row >= height) return;
      const there = rows[row];
      rows[row] = there ? { ...there, right: line } : line;
    });
  };
  place(middle, start);
  place(contact, bottomStart + bottom - contact.length);
  place(date, bottomStart + bottom - date.length);

  let last: number | null = null;
  const lines = rows.map((row, k) => {
    if (row && !isBlank(row)) last = k;
    return row ?? blankLine(tp.span.from);
  });
  return {
    page: { number: 0, lines, sceneNumbersLeft: [], sceneNumbersRight: [] },
    last,
  };
}
