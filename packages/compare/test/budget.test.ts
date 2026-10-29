import { describe, expect, test } from 'vitest';
import { changesOf } from '../src';

/** A script-like text: every other line blank, the rest from a small seeded vocabulary. */
function script(seed: number, count: number): string {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
  };
  const words = ['Sam', 'Ann', 'waits', 'leaves', 'the', 'door', 'rain', 'stops', 'HALL', 'ROOF'];
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 1) lines.push('');
    else lines.push(Array.from({ length: 4 }, () => words[next() % words.length]).join(' '));
  }
  return lines.join('\n');
}

describe('budget', () => {
  // The budget is 2 seconds; locally this runs in a fraction of that, which leaves CI its margin.
  test('diffs two unrelated 5,000-line texts in under 2 seconds', () => {
    const older = script(1, 5000);
    const newer = script(2, 5000);
    const unrelated = (n: number, tag: string) =>
      Array.from({ length: n }, (_, i) => `${tag} line ${i}`).join('\n');
    const started = performance.now();
    const changes = changesOf(older, newer);
    const disjoint = changesOf(unrelated(5000, 'old'), unrelated(5000, 'new'));
    const elapsed = performance.now() - started;
    expect(changes.length).toBeGreaterThan(0);
    expect(disjoint).toHaveLength(1);
    expect(elapsed).toBeLessThan(2000);
  });
});
