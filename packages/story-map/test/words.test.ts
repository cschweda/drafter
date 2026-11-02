import { describe, expect, test } from 'vitest';
import {
  dateWords,
  followOn,
  initialsOf,
  insideWords,
  minutesWords,
  placeWords,
  timeOf,
  titleCase,
} from '../src';

// Plain words (story-map design §5): what the page says in place of a script's own terms.

describe('plain words', () => {
  test('places read in plain words', () => {
    expect(placeWords('LIGHTHOUSE - LAMP ROOM')).toBe('Lighthouse, Lamp Room');
    expect(placeWords('HALL HOUSE - BACK ROOM #3#')).toBe('Hall House, Back Room');
    expect(placeWords('FERRY DECK #4A#')).toBe('Ferry Deck');
    // Any dash with a space each side splits; one inside a word doesn't.
    expect(placeWords('NORTH-EAST PIER – SHED')).toBe('North-East Pier, Shed');
    expect(placeWords('HOUSE OF THE TIDES')).toBe('House of the Tides');
    expect(placeWords('  ')).toBe('');
  });

  test('a heading of two places drops each part’s INT. or EXT.', () => {
    expect(placeWords('HOUSE - KITCHEN / EXT. GARDEN')).toBe('House, Kitchen, Garden');
    expect(placeWords('CAR / INT. GARAGE - LATER')).toBe('Car, Garage, Later');
    expect(placeWords('BARN - I/E. HAYLOFT')).toBe('Barn, Hayloft');
    expect(placeWords('INT./EXT. VAN')).toBe('Van');
    // A slash inside a name stays.
    expect(placeWords('24/7 DINER')).toBe('24/7 Diner');
  });

  test('INT., EXT., INT./EXT. become Inside, Outside, Inside and out', () => {
    expect(insideWords('inside')).toBe('Inside');
    expect(insideWords('outside')).toBe('Outside');
    expect(insideWords('both')).toBe('Inside and out');
    expect(insideWords('none')).toBeNull();
  });

  test('CONTINUOUS, LATER, SAME, MOMENTS LATER take the time before', () => {
    expect(timeOf('LATER', 'night')).toEqual({ time: null, kind: 'night' });
    expect(timeOf('CONTINUOUS', 'day')).toEqual({ time: null, kind: 'day' });
    expect(timeOf('SAME', null)).toEqual({ time: null, kind: null });
    expect(timeOf('moments  later', 'twilight')).toEqual({ time: null, kind: 'twilight' });
    expect(timeOf(null, 'night')).toEqual({ time: null, kind: null });
    // Later that night still follows on: the scene before's colour, the words kept.
    expect(timeOf('LATER THAT NIGHT', 'day')).toEqual({ time: 'Later That Night', kind: 'day' });
    expect(timeOf('MOMENTS LATER', 'night').kind).toBe('night');
    // The cast reads only its own times; a longer follow-on is split off the place here.
    expect(followOn('CAR / INT. GARAGE - LATER THAT NIGHT')).toEqual({
      location: 'CAR / INT. GARAGE',
      time: 'LATER THAT NIGHT',
    });
    expect(followOn('PIER - A FEW MINUTES LATER')).toEqual({
      location: 'PIER',
      time: 'A FEW MINUTES LATER',
    });
    expect(followOn('LATERAL HALL - EAST')).toEqual({
      location: 'LATERAL HALL - EAST',
      time: null,
    });
  });

  test('EVENING is twilight, MORNING is day', () => {
    expect(timeOf('EVENING', null)).toEqual({ time: 'Evening', kind: 'twilight' });
    expect(timeOf('MORNING', 'night')).toEqual({ time: 'Morning', kind: 'day' });
    expect(timeOf('NIGHT', 'day')).toEqual({ time: 'Night', kind: 'night' });
    for (const t of ['DAWN', 'DUSK', 'SUNSET', 'SUNRISE'])
      expect(timeOf(t, null).kind).toBe('twilight');
    for (const t of ['DAY', 'AFTERNOON']) expect(timeOf(t, null).kind).toBe('day');
  });

  test('minutes read as minutes', () => {
    expect(minutesWords(0)).toBe('under a minute');
    expect(minutesWords(0.4)).toBe('under a minute');
    expect(minutesWords(2)).toBe('2 min');
    expect(minutesWords(2.4)).toBe('2 min');
    expect(minutesWords(59.6)).toBe('about 1 hr');
    expect(minutesWords(110)).toBe('about 1 hr 50 min');
    expect(minutesWords(120)).toBe('about 2 hr');
  });

  test('plain words leave uncased text alone', () => {
    expect(titleCase('東京 - 駅')).toBe('東京 - 駅');
    expect(placeWords('東京 - 駅')).toBe('東京, 駅');
    expect(titleCase('بيت - مطبخ')).toBe('بيت - مطبخ');
    expect(initialsOf('李 小龍')).toBe('李小');
    expect(initialsOf('@McBRIDE')).toBe('M');
    expect(initialsOf('Wren Abernathy')).toBe('WA');
    expect(initialsOf('a. b. c.')).toBe('ab');
    expect(initialsOf('')).toBe('');
    // A word typed in mixed case keeps its capitals; one in capitals or lower case is title-cased.
    expect(titleCase('McBRIDE')).toBe('McBRIDE');
    expect(titleCase("MRS. AUBERT'S ROOM")).toBe("Mrs. Aubert's Room");
    expect(titleCase('the old mill')).toBe('The Old Mill');
  });

  test('dates are day, month, and year, in UTC', () => {
    expect(dateWords(Date.UTC(2026, 10, 1, 23, 59))).toBe('1 Nov 2026');
    expect(dateWords(Date.UTC(2027, 0, 31))).toBe('31 Jan 2027');
  });
});
