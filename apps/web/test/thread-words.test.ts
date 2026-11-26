import { describe, expect, test } from 'vitest';
import {
  labelRefusal,
  limitMessage,
  mergeQuestion,
  removedMessage,
  removeQuestion,
  renamedMessage,
  saveRefusal,
} from '../app/threads/words';

describe('thread words', () => {
  test('a Save that a label already there refuses names the label, or the count', () => {
    expect(saveRefusal(['A', 'B'], 'scene')).toBeNull();
    const long = 'x'.repeat(41);
    expect(saveRefusal(['A', long], 'scene')).toBe(
      `Thread ${long} can’t be saved: a label is at most 40 characters. Uncheck it to save.`,
    );
    expect(saveRefusal(['a]]'], 'passage')).toBe(
      'Thread a]] can’t be saved: a label can’t have [[ or ]], because they open and close a note. Uncheck it to save.',
    );
    const many = Array.from({ length: 13 }, (_, i) => `T${i}`);
    expect(saveRefusal(many, 'scene')).toBe(
      'This scene is in more than 12 threads. Uncheck some to save.',
    );
  });

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
