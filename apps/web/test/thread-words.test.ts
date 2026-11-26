import { describe, expect, test } from 'vitest';
import {
  labelRefusal,
  limitMessage,
  mergeQuestion,
  removedMessage,
  removeQuestion,
  renamedMessage,
} from '../app/threads/words';

describe('thread words', () => {
  test('says why a label is refused', () => {
    expect(labelRefusal('A')).toBeNull();
    expect(labelRefusal('  ')).toMatch(/needs a label/);
    expect(labelRefusal('x'.repeat(41))).toMatch(/at most 40/);
    expect(labelRefusal('a]]')).toMatch(/\]\]/);
    expect(labelRefusal('[[a')).toMatch(/\[\[/);
    expect(labelRefusal('a, b')).toMatch(/comma/);
    expect(labelRefusal('a\nb')).toMatch(/one line/);
  });

  test('the limit, per noun', () => {
    expect(limitMessage('scene')).toBe('A scene has at most 12 threads.');
    expect(limitMessage('passage')).toBe('A passage has at most 12 threads.');
  });

  test('announcements pluralize', () => {
    expect(renamedMessage('A', 'Heist', 12, 'scene')).toBe(
      'Renamed thread A to Heist in 12 scenes.',
    );
    expect(renamedMessage('A', 'Heist', 1, 'passage')).toBe(
      'Renamed thread A to Heist in 1 passage.',
    );
    expect(mergeQuestion('A', 'B')).toBe('B is already a thread. Merge A into it?');
    expect(removeQuestion('A', 3, 'scene')).toBe('Remove thread A from 3 scenes?');
    expect(removedMessage('A', 1, 'scene')).toBe('Removed thread A from 1 scene.');
  });
});
