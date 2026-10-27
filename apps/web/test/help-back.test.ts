// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backToEditor } from '../app/commands/help-back';
import type { DesktopBridge } from '../app/desktop';

// The help pages' "Back to Drafter" link. In a browser it is a plain link (or closes its tab: the
// layout's own handler). In the desktop app a help page is a window of its own: Back brings the
// editor's window forward and closes this one, not a second editor in it.

function click(init: MouseEventInit = {}) {
  const event = new MouseEvent('click', { button: 0, cancelable: true, ...init });
  return event;
}

let calls: string[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('__DRAFTER_DESKTOP__', true);
  window.drafterDesktop = {
    backToEditor: () => {
      calls.push('back');
    },
  } as unknown as DesktopBridge;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.drafterDesktop;
});

describe('backToEditor', () => {
  test('on the desktop, asks the app to focus the editor and close this window, and stops the link', () => {
    const event = click();
    expect(backToEditor(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual(['back']);
  });

  test('leaves a modified or middle click to the app’s own rules', () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const event = click(init);
      expect(backToEditor(event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  test('in a browser does nothing, so the link and the layout’s own handler stand', () => {
    delete window.drafterDesktop;
    const event = click();
    expect(backToEditor(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});
