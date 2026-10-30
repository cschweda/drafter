import type { Scene, Section } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import {
  colorName,
  lengthLabel,
  lengthWords,
  rowTime,
  sceneName,
  sectionName,
} from '../app/outline/labels';
import { DEFAULT_RATES } from '../app/stats/timing';

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
  fields: {},
  storylines: [],
  marks: [],
  speakers: [],
  words: 0,
  timing: { spoken: 0, actionLines: 0 },
  spokenBy: {},
  pages: null,
  ...more,
});

const section = (more: Partial<Section> = {}): Section => ({
  kind: 'section',
  block: 1,
  depth: 1,
  title: 'Act One',
  span: { from: 0, to: 10 },
  introEnd: 9,
  parent: null,
  scenes: 5,
  eighths: 96,
  timing: { spoken: 0, actionLines: 0 },
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
    ).toBe(
      'Scene 12A, INT. KITCHEN - NIGHT, blue, page 12, 1 3/8 pages, about 1 minute 25 seconds',
    );
  });

  test("a scene's name says its time in words, at the script's rate", () => {
    const long = scene({ pages: { page: 12, line: 1, eighths: 11 } });
    // 11 eighths at a minute a page is 82.5 s, to 5 s; at 1.2 minutes a page, 99 s.
    expect(sceneName(long)).toBe(
      'Scene 3, INT. KITCHEN - NIGHT, page 12, 1 3/8 pages, about 1 minute 25 seconds',
    );
    expect(sceneName(long, { minutesPerPage: 1.2, wordsPerMinute: 150 })).toBe(
      'Scene 3, INT. KITCHEN - NIGHT, page 12, 1 3/8 pages, about 1 minute 40 seconds',
    );
    expect(rowTime(11, DEFAULT_RATES)).toBe('1 min 25 s');
    expect(rowTime(11, { minutesPerPage: 1.2, wordsPerMinute: 150 })).toBe('1 min 40 s');
  });

  test('no time without pages', () => {
    expect(rowTime(null, DEFAULT_RATES)).toBe('');
    // Its words don't give it a time here: the Outline's times are the pages'.
    expect(sceneName(scene({ timing: { spoken: 300, actionLines: 4 } }))).toBe(
      'Scene 3, INT. KITCHEN - NIGHT',
    );
    expect(sectionName(section({ eighths: null }))).toBe('Act One, 5 scenes');
  });

  test("a section's name says its time", () => {
    expect(sectionName(section())).toBe('Act One, 5 scenes, 12 pages, about 12 minutes');
    expect(sectionName(section(), { minutesPerPage: 1.5, wordsPerMinute: 150 })).toBe(
      'Act One, 5 scenes, 12 pages, about 18 minutes',
    );
    expect(sectionName(section({ scenes: 1, eighths: 1 }))).toBe(
      'Act One, 1 scene, 1/8 page, about 10 seconds',
    );
  });

  test('names a color, and one Drafter does not know as written', () => {
    expect(colorName('teal')).toBe('teal');
    expect(colorName('mauve')).toBe('mauve');
  });
});
