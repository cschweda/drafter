import type { Layout, Page } from '@drafter/layout';
import type { Template } from '@drafter/templates';
import { buildPage, type Shift, shiftOf, shiftPage } from './page';
import { speechRoles } from './roles';

/**
 * The event a click on a line of the script dispatches from the view's element:
 * a `CustomEvent<{ offset: number }>`, where `offset` is a source offset for
 * the editor to select. It bubbles.
 */
export const GOTO_EVENT = 'drafter:goto';

export interface ScriptViewOptions {
  /**
   * Resolves when Courier Prime is ready; the first render waits for it
   * (technical design §6.1). If it rejects, the pages are drawn anyway, in
   * whatever monospace font the browser has.
   */
  fontsReady?: Promise<unknown>;
  /** The clock for the manual-scroll guard, in milliseconds. Defaults to `performance.now()`. */
  now?: () => number;
  /**
   * Called for every page a draw leaves on the screen, built or kept, with the page it shows now,
   * once its offsets are final: the app's own marks go on here (the Script pane's Show changes).
   * Whatever it adds to a kept page stays there until it takes it away.
   */
  decorate?: (el: HTMLElement, page: Page) => void;
}

export interface ScriptView {
  /** `<section class="drafter-script" aria-label="Script">`, appended to the container. */
  readonly element: HTMLElement;
  /**
   * Draws `layout`. The first call waits for `fontsReady`; after that it draws before it returns.
   * Only the pages that changed are replaced, and pages that are gone are removed. When calls
   * overlap, the newest one is what ends up on the screen.
   */
  update(layout: Layout, template: Template): Promise<void>;
  /**
   * Scrolls the line where a block starts into view, as little as it takes. It does nothing for a
   * block the drawn layout doesn't have, or within two seconds of the reader scrolling the container.
   */
  reveal(blockIndex: number): void;
  /** Runs `decorate` again on every page on the screen, as when the marks change but not the pages. */
  redecorate(): void;
  /** Removes the region and every listener. */
  destroy(): void;
}

/** How long after the reader scrolls, in milliseconds, `reveal` leaves the view where they put it. */
const QUIET_MS = 2000;

/** The keys that scroll a scroller. */
const SCROLL_KEYS = new Set([
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
]);

/** A page on the screen, with what it was drawn from. */
interface Drawn {
  number: number;
  json: string;
  page: Page;
  el: HTMLElement;
}

const nothing = () => {};

/**
 * The Script pane's view: one labelled region in `container`, which holds the
 * pages (technical design §6.1).
 *
 * `update` redraws by page: a page whose JSON, and the template's, are what
 * they were last time keeps its element. A click on a line dispatches
 * `GOTO_EVENT`. `reveal` follows the editor's cursor, unless the reader has
 * scrolled the container by wheel, touch, or key in the last two seconds.
 */
export function createScriptView(
  container: HTMLElement,
  options: ScriptViewOptions = {},
): ScriptView {
  const { fontsReady, now = () => performance.now(), decorate } = options;
  const doc = container.ownerDocument;
  const element = doc.createElement('section');
  element.className = 'drafter-script';
  element.setAttribute('aria-label', 'Script');
  container.append(element);

  let drawn: Drawn[] = [];
  let drawnTemplate = '';
  // What `reveal` reads: the layout on the screen, and the template it was drawn with.
  let current: { layout: Layout; template: Template } | null = null;
  let pageByNumber = new Map<number, HTMLElement>();
  let destroyed = false;

  // A rejected load is no reason to leave the pane blank: its pages draw in the fallback font.
  // The handlers are attached now, so a load that fails before any update is not left unhandled.
  let ready = fontsReady === undefined;
  const waiting = Promise.resolve(fontsReady)
    .then(nothing, nothing)
    .then(() => {
      ready = true;
    });
  // The newest call to `update`: an older one that was waiting leaves the drawing to it.
  let newest = 0;

  // When the reader last scrolled the container. Its own scrolling can't be told from theirs by
  // the `scroll` event, which both cause, so the view listens for what a reader does to scroll.
  let lastScroll = Number.NEGATIVE_INFINITY;
  const listeners = new AbortController();
  const { signal } = listeners;
  const readerScrolled = () => {
    lastScroll = now();
  };
  container.addEventListener('wheel', readerScrolled, { passive: true, signal });
  container.addEventListener('touchstart', readerScrolled, { passive: true, signal });
  container.addEventListener('touchmove', readerScrolled, { passive: true, signal });
  container.addEventListener(
    'keydown',
    (event) => {
      if (SCROLL_KEYS.has(event.key)) readerScrolled();
    },
    { signal },
  );

  function draw(layout: Layout, template: Template) {
    const roles = speechRoles(template);
    // A page's DOM comes from the template as well as from the page: heading levels, margins,
    // scene-number columns, the header and footer rows, the page size, and which roles make a
    // speech. So a page counts as unchanged only if the template is unchanged too.
    const templateJson = JSON.stringify(template);
    const sameTemplate = templateJson === drawnTemplate;

    // Build the pages that changed first, detached from the document. If a build fails, the view
    // is as it was. And the new copy of a page, whose cue ids are the old copy's, is never in the
    // document beside it: the swap below takes the old one out as it puts the new one in.
    // A page that only moved in the source, as every page after an edit that changes the script's
    // length has, is not built again: it keeps its element, and its offsets are moved in place.
    const moves: Array<[HTMLElement, Shift]> = [];
    const next = layout.pages.map((page, i): Drawn => {
      const json = JSON.stringify(page);
      const old = drawn[i];
      if (old && sameTemplate) {
        if (old.json === json) return old;
        const shift = shiftOf(old.page, page);
        if (shift) {
          moves.push([old.el, shift]);
          return { number: page.number, json, page, el: old.el };
        }
      }
      return { number: page.number, json, page, el: buildPage(doc, page, template, roles) };
    });

    // Then swap them in, each in its page's place. The pages that didn't change are not touched,
    // so a reader's selection in one of them stays. All of this happens in one task.
    for (const [i, page] of next.entries()) {
      const old = drawn[i];
      if (page.el === old?.el) continue;
      if (old) old.el.replaceWith(page.el);
      else element.append(page.el);
    }
    for (const gone of drawn.slice(next.length)) gone.el.remove();
    for (const [el, shift] of moves) shiftPage(el, shift);

    drawn = next;
    drawnTemplate = templateJson;
    pageByNumber = new Map(next.map((page): [number, HTMLElement] => [page.number, page.el]));
    current = { layout, template };
    if (decorate) for (const page of next) decorate(page.el, page.page);
  }

  // A line is the thing to click: a click on the paper, or on the furniture, goes nowhere.
  element.addEventListener(
    'click',
    (event) => {
      const line = (event.target as Element | null)?.closest('.drafter-line[data-from]');
      if (!line) return;
      const detail = { offset: Number(line.getAttribute('data-from')) };
      element.dispatchEvent(new CustomEvent(GOTO_EVENT, { bubbles: true, detail }));
    },
    { signal },
  );

  return {
    element,

    async update(layout, template) {
      if (destroyed) return;
      const call = ++newest;
      if (!ready) {
        await waiting;
        if (destroyed || call !== newest) return;
      }
      draw(layout, template);
    },

    reveal(blockIndex) {
      if (!current || now() - lastScroll < QUIET_MS) return;
      const at: Layout['index'][number] | undefined = current.layout.index[blockIndex];
      const page = at && pageByNumber.get(at.page);
      if (!at || !page) return;

      // The first line at or after the block's row, by its row: where a line stands in the DOM
      // is the reading order, not the row order. Blank rows have no line, hence "at or after".
      // On a tie, the line that comes first is the left one. The furniture has no `data-from`.
      const row = current.template.page.margin.top + at.line;
      let target: HTMLElement | undefined;
      let targetRow = Number.POSITIVE_INFINITY;
      for (const line of page.querySelectorAll<HTMLElement>('.drafter-line[data-from]')) {
        const lineRow = Number(line.style.getPropertyValue('--row'));
        if (lineRow >= row && lineRow < targetRow) {
          target = line;
          targetRow = lineRow;
        }
      }
      target?.scrollIntoView({ block: 'nearest' });
    },

    redecorate() {
      if (!decorate || destroyed) return;
      for (const page of drawn) decorate(page.el, page.page);
    },

    destroy() {
      destroyed = true;
      listeners.abort();
      element.remove();
      drawn = [];
      current = null;
      pageByNumber = new Map();
    },
  };
}
