// close-flow.ts is pure (no Electron), so the closing rules are tested here with a page that is
// whatever each test needs: quiet, unsaved, hung, slow to save.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  CLOSE_DIALOG,
  type CloseChoice,
  CloseFlow,
  type ClosePage,
  closeDialogText,
  nextCloseAnswer,
  parseCloseState,
  unresponsiveDialogText,
} from '../src/close-flow';

/** A promise a test settles itself. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Rig {
  flow: CloseFlow;
  page: ClosePage;
  calls: string[];
  dialog: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

/** A flow over a page that answers as `page` says; the dialog answers `choice`. */
function rig(
  page: Partial<ClosePage> = {},
  choice: CloseChoice | Promise<CloseChoice> = 'cancel',
  present = true,
): Rig {
  const calls: string[] = [];
  const full: ClosePage = {
    state: async () => {
      calls.push('state');
      return { unsaved: false, title: 'The Call', recoverable: true };
    },
    save: async () => {
      calls.push('save');
      return true;
    },
    flush: async () => {
      calls.push('flush');
    },
    ...page,
  };
  const dialog = vi.fn(async (_about: unknown) => {
    calls.push('dialog');
    return choice;
  });
  const quit = vi.fn();
  const flow = new CloseFlow({
    page: () => (present ? full : null),
    dialog,
    quit,
    askMs: 40,
    flushMs: 40,
  });
  return { flow, page: full, calls, dialog, quit };
}

const unsaved =
  (title = 'The Call', recoverable = true) =>
  async () => ({ unsaved: true, title, recoverable });

describe('closing with nothing to lose', () => {
  test('closes at once when there is no editor page to ask', async () => {
    const { flow, dialog } = rig({}, 'cancel', false);
    expect(await flow.decide('close')).toBe('close');
    expect(dialog).not.toHaveBeenCalled();
  });

  test('closes without a dialog when nothing is unsaved, after flushing the recovery copy', async () => {
    const { flow, dialog, calls } = rig();
    expect(await flow.decide('close')).toBe('close');
    expect(dialog).not.toHaveBeenCalled();
    expect(calls).toEqual(['state', 'flush']);
  });

  test('still closes when the flush fails or never answers', async () => {
    const failing = rig({ flush: () => Promise.reject(new Error('no disk')) });
    expect(await failing.flow.decide('close')).toBe('close');
    const silent = rig({ flush: () => new Promise<void>(() => {}) });
    const started = Date.now();
    expect(await silent.flow.decide('close')).toBe('close');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('closing with unsaved changes', () => {
  test('asks about the script by its title', async () => {
    const { flow, dialog } = rig({ state: unsaved('Night Shift') }, 'cancel');
    await flow.decide('close');
    expect(dialog).toHaveBeenCalledWith({ title: 'Night Shift', recoverable: true });
  });

  test('Cancel stays and saves nothing', async () => {
    const { flow, calls } = rig({ state: unsaved() }, 'cancel');
    expect(await flow.decide('close')).toBe('stay');
    expect(calls).not.toContain('save');
  });

  test("Don't Save closes, after the recovery copy is flushed", async () => {
    const { flow, calls } = rig({ state: unsaved() }, 'discard');
    expect(await flow.decide('close')).toBe('close');
    expect(calls).toEqual(['dialog', 'flush']);
    expect(calls).not.toContain('save');
  });

  test('Save closes only once it has saved, then flushes', async () => {
    const { flow, calls } = rig({ state: unsaved() }, 'save');
    expect(await flow.decide('close')).toBe('close');
    expect(calls).toEqual(['dialog', 'save', 'flush']);
  });

  test.each([
    ['a Save As that was cancelled', async () => false],
    ['a write that failed', () => Promise.reject(new Error('failed: EIO'))],
  ])('Save stays open after %s', async (_name, save) => {
    const { flow, calls } = rig({ state: unsaved(), save }, 'save');
    expect(await flow.decide('close')).toBe('stay');
    expect(calls).not.toContain('flush');
  });

  test('a dialog that fails is a Cancel', async () => {
    const { flow, dialog } = rig({ state: unsaved() });
    dialog.mockRejectedValueOnce(new Error('no display'));
    expect(await flow.decide('close')).toBe('stay');
  });
});

describe('a page that does not answer', () => {
  test("says so and offers only Don't Save and Cancel", async () => {
    const { flow, dialog } = rig({ state: () => new Promise(() => {}) }, 'cancel');
    expect(await flow.decide('close')).toBe('stay');
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true, recoverable: false });
  });

  test("Don't Save closes anyway", async () => {
    const { flow } = rig({ state: () => new Promise(() => {}) }, 'discard');
    expect(await flow.decide('close')).toBe('close');
  });

  test('never saves through a page that is not answering', async () => {
    const { flow, calls } = rig({ state: () => new Promise(() => {}) }, 'save');
    expect(await flow.decide('close')).toBe('stay');
    expect(calls).not.toContain('save');
  });

  test('a late answer changes nothing', async () => {
    const slow = later<{ unsaved: boolean; title: string; recoverable: boolean }>();
    const { flow, dialog } = rig({ state: () => slow.promise }, 'discard');
    const result = flow.decide('close');
    await new Promise((r) => setTimeout(r, 80));
    slow.resolve({ unsaved: true, title: 'x', recoverable: true });
    expect(await result).toBe('close');
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true, recoverable: false });
  });

  test('carries what the page last said about its recovery copy', async () => {
    let answers = 0;
    const page: Partial<ClosePage> = {
      state: () => {
        answers++;
        return answers === 1
          ? Promise.resolve({ unsaved: false, title: 'x', recoverable: true })
          : new Promise(() => {});
      },
    };
    const { flow, dialog } = rig(page, 'cancel');
    // A first close the page answers (nothing unsaved, so it closes), then one it doesn't.
    expect(await flow.decide('close')).toBe('close');
    expect(await flow.decide('close')).toBe('stay');
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true, recoverable: true });
  });

  test('a page whose state call fails is treated the same', async () => {
    const { flow, dialog } = rig({ state: () => Promise.reject(new Error('boom')) }, 'cancel');
    expect(await flow.decide('close')).toBe('stay');
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true, recoverable: false });
  });
});

describe('a page that hangs while saving', () => {
  /** A rig whose page never finishes Save; `trouble` plays the window's own events. */
  function hung(choice: CloseChoice, recoverable = true) {
    const calls: string[] = [];
    let trouble: (kind: 'unresponsive' | 'gone') => void = () => {};
    let watching = 0;
    let unwatched = 0;
    const dialog = vi.fn(async (_about: unknown) => {
      calls.push('dialog');
      // The first box is the Save question; the next, if any, is "isn't responding".
      return dialog.mock.calls.length === 1 ? ('save' as CloseChoice) : choice;
    });
    const page: ClosePage = {
      state: async () => ({ unsaved: true, title: 'The Call', recoverable }),
      save: () => new Promise<boolean>(() => {}),
      flush: async () => {
        calls.push('flush');
      },
    };
    const flow = new CloseFlow({
      page: () => page,
      dialog,
      quit: vi.fn(),
      askMs: 40,
      flushMs: 40,
      watchPage(onTrouble) {
        watching++;
        trouble = onTrouble;
        return () => {
          unwatched++;
        };
      },
    });
    return {
      flow,
      dialog,
      calls,
      trouble: (k: 'unresponsive' | 'gone') => trouble(k),
      counts: () => ({ watching, unwatched }),
    };
  }

  test('is not given a time limit: a Save that is merely slow keeps waiting', async () => {
    const r = hung('cancel');
    let done = false;
    void r.flow.decide('close').then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(done).toBe(false);
    expect(r.flow.phase).toBe('saving');
  });

  test('offers the "isn’t responding" box when the window goes unresponsive, and Don’t Save closes', async () => {
    const r = hung('discard');
    const result = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.trouble('unresponsive');
    expect(await result).toBe('close');
    expect(r.dialog).toHaveBeenLastCalledWith({ unresponsive: true, recoverable: true });
    expect(r.calls).toEqual(['dialog', 'dialog', 'flush']);
    expect(r.counts()).toEqual({ watching: 1, unwatched: 1 });
  });

  test('with no recovery copy, that box doesn’t promise one (the last answer is carried)', async () => {
    const r = hung('cancel', false);
    const result = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.trouble('unresponsive');
    expect(await result).toBe('stay');
    expect(r.dialog).toHaveBeenLastCalledWith({ unresponsive: true, recoverable: false });
  });

  test('Cancel in that box stays, and the flow can run again', async () => {
    const r = hung('cancel');
    const result = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.trouble('unresponsive');
    expect(await result).toBe('stay');
    expect(r.flow.phase).toBe('idle');
  });

  test('a page that is gone (crashed, or navigated away) ends the wait and stays', async () => {
    const r = hung('discard');
    const result = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.trouble('gone');
    expect(await result).toBe('stay');
    expect(r.dialog).toHaveBeenCalledTimes(1);
    expect(r.flow.phase).toBe('idle');
  });
});

describe('a second close while a Save hangs', () => {
  /** A page that answers `state` once, then never; its Save never finishes. */
  function stuck(choice: CloseChoice) {
    let asked = 0;
    const dialog = vi.fn(async (_about: unknown) =>
      dialog.mock.calls.length === 1 ? ('save' as CloseChoice) : choice,
    );
    const page: ClosePage = {
      state: () => {
        asked++;
        return asked === 1
          ? Promise.resolve({ unsaved: true, title: 'The Call', recoverable: true })
          : new Promise(() => {});
      },
      save: () => new Promise<boolean>(() => {}),
      flush: async () => {},
    };
    const quit = vi.fn();
    const flow = new CloseFlow({ page: () => page, dialog, quit, askMs: 40, flushMs: 40 });
    return { flow, dialog, quit, asked: () => asked };
  }

  test('asks the page, and when it does not answer offers the "isn’t responding" box', async () => {
    const r = stuck('discard');
    const first = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(r.flow.phase).toBe('saving');
    // The title bar's close button again: the page is probed.
    expect(await r.flow.decide('close')).toBe('stay');
    expect(r.asked()).toBe(2);
    expect(r.dialog).toHaveBeenLastCalledWith({ unresponsive: true, recoverable: true });
    // Don't Save in that box ends the first request, which closes.
    expect(await first).toBe('close');
  });

  test('a quit does the same', async () => {
    const r = stuck('cancel');
    const first = r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await r.flow.decide('quit')).toBe('stay');
    expect(r.dialog).toHaveBeenLastCalledWith({ unresponsive: true, recoverable: true });
    expect(await first).toBe('stay');
  });

  test('a page that answers (a Save As dialog is open) is left alone', async () => {
    let asked = 0;
    const dialog = vi.fn(async (_about: unknown) => 'save' as CloseChoice);
    const page: ClosePage = {
      state: async () => {
        asked++;
        return { unsaved: true, title: 'The Call', recoverable: true };
      },
      save: () => new Promise<boolean>(() => {}),
      flush: async () => {},
    };
    const flow = new CloseFlow({ page: () => page, dialog, quit: vi.fn(), askMs: 40, flushMs: 40 });
    void flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await flow.decide('close')).toBe('stay');
    expect(asked).toBe(2);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(flow.phase).toBe('saving');
  });

  test('probes once at a time', async () => {
    const r = stuck('cancel');
    void r.flow.decide('close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await Promise.all([r.flow.decide('close'), r.flow.decide('close'), r.flow.decide('quit')]);
    expect(r.asked()).toBe(2);
    expect(r.dialog).toHaveBeenCalledTimes(2);
  });
});

describe('overlapping requests', () => {
  test('a second close while the dialog is up does nothing', async () => {
    const choice = later<CloseChoice>();
    const { flow, dialog } = rig({ state: unsaved() }, choice.promise);
    const first = flow.decide('close');
    await new Promise((r) => setTimeout(r, 5));
    expect(await flow.decide('close')).toBe('stay');
    expect(await flow.decide('quit')).toBe('stay');
    expect(dialog).toHaveBeenCalledTimes(1);
    choice.resolve('cancel');
    expect(await first).toBe('stay');
  });

  test('a quit while the dialog is up is not remembered either', async () => {
    const choice = later<CloseChoice>();
    const { flow, quit } = rig({ state: unsaved() }, choice.promise);
    const first = flow.decide('close');
    await new Promise((r) => setTimeout(r, 5));
    await flow.decide('quit');
    choice.resolve('cancel');
    await first;
    await new Promise((r) => setTimeout(r, 10));
    expect(quit).not.toHaveBeenCalled();
  });

  test('a quit during a Save waits for it, then quits again', async () => {
    const saving = later<boolean>();
    const { flow, quit } = rig({ state: unsaved(), save: () => saving.promise }, 'save');
    const first = flow.decide('close');
    await new Promise((r) => setTimeout(r, 5));
    expect(flow.phase).toBe('saving');
    expect(await flow.decide('quit')).toBe('stay');
    expect(quit).not.toHaveBeenCalled();
    saving.resolve(true);
    expect(await first).toBe('close');
    await new Promise((r) => setTimeout(r, 10));
    expect(quit).toHaveBeenCalledTimes(1);
    expect(flow.busy).toBe(false);
  });

  test('a flow that finished can run again', async () => {
    const { flow, dialog } = rig({ state: unsaved() }, 'cancel');
    await flow.decide('close');
    await flow.decide('close');
    expect(dialog).toHaveBeenCalledTimes(2);
  });
});

describe('the end of a session', () => {
  test('flushes the recovery copy without asking', async () => {
    const { flow, dialog, calls } = rig({ state: unsaved() });
    await flow.flushForExit();
    expect(calls).toEqual(['flush']);
    expect(dialog).not.toHaveBeenCalled();
  });

  test('is bounded when the page does not answer', async () => {
    const { flow } = rig({ flush: () => new Promise<void>(() => {}) });
    const started = Date.now();
    await flow.flushForExit();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('does nothing with no page', async () => {
    const { flow } = rig({}, 'cancel', false);
    await expect(flow.flushForExit()).resolves.toBeUndefined();
  });
});

describe('what the dialogs say', () => {
  test('asks to save the changes to the script, with three buttons', () => {
    const text = closeDialogText('The Call');
    expect(text.message).toBe('Save the changes to “The Call” before closing?');
    expect(text.detail).toBe("Your unsaved changes stay in Drafter's recovery copy either way.");
    expect(text.buttons).toEqual(['Save', "Don't Save", 'Cancel']);
    // Cancel is the default, and what Escape does.
    expect(text.buttons[text.defaultId]).toBe('Cancel');
    expect(text.buttons[text.cancelId]).toBe('Cancel');
    expect(CLOSE_DIALOG.choices).toEqual(['save', 'discard', 'cancel']);
  });

  test('promises no recovery copy when there is none', () => {
    const text = closeDialogText('The Call', false);
    expect(text.detail).toBe(
      "These changes are in no file and no recovery copy, so Don't Save loses them.",
    );
    expect(text.detail).not.toMatch(/stay/);
    expect(text.buttons).toEqual(['Save', "Don't Save", 'Cancel']);
    expect(text.buttons[text.defaultId]).toBe('Cancel');
    expect(closeDialogText('The Call', true).detail).toMatch(/recovery copy either way/);
  });

  test('keeps a long or odd title to one line', () => {
    const long = closeDialogText(`${'x'.repeat(200)}\nsecond line`).message;
    expect(long).not.toContain('\n');
    expect(long.length).toBeLessThan(140);
    expect(closeDialogText('   ', false).message).toBe(
      'Save the changes to “Untitled” before closing?',
    );
  });

  test('says when the page is not responding, and offers no Save', () => {
    const text = unresponsiveDialogText(true);
    expect(text.message).toMatch(/isn.t responding/i);
    expect(text.buttons).toEqual(["Don't Save", 'Cancel']);
    expect(text.buttons[text.defaultId]).toBe('Cancel');
    expect(text.buttons[text.cancelId]).toBe('Cancel');
    expect(text.detail).toMatch(/recovery copy/);
  });

  test('without a recovery copy (or no word of one) promises none', () => {
    const text = unresponsiveDialogText(false);
    expect(text.buttons).toEqual(["Don't Save", 'Cancel']);
    expect(text.detail).not.toMatch(/stays in Drafter's recovery copy/);
    expect(text.detail).toMatch(/may lose/);
    expect(unresponsiveDialogText(true).detail).toMatch(/stays in Drafter's recovery copy/);
  });
});

describe('the renderer is not trusted', () => {
  test('parseCloseState takes an unsaved flag and a title, and nothing else', () => {
    expect(parseCloseState({ unsaved: true, title: 'A', recoverable: true })).toEqual({
      unsaved: true,
      title: 'A',
      recoverable: true,
    });
    expect(parseCloseState({ unsaved: false, title: 'A', recoverable: false })).toEqual({
      unsaved: false,
      title: 'A',
      recoverable: false,
    });
    // A page that doesn't say its recovery copy works is not promised one.
    expect(parseCloseState({ unsaved: true })).toEqual({
      unsaved: true,
      title: '',
      recoverable: false,
    });
    expect(parseCloseState({ unsaved: 'yes', title: 'A' })).toBeNull();
    expect(parseCloseState(null)).toBeNull();
    expect(parseCloseState('x')).toBeNull();
  });
});

describe('the e2e hook for the dialog', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'drafter-close-')), 'close.json');

  test('answers from the queue and logs each question', () => {
    const f = file();
    writeFileSync(f, JSON.stringify(['save', 'cancel']));
    expect(nextCloseAnswer(f, { message: 'one', detail: 'd', buttons: ['a'] })).toBe('save');
    expect(nextCloseAnswer(f, { message: 'two', detail: 'd', buttons: ['a'] })).toBe('cancel');
    const log = readFileSync(`${f}.log`, 'utf8').trim().split('\n');
    expect(log.map((line) => JSON.parse(line).message)).toEqual(['one', 'two']);
  });

  test("an empty or missing queue says Don't Save, so a test's teardown can quit", () => {
    const f = file();
    expect(nextCloseAnswer(f, { message: 'm', detail: 'd', buttons: [] })).toBe('discard');
    writeFileSync(f, '[]');
    expect(nextCloseAnswer(f, { message: 'm', detail: 'd', buttons: [] })).toBe('discard');
  });

  test('anything but a known answer is a Cancel', () => {
    const f = file();
    writeFileSync(f, JSON.stringify(['format-disk']));
    expect(nextCloseAnswer(f, { message: 'm', detail: 'd', buttons: [] })).toBe('cancel');
  });
});
