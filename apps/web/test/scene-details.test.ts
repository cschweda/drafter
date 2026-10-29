import type { Scene } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { changedDetails, detailsDraft, goalLine } from '../app/outline/scene-details';

const at = { from: 0, to: 1 };

const scene = (more: Partial<Scene> = {}): Scene => ({
  kind: 'scene',
  ordinal: 1,
  number: null,
  block: 0,
  heading: 'INT. HALL - DAY',
  span: { from: 0, to: 100 },
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

const full = scene({
  synopses: [
    { text: 'Ann arrives.', block: 2, span: at },
    { text: 'A second one.', block: 3, span: at },
  ],
  color: { value: 'blue', span: at },
  fields: {
    color: { body: 'blue', span: at },
    storyline: { body: 'A, B', span: at },
    goal: { body: 'Ann wants in. / Then out.', span: at },
    conflict: { body: 'The door is locked.', span: at },
    outcome: { body: 'She waits.', span: at },
    shift: { body: 'hope → dread', span: at },
  },
  // Every Storyline note's labels; the form shows only the first note's body.
  storylines: ['A', 'B', 'C'],
});

describe('Scene details', () => {
  test("starts from the scene's fields", () => {
    expect(detailsDraft(full)).toEqual({
      synopsis: 'Ann arrives.',
      color: 'blue',
      storyline: 'A, B',
      goal: 'Ann wants in. / Then out.',
      conflict: 'The door is locked.',
      outcome: 'She waits.',
      shift: 'hope → dread',
    });
    expect(detailsDraft(scene())).toEqual({
      synopsis: '',
      color: null,
      storyline: '',
      goal: '',
      conflict: '',
      outcome: '',
      shift: '',
    });
  });

  test('reports only the changed fields', () => {
    expect(changedDetails(full, detailsDraft(full))).toEqual({});
    expect(
      changedDetails(full, { ...detailsDraft(full), goal: 'Ann wants out.', color: 'teal' }),
    ).toEqual({ goal: 'Ann wants out.', color: 'teal' });
    // Spaces around a value are no change, and a new value is written without them.
    expect(changedDetails(full, { ...detailsDraft(full), outcome: '  She waits. ' })).toEqual({});
    expect(changedDetails(scene(), { ...detailsDraft(scene()), shift: ' + → − ' })).toEqual({
      shift: '+ → −',
    });
    // A color Drafter doesn't know is kept until another is chosen.
    const odd = scene({ color: { value: 'chartreuse', span: at } });
    expect(detailsDraft(odd).color).toBe('chartreuse');
    expect(changedDetails(odd, detailsDraft(odd))).toEqual({});
  });

  test('an emptied field is cleared', () => {
    expect(
      changedDetails(full, {
        ...detailsDraft(full),
        synopsis: '',
        color: null,
        storyline: ' ',
        conflict: '',
      }),
    ).toEqual({ synopsis: '', color: null, storyline: '', conflict: '' });
  });

  test("the goal's first line stops at /", () => {
    expect(goalLine(full)).toBe('Ann wants in.');
    expect(goalLine(scene({ fields: { goal: { body: 'To win', span: at } } }))).toBe('To win');
    // A slash inside words is not a line break.
    expect(goalLine(scene({ fields: { goal: { body: 'Win and/or lose', span: at } } }))).toBe(
      'Win and/or lose',
    );
    expect(goalLine(scene())).toBeNull();
  });
});
