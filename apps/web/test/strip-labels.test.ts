import type { Scene, Section, StripRow } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { SWATCH } from '../app/outline/labels';
import { blockFill, blockName, cardLines, rowMark, rowName } from '../app/strip/labels';

const span = { from: 0, to: 1 };

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
  ...more,
});

const row = (kind: StripRow['kind'], depth: number | null): StripRow => ({
  kind,
  depth,
  blocks: [],
});

describe('strip labels', () => {
  test('marks and names each row', () => {
    expect(rowMark(row('section', 1))).toBe('#');
    expect(rowMark(row('section', 2))).toBe('##');
    expect(rowMark(row('section', 3))).toBe('###');
    expect(rowMark(row('scenes', null))).toBe('Scenes');
    expect(rowName(row('section', 1))).toBe('Sections marked #');
    expect(rowName(row('section', 2))).toBe('Sections marked ##');
    expect(rowName(row('section', 3))).toBe('Sections marked ###');
    expect(rowName(row('scenes', null))).toBe('Scenes');
  });

  test('names a block as the Outline names its row, with the goal', () => {
    expect(blockName(scene())).toBe('Scene 12, INT. KITCHEN - NIGHT');
    expect(
      blockName(
        scene({
          color: { value: 'blue', span },
          pages: { page: 12, line: 1, eighths: 11 },
          fields: { goal: { body: 'Get the call', span } },
        }),
      ),
    ).toBe('Scene 12, INT. KITCHEN - NIGHT, blue, page 12, 1 3/8 pages, goal: Get the call');
    expect(blockName(section())).toBe('Act One, 5 scenes, 12 pages');
  });

  test("the card gives page, length, color, goal, and synopsis, leaving out what's missing", () => {
    expect(
      cardLines(
        scene({
          color: { value: 'blue', span },
          pages: { page: 12, line: 3, eighths: 11 },
          fields: { goal: { body: 'Get the call', span } },
          synopses: [
            { text: 'Margaret waits.', block: 5, span },
            { text: 'A second one.', block: 6, span },
          ],
        }),
      ),
    ).toEqual([
      'Scene 12, INT. KITCHEN - NIGHT',
      'page 12 · 1 3/8 pp · blue',
      'Goal: Get the call',
      'Margaret waits.',
    ]);
    expect(cardLines(scene())).toEqual(['Scene 12, INT. KITCHEN - NIGHT']);
    expect(cardLines(scene({ number: '4A', heading: '', color: { value: 'teal', span } }))).toEqual(
      ['Scene 4A, Untitled scene', 'teal'],
    );
    expect(cardLines(scene({ pages: { page: 2, line: 1, eighths: 1 } }))).toEqual([
      'Scene 12, INT. KITCHEN - NIGHT',
      'page 2 · 1/8 p',
    ]);
  });

  test('the card for a section gives its scenes and length', () => {
    expect(cardLines(section())).toEqual(['Act One', '5 scenes · 12 pp']);
    expect(cardLines(section({ title: '', scenes: 1, eighths: null }))).toEqual([
      'Untitled section',
      '1 scene',
    ]);
    expect(cardLines(section({ scenes: 0, eighths: null }))).toEqual(['Act One', '0 scenes']);
  });

  test("no fill for no color or a word Drafter doesn't know", () => {
    expect(blockFill(null)).toBeNull();
    expect(blockFill('chartreuse')).toBeNull();
    expect(blockFill('blue')).toEqual({
      tint: `color-mix(in srgb, ${SWATCH.blue} 35%, var(--page))`,
      edge: SWATCH.blue,
    });
  });
});
