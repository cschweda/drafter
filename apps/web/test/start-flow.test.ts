import { describe, expect, test } from 'vitest';
import { createStartFlow } from '../app/drafts/start-flow';

// Start new draft…'s question: an Enter pressed before the same-text check has finished waits for
// it, and asks, rather than starting a draft with no question.

function setup(last: { n: number } | null) {
  let resolve: (value: { n: number } | null) => void = () => {};
  const started: string[] = [];
  const flow = createStartFlow({
    sameAs: () =>
      new Promise((done) => {
        resolve = done;
      }),
    start: async (note) => {
      started.push(note);
      return true;
    },
  });
  return { flow, started, finish: () => resolve(last) };
}

describe('Start new draft’s question', () => {
  test('Enter before the check has finished waits, then asks', async () => {
    const { flow, started, finish } = setup({ n: 4 });
    flow.open();
    const submitted = flow.submit('notes');
    finish();
    expect(await submitted).toBe('asked');
    expect(started).toEqual([]);
    expect(flow.same.value).toEqual({ n: 4 });
    // With the question shown, Enter starts it.
    expect(await flow.submit('notes')).toBe('started');
    expect(started).toEqual(['notes']);
  });

  test('a different text starts at once, after the check', async () => {
    const { flow, started, finish } = setup(null);
    flow.open();
    const submitted = flow.submit('');
    finish();
    expect(await submitted).toBe('started');
    expect(started).toEqual(['']);
  });

  test('opening again forgets the last question', async () => {
    const { flow, finish } = setup({ n: 1 });
    flow.open();
    finish();
    await flow.submit('');
    expect(flow.same.value).toEqual({ n: 1 });
    flow.open();
    expect(flow.same.value).toBeNull();
  });
});
