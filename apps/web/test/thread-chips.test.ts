import type { ThreadInfo } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { chipName, chipsOf } from '../app/threads/chips';

// A scene's or passage's thread chips (threads design §7.6): the label as text, the thread's
// color as a bar, and a name that says the thread's name when it has one.

const info = (label: string, name: string | null, color: ThreadInfo['color']): ThreadInfo => ({
  key: label.toLowerCase(),
  label,
  name,
  color,
  chosen: true,
  units: 1,
});

describe('chipName', () => {
  test('"thread A, The heist", or just "thread A" with no name', () => {
    expect(chipName('A', 'The heist')).toBe('thread A, The heist');
    expect(chipName('A', null)).toBe('thread A');
  });
});

describe('chipsOf', () => {
  const all = [info('A', 'The heist', 'yellow'), info('B', null, 'teal')];

  test('one chip per label, in the scene’s order, with the shown color and the name', () => {
    expect(chipsOf(['B', 'a'], all)).toEqual([
      { key: 'b', label: 'B', name: null, swatch: '#2fa7a0', accessibleName: 'thread B' },
      {
        key: 'a',
        label: 'a',
        name: 'The heist',
        swatch: '#e5c13a',
        accessibleName: 'thread a, The heist',
      },
    ]);
  });

  test('a label the session has not read yet still gets a chip, with no color', () => {
    expect(chipsOf(['Z'], all)).toEqual([
      { key: 'z', label: 'Z', name: null, swatch: null, accessibleName: 'thread Z' },
    ]);
  });

  test('no labels, no chips', () => {
    expect(chipsOf([], all)).toEqual([]);
    expect(chipsOf(undefined, all)).toEqual([]);
  });
});
