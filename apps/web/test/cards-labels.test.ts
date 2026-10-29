import type { Scene } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { cardName } from '../app/cards/labels';

const scene = (more: Partial<Scene> = {}): Scene => ({
  kind: 'scene',
  ordinal: 12,
  number: null,
  block: 4,
  heading: 'INT. KITCHEN - NIGHT',
  span: { from: 0, to: 10 },
  sections: [],
  synopses: [],
  color: null,
  fields: {},
  storylines: [],
  marks: [],
  speakers: [],
  words: 0,
  pages: null,
  ...more,
});

describe('card labels', () => {
  test('names a card with number, heading, color, and length', () => {
    expect(
      cardName(
        scene({
          color: { value: 'blue', span: { from: 0, to: 1 } },
          pages: { page: 12, eighths: 11 } as Scene['pages'],
        }),
      ),
    ).toBe('Scene 12, INT. KITCHEN - NIGHT, blue, 1 3/8 pages');
    // A locked number, no color, and no pages yet.
    expect(cardName(scene({ number: '12A' }))).toBe('Scene 12A, INT. KITCHEN - NIGHT');
    expect(cardName(scene({ heading: '' }))).toBe('Scene 12, Untitled scene');
  });
});
