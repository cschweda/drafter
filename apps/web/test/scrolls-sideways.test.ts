// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { watchSideways } from '../app/composables/useScrollsSideways';

// A region that scrolls sideways is a Tab stop, so the keyboard can scroll it; one that fits isn't,
// since a stop that does nothing is only in the way. jsdom lays nothing out, so the widths are set
// by hand and the ResizeObserver is a stand-in the test calls.
class FakeObserver {
  static made: FakeObserver[] = [];
  watched: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeObserver.made.push(this);
  }
  observe(el: Element) {
    this.watched.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback();
  }
}

function sized(scroll: number, client: number) {
  const el = document.createElement('div');
  el.append(document.createElement('table'));
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scroll });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => client });
  return el;
}
const resize = (el: HTMLElement, scroll: number, client: number) => {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scroll });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => client });
};

beforeEach(() => {
  FakeObserver.made = [];
  vi.stubGlobal('ResizeObserver', FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe('whether a region scrolls sideways', () => {
  test('says so at once, and again when the region or what it holds changes size', () => {
    const el = sized(600, 320);
    const seen: boolean[] = [];
    const stop = watchSideways(el, (scrolls) => seen.push(scrolls));
    expect(seen).toEqual([true]);
    const observer = FakeObserver.made[0] as FakeObserver;
    // The region and its table: either one growing or shrinking can change the answer.
    expect(observer.watched).toEqual([el, el.firstElementChild]);
    resize(el, 900, 900);
    observer.fire();
    expect(seen).toEqual([true, false]);
    // No change, no call.
    observer.fire();
    expect(seen).toEqual([true, false]);
    resize(el, 901, 900);
    observer.fire();
    expect(seen).toEqual([true, false, true]);
    stop();
    expect(observer.disconnected).toBe(true);
  });

  test('a region that fits does not scroll', () => {
    const seen: boolean[] = [];
    watchSideways(sized(320, 320), (scrolls) => seen.push(scrolls));
    expect(seen).toEqual([false]);
  });
});
