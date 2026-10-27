// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import {
  type Anchors,
  createScrollSync,
  HOLD_MAX_MS,
  keepInView,
  LEAD_MS,
  offsetForTop,
  type SyncPane,
  topForOffset,
} from '../app/editor/scroll-sync';

// Scroll sync (decided 2026-10-27): the mapping between source offsets and a pane's pixels, and the
// controller that lets one pane lead at a time.

/** Anchors at these (offset, top) pairs. */
function anchors(pairs: Array<[number, number]>): Anchors & { reads: number } {
  const list = {
    reads: 0,
    length: pairs.length,
    from: (i: number) => (pairs[i] as [number, number])[0],
    top: (i: number) => {
      list.reads++;
      return (pairs[i] as [number, number])[1];
    },
  };
  return list;
}

describe('the mapping', () => {
  const list = anchors([
    [100, 50],
    [200, 150],
    [400, 250],
  ]);
  const end = { from: 500, top: 400 };

  test('puts an offset between the anchors around it, in proportion', () => {
    expect(topForOffset(list, 100, end)).toBe(50);
    expect(topForOffset(list, 150, end)).toBe(100);
    expect(topForOffset(list, 300, end)).toBe(200);
    // Before the first anchor, from the start; after the last, toward the end.
    expect(topForOffset(list, 50, end)).toBe(25);
    expect(topForOffset(list, 450, end)).toBe(325);
  });

  test('reads an offset back from a top, the same way', () => {
    expect(offsetForTop(list, 100, end)).toBe(150);
    expect(offsetForTop(list, 200, end)).toBe(300);
    expect(offsetForTop(list, 0, end)).toBe(0);
    expect(offsetForTop(list, 400, end)).toBe(500);
  });

  test('round-trips', () => {
    for (const offset of [0, 37, 100, 199, 333, 480]) {
      expect(offsetForTop(list, topForOffset(list, offset, end), end)).toBeCloseTo(offset, 6);
    }
  });

  test('measures only the anchors a search lands on', () => {
    const many = anchors(
      Array.from({ length: 10_000 }, (_, i) => [i * 10, i * 20] as [number, number]),
    );
    offsetForTop(many, 123_456, { from: 100_000, top: 200_000 });
    expect(many.reads).toBeLessThan(20);
  });

  test('keeps a line in view by moving as little as it takes', () => {
    // In view already: no change.
    expect(keepInView(1000, 1200, 600)).toBe(1000);
    // Below the view: just enough to show it, with a margin.
    expect(keepInView(1000, 1700, 600)).toBe(1140);
    // Above it.
    expect(keepInView(1000, 900, 600)).toBe(860);
  });
});

/** A pane that maps offset n to pixel n, and records what it is told. */
function fakePane() {
  const scroller = document.createElement('div');
  let top = 0;
  const calls: Array<{ offset: number; keep?: number }> = [];
  const pane: SyncPane & { calls: typeof calls; at(t: number): void; scroll(t: number): void } = {
    scroller,
    calls,
    offsetAtTop: () => top,
    scrollTo(offset, keep) {
      calls.push(keep === undefined ? { offset } : { offset, keep });
      top = offset;
      // A programmatic scroll fires a scroll event, as a browser's does.
      scroller.dispatchEvent(new Event('scroll'));
    },
    at(t) {
      top = t;
    },
    /** The writer scrolls it: an intent, then the scroll. */
    scroll(t) {
      scroller.dispatchEvent(new Event('wheel'));
      top = t;
      scroller.dispatchEvent(new Event('scroll'));
    },
  };
  return pane;
}

function harness(options: { enabled?: () => boolean } = {}) {
  let clock = 0;
  const frames: Array<() => void> = [];
  const sync = createScrollSync({
    enabled: options.enabled ?? (() => true),
    cursor: () => 42,
    now: () => clock,
    frame: (run) => frames.push(run),
  });
  return {
    sync,
    tick(ms = 16) {
      clock += ms;
      for (const run of frames.splice(0)) run();
    },
    /** Runs frames until none are left, as a page settles. */
    settle() {
      for (let i = 0; i < 50 && frames.length > 0; i++) this.tick();
      return frames.length;
    },
  };
}

describe('the controller', () => {
  test('the Source leads: the view follows once a frame, and its echo moves nothing back', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);

    source.scroller.dispatchEvent(new Event('wheel'));
    source.at(300);
    source.scroller.dispatchEvent(new Event('scroll'));
    source.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    // Read by the wheel: no cursor to keep in view.
    expect(view.calls).toEqual([{ offset: 300 }]);
    expect(h.settle()).toBe(0);
    // The view's own scroll event did not move the Source.
    expect(source.calls).toEqual([]);
  });

  test('the Source moved by typing keeps the cursor in view in the other pane', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    source.scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    source.at(120);
    source.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(view.calls).toEqual([{ offset: 120, keep: 42 }]);
  });

  test('a cursor out of the Source’s view is not kept in the other pane’s', () => {
    const h = harness();
    const source = { ...fakePane(), shows: () => false };
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    source.scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    source.at(900);
    source.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(view.calls).toEqual([{ offset: 900 }]);
  });

  test('the view leads only when the writer scrolls it, and the Source follows', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);

    // The app scrolls the view (following the cursor): the Source stays.
    view.at(500);
    view.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(source.calls).toEqual([]);

    // The writer does.
    view.scroll(700);
    h.tick();
    expect(source.calls).toEqual([{ offset: 700 }]);
    expect(h.settle()).toBe(0);
    // The Source's echo, inside the lead, moved nothing back.
    expect(view.calls).toEqual([]);
  });

  test('settles: a long exchange of scrolls ends with no frame pending and no ping-pong', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    for (let t = 0; t < 20; t++) {
      view.scroll(100 + t * 10);
      h.tick();
    }
    expect(h.settle()).toBe(0);
    expect(source.calls.length).toBe(20);
    expect(view.calls.length).toBe(0);
    // After the lead runs out, the Source scrolling leads again.
    h.tick(LEAD_MS + 1);
    source.scroller.dispatchEvent(new Event('wheel'));
    source.at(50);
    source.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(view.calls).toEqual([{ offset: 50 }]);
  });

  test('does nothing when the setting is off', () => {
    let on = false;
    const h = harness({ enabled: () => on });
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    source.scroll(300);
    h.tick();
    view.scroll(600);
    h.tick();
    expect(view.calls).toEqual([]);
    expect(source.calls).toEqual([]);
    expect(h.sync.placeView()).toBe(false);

    // Turned on, the view is put in step at once.
    on = true;
    source.at(250);
    h.sync.resync();
    expect(view.calls.at(-1)?.offset).toBe(250);
  });

  test('on a phone, the pane that opens is put where the other one was', () => {
    const h = harness();
    const source = fakePane();
    const detachSource = h.sync.attachSource(source);
    source.scroll(400);
    h.tick();
    detachSource();

    // The Script tab opens: it is drawn, and placed.
    const view = fakePane();
    const detachView = h.sync.attachView(view);
    expect(h.sync.placeView()).toBe(true);
    expect(view.calls).toEqual([{ offset: 400 }]);

    // The writer scrolls it, then goes back to the Source, which opens there.
    h.tick(LEAD_MS + 1);
    view.scroll(900);
    h.tick();
    detachView();
    const again = fakePane();
    h.sync.attachSource(again);
    h.settle();
    expect(again.calls).toEqual([{ offset: 900 }]);
  });

  test('a press on the view (its scroll bar) leads for as long as it is held', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    view.scroller.dispatchEvent(new Event('pointerdown'));
    // The writer pauses on the thumb for longer than a lead lasts, then drags.
    h.tick(LEAD_MS * 3);
    view.at(800);
    view.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(source.calls).toEqual([{ offset: 800 }]);
    // The Source's echo, long after the press began, still moves nothing back.
    h.tick(LEAD_MS * 3);
    source.at(805);
    source.scroller.dispatchEvent(new Event('scroll'));
    h.tick();
    expect(view.calls).toEqual([]);

    // Let go: the lead runs out as usual, and the Source leads again.
    window.dispatchEvent(new Event('pointerup'));
    h.tick(LEAD_MS + 1);
    source.scroll(300);
    h.tick();
    expect(view.calls).toEqual([{ offset: 300 }]);
  });

  test('a pointercancel lets go too', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    view.scroller.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointercancel'));
    h.tick(LEAD_MS + 1);
    source.scroll(300);
    h.tick();
    expect(view.calls).toEqual([{ offset: 300 }]);
  });

  describe('a press that is never let go (a native scroll-bar drag, a release outside the window)', () => {
    /** A press on the view whose pointerup never comes, and a view and Source attached. */
    function lost() {
      const h = harness();
      const source = fakePane();
      const view = fakePane();
      h.sync.attachSource(source);
      h.sync.attachView(view);
      view.scroller.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1 }));
      return { h, source, view };
    }
    /** The Source scrolled by the app (no wheel): it leads only if nothing holds the view. */
    function sourceScrollsQuietly(t: ReturnType<typeof lost>, to: number) {
      t.source.at(to);
      t.source.scroller.dispatchEvent(new Event('scroll'));
      t.h.tick();
    }

    test('the Source takes the lead back with its own wheel', () => {
      const t = lost();
      t.h.tick(LEAD_MS * 2);
      t.source.scroll(300);
      t.h.tick();
      expect(t.view.calls).toEqual([{ offset: 300 }]);
    });

    test('the Source takes it back with a key or a press', () => {
      for (const event of [
        new KeyboardEvent('keydown', { key: 'a' }),
        Object.assign(new Event('pointerdown'), { pointerId: 2 }),
      ]) {
        const t = lost();
        t.h.tick(LEAD_MS * 2);
        t.source.scroller.dispatchEvent(event);
        t.h.tick(LEAD_MS + 1);
        sourceScrollsQuietly(t, 400);
        expect(t.view.calls.map((c) => c.offset)).toEqual([400]);
      }
    });

    test('the hold runs out after a few seconds without the view scrolling', () => {
      const t = lost();
      t.h.tick(HOLD_MAX_MS - 100);
      // Still held: the Source's scroll is the echo.
      sourceScrollsQuietly(t, 100);
      expect(t.view.calls).toEqual([]);
      // The view scrolling renews it.
      t.view.at(50);
      t.view.scroller.dispatchEvent(new Event('scroll'));
      t.h.tick(HOLD_MAX_MS - 100);
      sourceScrollsQuietly(t, 120);
      expect(t.view.calls).toEqual([]);
      // Then it runs out.
      t.h.tick(200 + LEAD_MS);
      sourceScrollsQuietly(t, 200);
      expect(t.view.calls.map((c) => c.offset)).toEqual([200]);
    });

    test('the window losing focus, or the page being hidden, lets go', () => {
      for (const lose of [
        () => window.dispatchEvent(new Event('blur')),
        () => {
          Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
          });
        },
      ]) {
        const t = lost();
        lose();
        t.h.tick(LEAD_MS + 1);
        sourceScrollsQuietly(t, 250);
        expect(t.view.calls.map((c) => c.offset)).toEqual([250]);
      }
    });

    test('two presses: it is let go only when both are up', () => {
      const t = lost();
      t.view.scroller.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 2 }));
      window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
      t.h.tick(LEAD_MS + 1);
      sourceScrollsQuietly(t, 100);
      expect(t.view.calls).toEqual([]);
      window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 2 }));
      t.h.tick(LEAD_MS + 1);
      sourceScrollsQuietly(t, 200);
      expect(t.view.calls.map((c) => c.offset)).toEqual([200]);
    });
  });

  test('leaves a view the writer is scrolling where it is when it is drawn again', () => {
    const h = harness();
    const source = fakePane();
    const view = fakePane();
    h.sync.attachSource(source);
    h.sync.attachView(view);
    view.scroll(300);
    expect(h.sync.placeView()).toBe(false);
  });
});
