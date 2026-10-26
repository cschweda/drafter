// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
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
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('leavesOnEscape', () => {
  test('leaves on a plain Escape in the editor', () => {
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content)).toBe(true);
  });

  test('ignores the Escape of an input method on Safari, which reports key code 229', () => {
    const content = document.body.appendChild(document.createElement('div'));
    expect(seen(content, { key: 'Escape', keyCode: 229 })).toBe(false);
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

  test('leaves alone an Escape while one of the page’s own dialogs (the palette) is up', () => {
    document.body.innerHTML = '<div role="dialog"></div><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(false);
    document.body.innerHTML = '<div role="alertdialog"></div><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(false);
    // A dialog that is not open does not count.
    document.body.innerHTML = '<dialog></dialog><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(true);
  });

  test('is blocked by a modal dialog, and not by a dialog that is open without being modal', () => {
    // jsdom has no `showModal()`, so what matches `:modal` is stood in for.
    const real = Element.prototype.matches;
    const modal = (el: Element) => el.id === 'asking';
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      sel: string,
    ) {
      return sel === ':modal' ? modal(this) : real.call(this, sel);
    });
    document.body.innerHTML = '<dialog open id="note"></dialog><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(true);
    document.body.innerHTML = '<dialog open id="asking"></dialog><div id="editor"></div>';
    expect(seen(document.getElementById('editor') as Element)).toBe(false);
  });
});
