import { describe, expect, test } from 'vitest';
import { dayOrNight, insideOf, placeOf, TIMES_OF_DAY } from '../src';
import { build, HARBOR, PARLOR } from './scripts';

/** Each scene's place in `headings`, one scene per heading. */
function places(...headings: string[]) {
  const { index, doc, template } = build(headings.map((h) => `${h}\n\nA gull.\n`).join('\n'));
  return index.scenes.map((scene) => placeOf(scene, doc, template));
}

describe('place', () => {
  test('INT. and EXT. of one place are one location', () => {
    const [inside, outside] = places('INT. BARN - DAY', 'EXT. BARN - NIGHT');
    expect(inside).toEqual({ location: 'BARN', key: 'BARN', inside: 'inside', time: 'DAY' });
    expect(outside).toEqual({ location: 'BARN', key: 'BARN', inside: 'outside', time: 'NIGHT' });
    const { cast } = build(HARBOR);
    expect(cast.locations.get('HARBOR OFFICE')?.scenes).toEqual([1, 2, 4, 11, 13]);
    expect(cast.locations.get('HARBOR')?.scenes).toEqual([0, 3, 12]);
  });

  test('the time part comes off when it is a known time', () => {
    expect(places('EXT. HARBOR - MOMENTS LATER', 'INT. BARN - Night', 'INT. BARN - 1987')).toEqual([
      { location: 'HARBOR', key: 'HARBOR', inside: 'outside', time: 'MOMENTS LATER' },
      { location: 'BARN', key: 'BARN', inside: 'inside', time: 'Night' },
      { location: 'BARN - 1987', key: 'BARN - 1987', inside: 'inside', time: null },
    ]);
    expect(TIMES_OF_DAY).toEqual([
      'DAY',
      'NIGHT',
      'MORNING',
      'AFTERNOON',
      'EVENING',
      'DAWN',
      'DUSK',
      'SUNSET',
      'SUNRISE',
      'LATER',
      'CONTINUOUS',
      'SAME',
      'MOMENTS LATER',
    ]);
    // The Stats tab's day and night: the first part after the place that starts with either.
    expect(dayOrNight('INT. DAY CARE - NIGHT - CONTINUOUS', 'INT.')).toBe('NIGHT');
    expect(dayOrNight('EXT. FIELD - DAY (1987)', 'EXT.')).toBe('DAY');
    expect(dayOrNight('EXT. FIELD - DUSK', 'EXT.')).toBeNull();
  });

  test('HOUSE - KITCHEN and HOUSE are two locations', () => {
    const { cast } = build(HARBOR);
    expect(cast.locations.get('HOUSE - KITCHEN')?.scenes).toEqual([7]);
    expect(cast.locations.get('HOUSE')?.scenes).toEqual([8, 9]);
    // Sorted by key, so a place and the places inside it sit together.
    expect([...cast.locations.keys()]).toEqual([
      'COAST ROAD',
      'HARBOR',
      'HARBOR OFFICE',
      'HOUSE',
      'HOUSE - KITCHEN',
      'TRUCK',
      'TRUCK - MOVING',
    ]);
  });

  test('dashes and spaces fold in the key', () => {
    const found = places(
      'INT. HOUSE - KITCHEN - DAY',
      'INT. HOUSE – KITCHEN - DAY',
      'INT. house  -  kitchen — DAY',
      'INT. HOUSE -KITCHEN',
      'INT. HOUSE-KITCHEN',
    );
    expect(found.map((p) => p.key)).toEqual([
      'HOUSE - KITCHEN',
      'HOUSE - KITCHEN',
      'HOUSE - KITCHEN',
      'HOUSE - KITCHEN',
      'HOUSE-KITCHEN',
    ]);
    // The location is shown as first typed in each heading.
    expect(found[2]?.location).toBe('house  -  kitchen');
    expect(found[2]?.time).toBe('DAY');
  });

  test('a locked number comes off', () => {
    const { cast } = build(HARBOR);
    expect(cast.places[13]).toEqual({
      location: 'HARBOR OFFICE',
      key: 'HARBOR OFFICE',
      inside: 'inside',
      time: 'LATER',
    });
  });

  test("a play's ## scene has no location", () => {
    const { cast } = build(PARLOR);
    const none = { location: null, key: null, inside: 'none', time: null };
    expect(cast.places).toEqual([
      none,
      none,
      none,
      none,
      { location: 'PARLOR', key: 'PARLOR', inside: 'inside', time: 'EVENING' },
    ]);
    expect([...cast.locations.keys()]).toEqual(['PARLOR']);
  });

  test('INT./EXT. and I/E are both', () => {
    const { cast } = build(HARBOR);
    expect(cast.places[10]).toEqual({
      location: 'TRUCK - MOVING',
      key: 'TRUCK - MOVING',
      inside: 'both',
      time: 'NIGHT',
    });
    expect(cast.places[11]?.inside).toBe('both');
    expect(
      places('EXT./INT. DOCK - DAY', '.E/I DOCK', 'INT/EXT DOCK', 'EST. TOWN - DAY', '.DOCK'),
    ).toEqual([
      { location: 'DOCK', key: 'DOCK', inside: 'both', time: 'DAY' },
      { location: 'DOCK', key: 'DOCK', inside: 'both', time: null },
      { location: 'DOCK', key: 'DOCK', inside: 'both', time: null },
      { location: 'TOWN', key: 'TOWN', inside: 'outside', time: 'DAY' },
      { location: 'DOCK', key: 'DOCK', inside: 'none', time: null },
    ]);
    expect(insideOf('INT./EXTRA ROOM')).toBe('inside');
    expect(insideOf('INTERIOR')).toBe('none');
  });
});
