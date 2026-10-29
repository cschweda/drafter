import type { Scene } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { colorName, lengthLabel, lengthWords, sceneName } from '../app/outline/labels';

const scene = (more: Partial<Scene> = {}): Scene => ({
  kind: 'scene',
  ordinal: 3,
  number: null,
  block: 4,
  heading: 'INT. KITCHEN - NIGHT',
  span: { from: 0, to: 10 },
  sections: [],
  synopses: [],
  color: null,
  speakers: [],
  words: 0,
  pages: null,
  ...more,
});

describe('outline labels', () => {
  test.each([
    [1, '1/8 p', '1/8 page'],
    [8, '1 p', '1 page'],
    [11, '1 3/8 pp', '1 3/8 pages'],
    [16, '2 pp', '2 pages'],
  ])('%i eighths is %s, read as %s', (eighths, short, words) => {
    expect(lengthLabel(eighths)).toBe(short);
    expect(lengthWords(eighths)).toBe(words);
  });

  test('names a scene by its number, heading, color, and pages', () => {
    expect(sceneName(scene())).toBe('Scene 3, INT. KITCHEN - NIGHT');
    expect(
      sceneName(
        scene({
          number: '12A',
          color: { value: 'blue', span: { from: 0, to: 1 } },
          pages: { page: 12, line: 1, eighths: 11 },
        }),
      ),
    ).toBe('Scene 12A, INT. KITCHEN - NIGHT, blue, page 12, 1 3/8 pages');
  });

  test('names a color, and one Drafter does not know as written', () => {
    expect(colorName('teal')).toBe('teal');
    expect(colorName('mauve')).toBe('mauve');
  });
});
