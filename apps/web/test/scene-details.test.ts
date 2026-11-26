import type { Scene } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import {
  changedDetails,
  detailsDraft,
  goalLine,
  threadSuggestions,
} from '../app/outline/scene-details';

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
  threads: [],
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
    thread: { body: 'A, B', span: at },
    goal: { body: 'Ann wants in. / Then out.', span: at },
    conflict: { body: 'The door is locked.', span: at },
    outcome: { body: 'She waits.', span: at },
    shift: { body: 'hope → dread', span: at },
  },
  // Every Storyline note's labels; the form shows only the first note's body.
  threads: ['A', 'B', 'C'],
});

describe('Scene details', () => {
  test("starts from the scene's fields", () => {
    expect(detailsDraft(full)).toEqual({
      synopsis: 'Ann arrives.',
      color: 'blue',
      thread: 'A, B, C',
      goal: 'Ann wants in. / Then out.',
      conflict: 'The door is locked.',
      outcome: 'She waits.',
      shift: 'hope → dread',
    });
    expect(detailsDraft(scene())).toEqual({
      synopsis: '',
      color: null,
      thread: '',
      goal: '',
      conflict: '',
      outcome: '',
      shift: '',
    });
  });

  test('shows every Storyline note label in the Thread field, not only the first note', () => {
    expect(detailsDraft(full).thread).toBe('A, B, C');
    expect(detailsDraft(scene({ threads: ['X'] })).thread).toBe('X');
    expect(detailsDraft(scene()).thread).toBe('');
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
        thread: ' ',
        conflict: '',
      }),
    ).toEqual({ synopsis: '', color: null, thread: '', conflict: '' });
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

describe('the Threads field’s suggestions', () => {
  const scenes = [
    scene({ threads: ['Heist', 'Rain'] }),
    scene({ threads: ['heist', 'Bottle'] }),
    scene({ threads: [] }),
  ];

  test('every label in use, once each as first typed, for an empty field', () => {
    expect(threadSuggestions(scenes, '')).toEqual(['Heist', 'Rain', 'Bottle']);
  });

  test('after a comma: the field so far and each label not yet in it', () => {
    expect(threadSuggestions(scenes, 'Rain, ')).toEqual(['Rain, Heist', 'Rain, Bottle']);
    expect(threadSuggestions(scenes, 'rain,Bo')).toEqual(['rain, Heist', 'rain, Bottle']);
  });
});
