import { describe, expect, test } from 'vitest';
import { build, HARBOR } from './scripts';

describe('figures', () => {
  const paged = build(HARBOR, { pages: true });
  const { cast, index } = paged;
  const figures = (key: string) => cast.figures.get(key);
  const eighths = (scenes: number[]) =>
    scenes.reduce((sum, n) => sum + (index.scenes[n - 1]?.pages?.eighths ?? Number.NaN), 0);

  test('screen time adds the eighths of every scene a character is in', () => {
    expect(paged.perPage).toBeGreaterThan(0);
    expect(figures('HOPE')?.screenEighths).toBe(eighths([1, 5, 6, 8, 12]));
    expect(figures('TOM')?.screenEighths).toBe(eighths([2, 4, 9, 11]));
    expect(cast.locations.get('HOUSE')?.eighths).toBe(eighths([9, 10]));
  });

  test('screen time is null without pages', () => {
    const { cast } = build(HARBOR);
    for (const f of cast.figures.values()) {
      expect(f.screenEighths).toBeNull();
      expect(f.absences).toBeNull();
      expect(f.longest).toBeNull();
    }
    expect(cast.locations.get('HOUSE')?.eighths).toBeNull();
  });

  test('dialogue share uses both sides of a dual pair', () => {
    expect(figures('TOM')).toMatchObject({ speeches: 2, words: 2, speaksIn: 2 });
    expect(figures('MCCLANE')).toMatchObject({ speeches: 2, words: 4, speaksIn: 2 });
    // The cold open's and the section's speeches count too.
    expect(figures('WILL')).toMatchObject({ speeches: 4, words: 16, speaksIn: 3 });
    expect(figures('HOPE')).toMatchObject({ speeches: 6, words: 29, speaksIn: 5 });
    expect(figures('MCCLANE')?.share).toBeCloseTo(4 / 64, 10);
    const total = [...cast.figures.values()].reduce((sum, f) => sum + f.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  test('first and last appearance', () => {
    expect(figures('WILL')).toMatchObject({ first: 0, last: 12 });
    expect(figures('THE DRIVER')).toMatchObject({ first: 4, last: 6 });
    // In a script whose only speech is before the first scene, no scene has them.
    const { cast } = build('BEA\nHello.\n\nINT. ROOM - DAY\n\nA chair.\n');
    expect(cast.figures.get('BEA')).toMatchObject({
      first: null,
      last: null,
      scenes: [],
      speeches: 1,
      share: 1,
    });
  });

  test('shares scenes with, most first, ties by speeches', () => {
    expect(figures('WILL')?.sharedWith).toEqual([
      { key: 'HOPE', scenes: 1 },
      { key: 'MCCLANE', scenes: 1 },
      { key: 'THE DRIVER', scenes: 1 },
    ]);
    expect(figures('TOM')?.sharedWith).toEqual([
      { key: 'ANN', scenes: 2 },
      { key: 'MCCLANE', scenes: 1 },
    ]);
    expect(figures('ANN')?.sharedWith).toEqual([
      { key: 'TOM', scenes: 2 },
      { key: 'ANN LEE', scenes: 1 },
    ]);
  });

  test('locations visited', () => {
    expect(figures('WILL')?.locations).toEqual([
      { key: 'HARBOR', scenes: 2 },
      { key: 'TRUCK', scenes: 1 },
      { key: 'HOUSE', scenes: 1 },
    ]);
  });

  test('firstIn lists who is first seen in each scene', () => {
    expect([...cast.firstIn]).toEqual([
      [0, ['HOPE', 'WILL']],
      [1, ['ANN', 'TOM']],
      [2, ['ANN LEE']],
      [3, ['MCCLANE']],
      [4, ['THE DRIVER']],
    ]);
  });

  test('location figures count inside, outside, and times', () => {
    expect(cast.locations.get('HARBOR OFFICE')).toEqual({
      key: 'HARBOR OFFICE',
      location: 'HARBOR OFFICE',
      scenes: [1, 2, 4, 11, 13],
      eighths: eighths([2, 3, 5, 12, 14]),
      inside: { inside: 4, outside: 0, both: 1, none: 0 },
      times: { NIGHT: 1, CONTINUOUS: 1, DAY: 1, MORNING: 1, LATER: 1 },
      people: [
        { key: 'HOPE', scenes: 2, speaksIn: 2 },
        { key: 'ANN LEE', scenes: 2, speaksIn: 2 },
        // Silent in scene 14.
        { key: 'ANN', scenes: 2, speaksIn: 1 },
        { key: 'TOM', scenes: 1, speaksIn: 0 },
        { key: 'THE DRIVER', scenes: 1, speaksIn: 0 },
      ],
    });
  });
});
