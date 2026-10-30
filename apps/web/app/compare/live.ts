import type { GapMark, LineMark, PageMarks } from '@drafter/compare';
import type { Page } from '@drafter/layout';
import type { ScriptView } from '@drafter/render-html';
import { placeBefore, rowOf, spanKey } from './draw';
import { gapName } from './labels';

// Show changes' marks on the Script pane's pages (version-history design §4.3), put on through the
// view's `decorate` hook as each page is drawn. Whole lines only (Call 18): an added or changed
// printed line gets a band in the row tint behind it with a bar at the page's edge, a + in the left
// margin (hidden from a screen reader), and a hidden "added, " or "changed, " at its start; removed
// lines, and new lines that print nothing, are a thin rule with a button in the left margin ("−
// 3 lines removed") that shows them under the rule, struck through in the deletion tint. The
// colors are the Changes view's `--diff-*` tokens, so Settings' palette applies. Every mark has
// `data-change`, where Next change puts focus. Nothing here is printed or exported: the PDF is drawn
// from the layout, never from these pages, and a print of the page hides them (`ScriptPane.vue`).

/** What each page has, made once per marks. */
interface PageShare {
  lines: LineMark[];
  gaps: Array<[GapMark, number]>;
}
const byPage = new WeakMap<PageMarks, Map<number, PageShare>>();

function shareOf(marks: PageMarks, page: number): PageShare | undefined {
  let pages = byPage.get(marks);
  if (!pages) {
    pages = new Map();
    const of = (n: number) => {
      let share = pages?.get(n);
      if (!share) {
        share = { lines: [], gaps: [] };
        pages?.set(n, share);
      }
      return share;
    };
    for (const line of marks.lines) of(line.page).lines.push(line);
    for (const [i, gap] of marks.gaps.entries()) of(gap.page).gaps.push([gap, i]);
    byPage.set(marks, pages);
  }
  return pages.get(page);
}

/** A page this module marked: its marks come off before it is marked again. */
const MARKED = 'liveMarked';

/** Takes Show changes' marks off a page, leaving it as `buildPage` drew it. */
function unmark(el: HTMLElement): void {
  if (el.dataset[MARKED] === undefined) return;
  for (const added of el.querySelectorAll('.live-band, .live-sign, .live-gap, .live-said'))
    added.remove();
  for (const line of el.querySelectorAll<HTMLElement>('.live-mark')) {
    line.classList.remove('live-mark', 'live-added', 'live-changed');
    line.removeAttribute('data-change');
    line.removeAttribute('tabindex');
  }
  delete el.dataset[MARKED];
}

/** A row-high element of the page's at `row`, hidden from a screen reader. */
function rowElement(el: HTMLElement, className: string, row: number): HTMLElement {
  const made = el.ownerDocument.createElement('div');
  made.className = className;
  made.setAttribute('aria-hidden', 'true');
  made.style.setProperty('--row', String(row));
  return made;
}

/** Puts `marks`' marks for page `page` on `el`, a page `buildPage` drew. */
function mark(el: HTMLElement, page: number, marks: PageMarks): void {
  const share = shareOf(marks, page);
  if (!share) return;
  const doc = el.ownerDocument;
  el.dataset[MARKED] = '';
  const bySpan = new Map<string, HTMLElement[]>();
  let lastRow = 0;
  for (const line of el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')) {
    const key = spanKey(line.dataset.from ?? '', line.dataset.to ?? '');
    const list = bySpan.get(key);
    if (list) list.push(line);
    else bySpan.set(key, [line]);
    lastRow = Math.max(lastRow, rowOf(line));
  }
  const banded = new Set<number>();
  for (const found of share.lines) {
    for (const line of bySpan.get(spanKey(found.span.from, found.span.to)) ?? []) {
      if (line.classList.contains('live-mark')) continue;
      line.classList.add('live-mark', `live-${found.kind}`);
      line.dataset.change = String(found.change);
      line.tabIndex = -1;
      const said = doc.createElement('span');
      said.className = 'drafter-sr-only live-said';
      said.textContent = `${found.kind}, `;
      line.prepend(said);
      const row = rowOf(line);
      if (banded.has(row)) continue;
      banded.add(row);
      // Behind the lines: first in the page, so the type paints over it.
      el.prepend(rowElement(el, 'live-band', row));
      const sign = rowElement(el, 'live-sign', row);
      sign.textContent = '+';
      el.append(sign);
    }
  }
  for (const [gap, index] of share.gaps) {
    const before = gap.before
      ? bySpan.get(spanKey(gap.before.from, gap.before.to))?.[0]
      : undefined;
    const row = before ? rowOf(before) : lastRow + 1;
    const wrap = doc.createElement('div');
    wrap.className = `live-gap live-gap-${gap.kind}`;
    wrap.style.setProperty('--row', String(row));
    const held = doc.createElement('div');
    held.id = `live-gap-${page}-${index}`;
    held.className = 'live-gap-lines';
    held.hidden = true;
    for (const text of gap.lines) {
      const line = doc.createElement(gap.kind === 'removed' ? 'del' : 'ins');
      line.textContent = text === '' ? ' ' : text;
      held.append(line);
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'live-gap-button';
    button.dataset.change = String(gap.change);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', held.id);
    const sign = doc.createElement('span');
    sign.setAttribute('aria-hidden', 'true');
    sign.textContent = gap.kind === 'removed' ? '− ' : '+ ';
    button.append(sign, gapName(gap));
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      held.hidden = !open;
    });
    wrap.append(button, held);
    if (before) {
      const at = placeBefore(el, before);
      at.parentElement?.insertBefore(wrap, at);
    } else el.insertBefore(wrap, el.querySelector('.drafter-furniture'));
  }
}

/**
 * Marks page `el` (`page`, as the view drew it) with `marks`, or takes its marks off with null: a
 * page that had marks is unmarked, and one that has marks now is marked; any other is untouched,
 * so a draw costs nothing on pages without a change.
 */
export function decorateLive(el: HTMLElement, page: Page, marks: PageMarks | null): void {
  unmark(el);
  if (marks) mark(el, page.number, marks);
}

/** The marks each view shows; a view with none recorded is waiting for its layout's marks. */
const shown = new WeakMap<ScriptView, PageMarks | null>();

/** Unmarks the pages that had marks and marks the pages that have them (`null`: none). */
export function markLive(view: ScriptView, marks: PageMarks | null): void {
  shown.set(view, marks);
  view.redecorate();
}

/** The marks the view's next draw puts on its pages, without marking the pages there now. */
export function liveForDraw(view: ScriptView, marks: PageMarks | null): void {
  shown.set(view, marks);
}

/**
 * The view's marks wait for a new layout's: pages drawn meanwhile keep what they have (a page kept
 * from the last draw holds the same lines, so its marks still fit), until `markLive`.
 */
export function holdLive(view: ScriptView): void {
  shown.delete(view);
}

/** The `decorate` hook for `view`'s pages. */
export function liveDecorate(view: () => ScriptView | undefined) {
  return (el: HTMLElement, page: Page): void => {
    const current = view();
    if (!current || !shown.has(current)) return;
    decorateLive(el, page, shown.get(current) ?? null);
  };
}
