import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createUpdateFlow,
  DOWNLOADING_MESSAGE,
  reloadAnywayLabel,
  UNSAVED_MESSAGE,
  UPDATE_READY,
  unsavedMessage,
} from '../app/update/flow';
import {
  applyUpdate,
  createControllerWatch,
  leavingRequested,
  needRefresh,
  replaced,
  setUpdater,
} from '../app/update/state';

// What happens when the writer chooses Reload on "A new version of Drafter is ready" (Phase 1
// design §11): it never reloads by itself, and with changes that aren't in a file it asks first.

function setup(
  options: { unsaved?: boolean; save?: 'saved' | 'cancelled' | 'throws'; download?: boolean } = {},
) {
  const calls: string[] = [];
  const flow = createUpdateFlow({
    unsaved: () => options.unsaved ?? false,
    save: async () => {
      calls.push('save');
      if (options.save === 'throws') throw new Error('no');
      return options.save ?? 'saved';
    },
    savedByDownload: () => options.download ?? false,
    flush: async () => {
      calls.push('flush');
    },
    apply: async (apply) => {
      calls.push(apply?.anyway ? 'apply-anyway' : 'apply');
    },
  });
  return { flow, calls };
}

describe('the wording', () => {
  test('is the brief’s', () => {
    expect(UPDATE_READY).toBe('A new version of Drafter is ready');
    expect(UNSAVED_MESSAGE).toBe(
      'Your unsaved changes stay in this browser’s recovery copy, but they aren’t in your file yet.',
    );
  });

  test('does not promise a recovery copy the browser can’t keep', () => {
    expect(unsavedMessage('ok')).toBe(UNSAVED_MESSAGE);
    expect(unsavedMessage('not-persistent')).toBe(UNSAVED_MESSAGE);
    expect(unsavedMessage('unavailable')).not.toContain('stay in this browser');
    expect(unsavedMessage('unavailable')).toContain('aren’t in your file');
  });
});

describe('Reload', () => {
  test('applies the update at once when nothing is unsaved', async () => {
    const { flow, calls } = setup();
    await flow.reload();
    expect(calls).toEqual(['apply']);
    expect(flow.stage.value).toBe('toast');
  });

  test('asks first when there are unsaved changes, and applies nothing yet', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reload();
    expect(calls).toEqual([]);
    expect(flow.stage.value).toBe('confirm');
  });

  test('Cancel goes back to the toast and applies nothing', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reload();
    flow.cancel();
    expect(flow.stage.value).toBe('toast');
    expect(calls).toEqual([]);
  });
});

describe('Reload anyway', () => {
  test('keeps the recovery copy up to date first, then applies, asking to leave without a question', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reload();
    await flow.reloadAnyway();
    expect(calls).toEqual(['flush', 'apply-anyway']);
  });

  test('does nothing before the question has been asked', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reloadAnyway();
    expect(calls).toEqual([]);
  });
});

describe('Save first', () => {
  test('applies the update only after the save has worked', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reload();
    await flow.saveFirst();
    expect(calls).toEqual(['save', 'apply']);
  });

  test('a cancelled save (the picker closed) reloads nothing and keeps the question', async () => {
    const { flow, calls } = setup({ unsaved: true, save: 'cancelled' });
    await flow.reload();
    await flow.saveFirst();
    expect(calls).toEqual(['save']);
    expect(flow.stage.value).toBe('confirm');
    expect(flow.saving.value).toBe(false);
  });

  test('a save that fails reloads nothing and keeps the question', async () => {
    const { flow, calls } = setup({ unsaved: true, save: 'throws' });
    await flow.reload();
    await flow.saveFirst();
    expect(calls).toEqual(['save']);
    expect(flow.stage.value).toBe('confirm');
    expect(flow.saving.value).toBe(false);
  });

  test('is busy while it saves, and a second press does not save twice', async () => {
    let finish: (v: 'saved') => void = () => {};
    const save = vi.fn(() => new Promise<'saved'>((resolve) => (finish = resolve)));
    const apply = vi.fn();
    const flow = createUpdateFlow({
      unsaved: () => true,
      save,
      apply,
      savedByDownload: () => false,
      flush: async () => {},
    });
    await flow.reload();
    const first = flow.saveFirst();
    const second = flow.saveFirst();
    expect(flow.saving.value).toBe(true);
    finish('saved');
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('Save first where Save is a download', () => {
  test('does not reload at once: the download has to finish first', async () => {
    const { flow, calls } = setup({ unsaved: true, download: true });
    await flow.reload();
    await flow.saveFirst();
    expect(calls).toEqual(['save']);
    expect(flow.stage.value).toBe('downloading');
  });

  test('Reload then reloads, with nothing left to ask about', async () => {
    const { flow, calls } = setup({ unsaved: false, download: true });
    flow.stage.value = 'downloading';
    await flow.reload();
    expect(calls).toEqual(['apply']);
  });

  test('says what is happening', () => {
    expect(DOWNLOADING_MESSAGE).toBe('Your script is downloading. Reload when it has finished.');
  });
});

describe('the button that reloads with changes unsaved', () => {
  test('says “Reload anyway”, and “Reload and lose them” when no recovery copy is kept', () => {
    expect(reloadAnywayLabel('ok')).toBe('Reload anyway');
    expect(reloadAnywayLabel('not-persistent')).toBe('Reload anyway');
    expect(reloadAnywayLabel('unavailable')).toBe('Reload and lose them');
  });
});

describe('a new version taking over', () => {
  const reload = vi.fn();
  beforeEach(() => {
    reload.mockClear();
    needRefresh.value = false;
    replaced.value = false;
  });

  test('on a first visit, the first worker claiming the page is not an update', () => {
    const watch = createControllerWatch({ controlled: false, reload });
    watch.onChange();
    expect(replaced.value).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    // The next change is one.
    watch.onChange();
    expect(replaced.value).toBe(true);
  });

  test('in a tab that asked for it, reloads', () => {
    const watch = createControllerWatch({ controlled: true, reload });
    watch.apply();
    watch.onChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('in a tab that did not ask, only notes it, and does not reload', () => {
    const watch = createControllerWatch({ controlled: true, reload });
    watch.onChange();
    expect(replaced.value).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  test('in a tab loaded without a worker (a hard reload) that was offered an update, Reload reloads', () => {
    // Nothing controls the page, but a worker is waiting, so the offer is up.
    needRefresh.value = true;
    const watch = createControllerWatch({ controlled: false, reload });
    watch.apply();
    watch.onChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('in a tab loaded without a worker, another tab’s update counts as one once an update was offered', () => {
    needRefresh.value = true;
    const watch = createControllerWatch({ controlled: false, reload });
    watch.onChange();
    expect(replaced.value).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('applying an update', () => {
  test('remembers whether the writer chose to leave with changes, for the reload to use', async () => {
    const apply = vi.fn(async () => {});
    setUpdater(apply);
    await applyUpdate({ anyway: true });
    expect(leavingRequested()).toBe(true);
    await applyUpdate();
    expect(leavingRequested()).toBe(false);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
