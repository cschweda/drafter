// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { leavesOnEscape } from '../app/utils/focus';

/** Dispatches a keydown on `target` and returns what a window listener saw of it. */
function seen(target: Element, init: KeyboardEventInit = { key: 'Escape' }, prevent = false) {
  let result: boolean | undefined;
  const listener = (event: KeyboardEvent) => {
    result = leavesOnEscape(event);
  };
  window.addEventListener('keydown', listener);
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (prevent) target.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
  target.dispatchEvent(event);
  window.removeEventListener('keydown', listener);
  return result;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('leavesOnEscape', () => {
  test('leaves on a plain Escape in the editor', () => {
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content)).toBe(true);
  });

  test('ignores other keys, and Escape with a modifier', () => {
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content, { key: 'Enter' })).toBe(false);
    expect(seen(content, { key: 'Escape', shiftKey: true })).toBe(false);
    expect(seen(content, { key: 'Escape', ctrlKey: true })).toBe(false);
  });

  test('leaves alone an Escape something else already used', () => {
    // CodeMirror closing its completion list or search panel prevents the event's default.
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content, { key: 'Escape' }, true)).toBe(false);
  });

  test('leaves alone an Escape typed into a composition', () => {
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content, { key: 'Escape', isComposing: true })).toBe(false);
  });

  test('leaves alone an Escape from inside a dialog, a menu, or a palette', () => {
    for (const html of [
      '<dialog open><input></dialog>',
      '<div role="dialog"><input></div>',
      '<div role="menu"><button></button></div>',
    ]) {
      document.body.innerHTML = html;
      const inner = document.body.querySelector('input, button') as Element;
      expect(seen(inner)).toBe(false);
    }
  });

  test('leaves alone an Escape while a dialog is open anywhere', () => {
    document.body.innerHTML = '<dialog open></dialog><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(false);
    // A dialog that is not open does not count.
    document.body.innerHTML = '<dialog></dialog><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(true);
  });
});
