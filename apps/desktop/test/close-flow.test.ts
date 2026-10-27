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
      return { unsaved: false, title: 'The Call' };
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
  (title = 'The Call') =>
  async () => ({ unsaved: true, title });

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
    expect(dialog).toHaveBeenCalledWith({ title: 'Night Shift' });
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
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true });
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
    const slow = later<{ unsaved: boolean; title: string }>();
    const { flow, dialog } = rig({ state: () => slow.promise }, 'discard');
    const result = flow.decide('close');
    await new Promise((r) => setTimeout(r, 80));
    slow.resolve({ unsaved: true, title: 'x' });
    expect(await result).toBe('close');
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true });
  });

  test('a page whose state call fails is treated the same', async () => {
    const { flow, dialog } = rig({ state: () => Promise.reject(new Error('boom')) }, 'cancel');
    expect(await flow.decide('close')).toBe('stay');
    expect(dialog).toHaveBeenCalledWith({ unresponsive: true });
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

  test('keeps a long or odd title to one line', () => {
    const long = closeDialogText(`${'x'.repeat(200)}\nsecond line`).message;
    expect(long).not.toContain('\n');
    expect(long.length).toBeLessThan(140);
    expect(closeDialogText('   ').message).toBe('Save the changes to “Untitled” before closing?');
  });

  test('says when the page is not responding, and offers no Save', () => {
    const text = unresponsiveDialogText();
    expect(text.message).toMatch(/isn.t responding/i);
    expect(text.buttons).toEqual(["Don't Save", 'Cancel']);
    expect(text.buttons[text.defaultId]).toBe('Cancel');
    expect(text.buttons[text.cancelId]).toBe('Cancel');
    expect(text.detail).toMatch(/recovery copy/);
  });
});

describe('the renderer is not trusted', () => {
  test('parseCloseState takes an unsaved flag and a title, and nothing else', () => {
    expect(parseCloseState({ unsaved: true, title: 'A' })).toEqual({ unsaved: true, title: 'A' });
    expect(parseCloseState({ unsaved: false, title: 'A' })).toEqual({ unsaved: false, title: 'A' });
    expect(parseCloseState({ unsaved: true })).toEqual({ unsaved: true, title: '' });
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
