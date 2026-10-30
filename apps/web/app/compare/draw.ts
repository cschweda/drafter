import type { PageMarks } from '@drafter/compare';
import { gapName } from './labels';

// Compare's marks on a page drawn by `@drafter/render-html`'s `buildPage` (Phase 2 design §11.2,
// Call 17). A printed line is matched to its marks by its span, which the page keeps on each line as
// `data-from` and `data-to`. A changed or added line gets an asterisk in the right margin (hidden
// from a screen reader) and a hidden "changed, " or "added, " at its start; lines with nothing
// printed to mark (removed, or new lines that don't print) are a thin rule with a button named for
// what it holds, which shows those lines (`<del>` when removed). Text reaches the page only through
// `textContent`. Every mark carries `data-change`, its change's index, which is where Next change
// and the Changes list put focus.

/** How far in from the page's right edge the asterisk stands, in columns. */
const STAR_COLUMN_FROM_RIGHT = 5;

/** A printed line's key by its span, as `data-from` and `data-to` hold it. */
export const spanKey = (from: number | string, to: number | string) => `${from}:${to}`;

/** The row a line of the page stands on (its `--row`, margin included). */
export const rowOf = (el: HTMLElement) => Number(el.style.getPropertyValue('--row')) || 0;

/** The first child of `parent` that is the page's own, not a gap put in before it. */
function firstOwnChild(parent: Element): Element | null {
  for (const child of parent.children)
    if (!child.classList.contains('compare-gap') && !child.classList.contains('live-gap'))
      return child;
  return null;
}

/**
 * Where a gap before `line` goes in the page's reading order: before the outermost group or block
 * that `line` begins, so it isn't read as part of a speech's or a heading's first line; and never
 * inside a heading.
 */
export function placeBefore(page: HTMLElement, line: HTMLElement): Element {
  let node: Element = line;
  while (
    node.parentElement &&
    node.parentElement !== page &&
    firstOwnChild(node.parentElement) === node
  ) {
    node = node.parentElement;
  }
  const heading = node.parentElement?.closest('[role="heading"]');
  return heading && page.contains(heading) ? heading : node;
}

function star(page: HTMLElement, row: number, cols: number): void {
  const el = page.ownerDocument.createElement('div');
  el.className = 'drafter-line compare-star';
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--row', String(row));
  el.style.setProperty('--col', String(Math.max(cols - STAR_COLUMN_FROM_RIGHT, 0)));
  el.textContent = '*';
  page.append(el);
}

/** Marks page `page` (its number), drawn as `el` by `buildPage`, with `marks`. */
export function markPage(el: HTMLElement, page: number, marks: PageMarks): void {
  const doc = el.ownerDocument;
  const cols = Number(el.style.getPropertyValue('--cols')) || 85;
  const bySpan = new Map<string, HTMLElement[]>();
  let lastRow = 0;
  for (const line of el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')) {
    const key = spanKey(line.dataset.from ?? '', line.dataset.to ?? '');
    bySpan.set(key, [...(bySpan.get(key) ?? []), line]);
    lastRow = Math.max(lastRow, rowOf(line));
  }

  for (const mark of marks.lines) {
    if (mark.page !== page) continue;
    for (const line of bySpan.get(spanKey(mark.span.from, mark.span.to)) ?? []) {
      if (line.dataset.change !== undefined) continue;
      line.dataset.change = String(mark.change);
      line.classList.add('compare-mark');
      line.tabIndex = -1;
      const said = doc.createElement('span');
      said.className = 'drafter-sr-only';
      said.textContent = `${mark.kind}, `;
      line.prepend(said);
      star(el, rowOf(line), cols);
    }
  }

  marks.gaps.forEach((gap, index) => {
    if (gap.page !== page) return;
    const before = gap.before
      ? bySpan.get(spanKey(gap.before.from, gap.before.to))?.[0]
      : undefined;
    const row = before ? rowOf(before) : lastRow + 1;

    const wrap = doc.createElement('div');
    wrap.className = `compare-gap compare-gap-${gap.kind}`;
    wrap.style.setProperty('--row', String(row));

    const held = doc.createElement('div');
    held.id = `compare-gap-${page}-${index}`;
    held.className = 'compare-gap-lines';
    held.hidden = true;
    for (const text of gap.lines) {
      const line = doc.createElement(gap.kind === 'removed' ? 'del' : 'ins');
      // An empty line still takes its row.
      line.textContent = text === '' ? ' ' : text;
      held.append(line);
    }

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'compare-gap-button';
    button.dataset.change = String(gap.change);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', held.id);
    button.textContent = gapName(gap);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      held.hidden = !open;
    });

    wrap.append(button, held);
    if (before) {
      const at = placeBefore(el, before);
      at.parentElement?.insertBefore(wrap, at);
    } else {
      // At the end of the page's text, before the furniture (which is hidden from a screen reader).
      const furniture = el.querySelector('.drafter-furniture');
      el.insertBefore(wrap, furniture);
    }
    if (gap.kind === 'unprinted') star(el, row, cols);
  });
}
