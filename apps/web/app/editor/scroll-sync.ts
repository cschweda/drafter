import type { EditorView } from '@codemirror/view';

// Scroll sync (decided 2026-10-27): the Source pane and the Script pane (or a Markdown document's
// Preview) keep the same part of the script at their tops as either one scrolls. Both sides speak
// in source offsets: the Source through CodeMirror's line blocks, the other pane through the
// elements it draws with a `data-from` offset (the Script's lines, from the layout; the Preview's
// blocks, from the Markdown tree). An offset between two of them stands between them, in
// proportion, so "the same part" holds within a line or two.

/** A pane that scrolls in step: where its top is, as a source offset, and how to put an offset there. */
export interface SyncPane {
  /** The element that scrolls. */
  readonly scroller: HTMLElement;
  /** The source offset at the top of the pane, or null while it has nothing drawn to say. */
  offsetAtTop(): number | null;
  /**
   * Scrolls so `offset` is at the top. With `keep`, another offset (the cursor's) that must stay
   * in view: the pane goes no further from `offset` than it takes to show it.
   */
  scrollTo(offset: number, keep?: number): void;
  /** Whether `offset` is in view (the Source says, for the cursor; another pane needn't). */
  shows?(offset: number): boolean;
}

/**
 * A list of anchors in order: anchor `i` starts at source offset `from(i)` and stands at `top(i)`
 * pixels down the scroller's content. Both rise along the list (more or less: dual dialogue's
 * second column stands beside the first). They are read as asked, so a search reads a few.
 */
export interface Anchors {
  readonly length: number;
  from(i: number): number;
  top(i: number): number;
}

/** The last index whose `value` is at most `x`, or -1; `value` rises with the index. */
function lastAtMost(length: number, value: (i: number) => number, x: number): number {
  let lo = 0;
  let hi = length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (value(mid) <= x) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** `a` and `b` (offset, top), with the start of the text at the top and `end` after the last. */
function between(
  anchors: Anchors,
  i: number,
  end: { from: number; top: number },
): [{ from: number; top: number }, { from: number; top: number }] {
  const at = (k: number) =>
    k < 0
      ? { from: 0, top: 0 }
      : k >= anchors.length
        ? end
        : { from: anchors.from(k), top: anchors.top(k) };
  return [at(i), at(i + 1)];
}

/** Where `offset` stands, in pixels down the content: between the anchors around it, in proportion. */
export function topForOffset(
  anchors: Anchors,
  offset: number,
  end: { from: number; top: number },
): number {
  const i = lastAtMost(anchors.length, (k) => anchors.from(k), offset);
  const [a, b] = between(anchors, i, end);
  if (b.from <= a.from || b.top < a.top) return a.top;
  return a.top + ((offset - a.from) / (b.from - a.from)) * (b.top - a.top);
}

/** The source offset at `top` pixels down the content: between the anchors around it, in proportion. */
export function offsetForTop(
  anchors: Anchors,
  top: number,
  end: { from: number; top: number },
): number {
  const i = lastAtMost(anchors.length, (k) => anchors.top(k), top);
  const [a, b] = between(anchors, i, end);
  if (b.top <= a.top || b.from < a.from) return a.from;
  return a.from + ((top - a.top) / (b.top - a.top)) * (b.from - a.from);
}

/** Room left above and below the cursor's line when a pane is kept from hiding it. */
const KEEP_MARGIN = 40;

/** `target` moved as little as it takes for `keepTop` to be in a view `height` tall. */
export function keepInView(target: number, keepTop: number, height: number): number {
  const margin = Math.min(KEEP_MARGIN, height / 4);
  if (keepTop < target + margin) return keepTop - margin;
  if (keepTop > target + height - margin) return keepTop - height + margin;
  return target;
}

/**
 * A pane drawn as elements that carry their source offset in `data-from` (the Script's lines, the
 * Preview's blocks). The elements are found once per drawing (`invalidate` after each), and only
 * the few a search lands on are measured, so a long script costs a handful of reads a frame and
 * one write.
 */
export function domPane(
  scroller: HTMLElement,
  selector: string,
  textLength: () => number,
): SyncPane & { invalidate(): void } {
  let found: HTMLElement[] | null = null;
  const elements = () => {
    found ??= [...scroller.querySelectorAll<HTMLElement>(selector)];
    return found;
  };
  /** The anchors as they stand now: tops relative to the content, read when asked. */
  const measure = () => {
    const list = elements();
    const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const anchors: Anchors = {
      length: list.length,
      from: (i) => Number(list[i]?.dataset.from ?? 0),
      top: (i) => (list[i]?.getBoundingClientRect().top ?? origin) - origin,
    };
    const end = { from: textLength(), top: scroller.scrollHeight };
    return { anchors, end };
  };
  return {
    scroller,
    invalidate() {
      found = null;
    },
    offsetAtTop() {
      if (elements().length === 0) return null;
      const { anchors, end } = measure();
      return offsetForTop(anchors, scroller.scrollTop, end);
    },
    scrollTo(offset, keep) {
      if (elements().length === 0) return;
      const { anchors, end } = measure();
      let target = topForOffset(anchors, offset, end);
      if (keep !== undefined) {
        // The cursor past the last line (the empty line a script ends with) is at that line's
        // bottom, not at the bottom of the scroller's content, which is the last page's blank
        // lower half: keeping that in view left the writer's line above the pane in a short window.
        const last = elements().at(-1);
        const keepEnd = last
          ? {
              from: end.from,
              top:
                last.getBoundingClientRect().bottom -
                (scroller.getBoundingClientRect().top - scroller.scrollTop),
            }
          : end;
        target = keepInView(target, topForOffset(anchors, keep, keepEnd), scroller.clientHeight);
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      const top = Math.round(Math.max(0, Math.min(max, target)));
      if (Math.abs(scroller.scrollTop - top) >= 1) scroller.scrollTop = top;
    },
  };
}

/** The Source pane: offsets and heights from CodeMirror's line blocks. */
export function sourcePane(view: EditorView): SyncPane {
  const scroller = view.scrollDOM;
  /** How far the document starts below the top of the scroller's content (its padding). */
  const inset = () => view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return {
    scroller,
    offsetAtTop() {
      const height = scroller.scrollTop - inset();
      if (height <= 0) return 0;
      // The block around that height (CodeMirror counts a block's bottom edge as inside it), or the
      // last one, for a height past the end.
      const block = view.lineBlockAtHeight(height);
      const into = block.height > 0 ? (height - block.top) / block.height : 0;
      return block.from + Math.max(0, Math.min(1, into)) * block.length;
    },
    shows(offset) {
      const at = Math.max(0, Math.min(view.state.doc.length, offset));
      const top = view.lineBlockAt(at).top + inset();
      return top >= scroller.scrollTop && top < scroller.scrollTop + scroller.clientHeight;
    },
    scrollTo(offset) {
      const length = view.state.doc.length;
      const at = Math.max(0, Math.min(length, offset));
      const block = view.lineBlockAt(Math.floor(at));
      const into = block.length > 0 ? (at - block.from) / block.length : 0;
      const target = block.top + into * block.height + inset();
      const max = scroller.scrollHeight - scroller.clientHeight;
      const top = Math.round(Math.max(0, Math.min(max, target)));
      if (Math.abs(scroller.scrollTop - top) >= 1) scroller.scrollTop = top;
    },
  };
}

type Side = 'source' | 'view';

export interface ScrollSyncDeps {
  /** The setting. */
  enabled(): boolean;
  /** The cursor's offset in the source. */
  cursor(): number;
  now?: () => number;
  frame?: (run: () => void) => unknown;
}

/**
 * How long after the leading pane last scrolled (or the writer last touched it) the other pane's
 * scroll events are taken for the echo of its own sync and ignored.
 */
export const LEAD_MS = 300;

/**
 * The longest a press on the view holds the lead without the view scrolling. A press whose end
 * never reaches the page (a native scroll bar's drag, a release outside the window) must not stop
 * the Source from leading for good.
 */
export const HOLD_MAX_MS = 3000;

/** The keys that scroll a pane the writer is reading. */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

export interface ScrollSync {
  /** The Source pane is showing; returns the function that says it has gone. */
  attachSource(pane: SyncPane): () => void;
  /** The Script pane or the Preview is showing; returns the function that says it has gone. */
  attachView(pane: SyncPane): () => void;
  /**
   * The Script pane or the Preview was drawn, rescaled, or shown: it is put in step with the
   * Source (or, on a phone, where the Source last was). False, doing nothing, when sync is off,
   * the writer is scrolling it, or there is nothing to step with.
   */
  placeView(): boolean;
  /** Puts the view in step with the Source now (sync was just turned on). */
  resync(): void;
}

/**
 * The controller. One pane leads at a time, the one the writer scrolls; the other follows, a frame
 * later, and its own scroll events are ignored while the leader leads, so nothing loops.
 *
 * - The Source leads whenever it scrolls, whatever moved it: the wheel, the keys, typing (typewriter
 *   scrolling's centring included), a jump. When the keys or the app moved it, not the wheel or a
 *   finger, the cursor's line is kept in view in the other pane, so the Script pane's cursor-follow
 *   and the sync agree instead of taking turns.
 * - The Script pane or the Preview leads only when the writer scrolls it (the wheel, a finger, a
 *   scrolling key, a press on it or its scroll bar). Its other scrolling is the app's, such as the
 *   Script pane following the cursor, and doesn't move the Source.
 * - On a phone one pane shows at a time: the place is kept, and the pane that opens is put there.
 */
export function createScrollSync(deps: ScrollSyncDeps): ScrollSync {
  const now = deps.now ?? (() => performance.now());
  const frame = deps.frame ?? ((run: () => void) => requestAnimationFrame(run));
  const panes: Record<Side, SyncPane | null> = { source: null, view: null };
  let leader: Side | null = null;
  let leadUntil = Number.NEGATIVE_INFINITY;
  /** The Source was last moved by the wheel or a finger (reading), not the keys or the app. */
  let reading = false;
  let scheduled = false;
  /** Where the leading pane's top last was, for a pane that opens later (a phone's tabs). */
  let place: { offset: number; from: Side } | null = null;

  /**
   * The presses held on the view, by pointer id (its scroll bar's thumb, most often): the view
   * leads until the last one ends, however long the writer pauses mid-drag, then for `LEAD_MS` as
   * usual. A lost end is covered: the hold also ends when the window loses focus or the page is
   * hidden, when the writer turns to the Source (a press, the wheel, a key), and `HOLD_MAX_MS`
   * after the view last scrolled.
   */
  const presses = new Set<number>();
  let holdUntil = Number.NEGATIVE_INFINITY;
  let watching: AbortController | null = null;

  function held(): boolean {
    if (presses.size === 0) return false;
    if (now() < holdUntil) return true;
    // Run out: the view has been still for `HOLD_MAX_MS`, so no lead is left over either.
    letGo(true);
    return false;
  }

  /** Ends every press, and the view leads for `LEAD_MS` more (or not at all, `quietly`). */
  function letGo(quietly = false) {
    if (presses.size === 0) return;
    presses.clear();
    watching?.abort();
    watching = null;
    if (!quietly) lead('view');
  }

  const leading = (side: Side) =>
    (side === 'view' && held()) || (leader === side && now() < leadUntil);

  /**
   * The cursor, when the other pane must keep it in view: the keys or the app moved the Source (not
   * the wheel or a finger), and the cursor is in the Source's view, where the writer is working.
   */
  function kept(source: SyncPane | null): number | undefined {
    if (reading || !source) return undefined;
    const cursor = deps.cursor();
    return source.shows?.(cursor) === false ? undefined : cursor;
  }

  function lead(side: Side) {
    leader = side;
    leadUntil = now() + LEAD_MS;
  }

  function step() {
    scheduled = false;
    const side = leader;
    if (!side || !deps.enabled()) return;
    const from = panes[side];
    const to = panes[side === 'source' ? 'view' : 'source'];
    const offset = from?.offsetAtTop();
    if (offset === null || offset === undefined) return;
    place = { offset, from: side };
    if (!to) return;
    to.scrollTo(offset, side === 'source' ? kept(from) : undefined);
  }

  function onScroll(side: Side) {
    if (!deps.enabled()) return;
    const other: Side = side === 'source' ? 'view' : 'source';
    // The echo of the leader's sync.
    if (leading(other)) return;
    // The view moved by the app (following the cursor), not by the writer.
    if (side === 'view' && !leading('view')) return;
    // A held press that is still dragging keeps its hold.
    if (side === 'view' && presses.size > 0) holdUntil = now() + HOLD_MAX_MS;
    lead(side);
    if (!scheduled) {
      scheduled = true;
      frame(step);
    }
  }

  function listen(side: Side, pane: SyncPane): () => void {
    const controller = new AbortController();
    const { signal } = controller;
    const el = pane.scroller;
    const passive = { passive: true, signal };
    const touch = () => {
      if (!deps.enabled()) return;
      if (side === 'source') {
        reading = true;
        // The writer has turned to the Source: any press the view thought held is over.
        letGo(true);
      }
      lead(side);
    };
    el.addEventListener('scroll', () => onScroll(side), passive);
    el.addEventListener('wheel', touch, passive);
    el.addEventListener('touchstart', touch, passive);
    el.addEventListener('touchmove', touch, passive);
    el.addEventListener('pointerdown', side === 'view' ? hold : touch, passive);
    el.addEventListener(
      'keydown',
      (event) => {
        if (!deps.enabled()) return;
        if (side === 'source') {
          // Typing and the keys move the cursor, which the other pane keeps in view.
          reading = false;
          letGo(true);
          lead('source');
        } else if (SCROLL_KEYS.has(event.key)) lead('view');
      },
      { signal },
    );
    panes[side] = pane;
    return () => {
      controller.abort();
      if (panes[side] === pane) panes[side] = null;
      if (leader === side) leader = null;
      if (side === 'view') letGo(true);
    };
  }

  /** A press on the view: it leads until the press ends anywhere (the pointer can leave the pane mid-drag). */
  function hold(event: Event) {
    if (!deps.enabled()) return;
    lead('view');
    presses.add((event as PointerEvent).pointerId ?? 0);
    holdUntil = now() + HOLD_MAX_MS;
    if (watching) return;
    watching = new AbortController();
    const { signal } = watching;
    const end = (e: Event) => {
      presses.delete((e as PointerEvent).pointerId ?? 0);
      if (presses.size === 0) letGo();
    };
    window.addEventListener('pointerup', end, { signal });
    window.addEventListener('pointercancel', end, { signal });
    window.addEventListener('blur', () => letGo(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') letGo();
      },
      { signal },
    );
  }

  function placeView(): boolean {
    const view = panes.view;
    if (!view || !deps.enabled() || leading('view')) return false;
    const source = panes.source;
    const offset = source ? source.offsetAtTop() : place?.offset;
    if (offset === null || offset === undefined) return false;
    view.scrollTo(offset, kept(source));
    return true;
  }

  return {
    attachSource(pane) {
      const stop = listen('source', pane);
      const detach = () => {
        // Where the Source was, for the pane that opens next on a phone, unless that pane led last.
        if (deps.enabled() && place?.from !== 'view') {
          const offset = pane.offsetAtTop();
          if (offset !== null) place = { offset, from: 'source' };
        }
        stop();
      };
      // A phone that shows the Source again after the writer scrolled the other pane: the Source
      // opens where that pane was, once CodeMirror has measured it in its new place.
      const back = place;
      if (deps.enabled() && !panes.view && back?.from === 'view') {
        frame(() =>
          frame(() => {
            if (panes.source === pane && !panes.view && place === back) pane.scrollTo(back.offset);
          }),
        );
      }
      return detach;
    },
    attachView(pane) {
      return listen('view', pane);
    },
    placeView,
    resync() {
      if (panes.source) placeView();
    },
  };
}
