// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import type { DesktopBridge, DesktopCloseHandlers } from '../app/desktop';

// The session and Save, as far as closing reads them.
const wouldLose = ref(false);
const title = ref('The Call');
const flush = vi.fn(async () => {});
vi.mock('../app/storage/script', () => ({
  useScript: () => ({
    wouldLose,
    flush,
    project: {
      get value() {
        return { title: title.value };
      },
    },
  }),
}));
const save = vi.fn(async (): Promise<'saved' | 'cancelled'> => 'saved');
vi.mock('../app/storage/save', () => ({ save: () => save() }));

import { closeState, installDesktopClose } from '../app/commands/desktop-close';

/** A bridge that keeps the handlers the page registered. */
function bridge() {
  let handlers: DesktopCloseHandlers | undefined;
  let stops = 0;
  window.drafterDesktop = {
    version: '0',
    platform: 'linux',
    files: {} as never,
    menu: { setCommands: () => {}, onCommand: () => () => {} },
    onOpenFile: () => () => {},
    onCloseRequest(given) {
      handlers = given;
      return () => {
        stops += 1;
        handlers = undefined;
      };
    },
  } satisfies DesktopBridge;
  return { handlers: () => handlers, stops: () => stops };
}

beforeEach(() => {
  vi.stubGlobal('__DRAFTER_DESKTOP__', true);
  wouldLose.value = false;
  title.value = 'The Call';
  flush.mockClear();
  save.mockClear();
  save.mockResolvedValue('saved');
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.drafterDesktop;
});

describe('closeState', () => {
  test('is unsaved when the session says closing would lose text, with the title', () => {
    wouldLose.value = true;
    expect(closeState()).toEqual({ unsaved: true, title: 'The Call' });
    wouldLose.value = false;
    expect(closeState()).toEqual({ unsaved: false, title: 'The Call' });
  });
});

describe('installDesktopClose', () => {
  test('does nothing in a browser', () => {
    delete window.drafterDesktop;
    expect(installDesktopClose()()).toBeUndefined();
  });

  test('answers the state, and flushes the recovery copy on request', async () => {
    const b = bridge();
    installDesktopClose();
    wouldLose.value = true;
    expect(await b.handlers()?.state()).toEqual({ unsaved: true, title: 'The Call' });
    await b.handlers()?.flush();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  test('saves with the Save command, and says whether it saved', async () => {
    const b = bridge();
    installDesktopClose();
    expect(await b.handlers()?.save()).toBe(true);
    save.mockResolvedValueOnce('cancelled');
    expect(await b.handlers()?.save()).toBe(false);
    save.mockRejectedValueOnce(new Error('failed: EIO'));
    expect(await b.handlers()?.save()).toBe(false);
  });

  test('stops listening when removed', () => {
    const b = bridge();
    installDesktopClose()();
    expect(b.stops()).toBe(1);
  });
});
