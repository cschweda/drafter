import { reparse } from '@drafter/fountain';
import { expect, test, vi } from 'vitest';
import { classicEditor, type } from './harness';

vi.mock('@drafter/fountain', async (original) => {
  const real = await original<typeof import('@drafter/fountain')>();
  return { ...real, reparse: vi.fn(real.reparse) };
});

test('a key on a soft line 1 with a colon makes one full parse of its own', () => {
  const state = type(classicEditor('|'), 'She waits:');
  vi.mocked(reparse).mockClear();
  type(state, ' ');
  // One for the parse the editor keeps, and one for the question.
  expect(vi.mocked(reparse)).toHaveBeenCalledTimes(2);
});
