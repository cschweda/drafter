// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syncScrollFocus } from '../app/tour/scroll-focus';

/** A div whose sizes are as given (jsdom lays nothing out). */
function box(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  return el;
}

describe("the intro card's text", () => {
  it('gets a tab stop when it scrolls', () => {
    const el = box(600, 400);
    syncScrollFocus(el);
    expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('has none when it fits', () => {
    const el = box(300, 400);
    el.tabIndex = 0;
    syncScrollFocus(el);
    expect(el.hasAttribute('tabindex')).toBe(false);
  });
});
