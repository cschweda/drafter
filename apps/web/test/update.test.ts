import { describe, expect, test, vi } from 'vitest';
import {
  createUpdateFlow,
  UNSAVED_MESSAGE,
  UPDATE_READY,
  unsavedMessage,
} from '../app/update/flow';

// What happens when the writer chooses Reload on "A new version of Drafter is ready" (Phase 1
// design §11): it never reloads by itself, and with changes that aren't in a file it asks first.

function setup(options: { unsaved?: boolean; save?: 'saved' | 'cancelled' | 'throws' } = {}) {
  const calls: string[] = [];
  const flow = createUpdateFlow({
    unsaved: () => options.unsaved ?? false,
    save: async () => {
      calls.push('save');
      if (options.save === 'throws') throw new Error('no');
      return options.save ?? 'saved';
    },
    apply: async () => {
      calls.push('apply');
    },
    allowLeaving: () => {
      calls.push('allow-leaving');
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
  test('lets the page leave without the browser’s own question, then applies', async () => {
    const { flow, calls } = setup({ unsaved: true });
    await flow.reload();
    await flow.reloadAnyway();
    expect(calls).toEqual(['allow-leaving', 'apply']);
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
      allowLeaving: () => {},
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
