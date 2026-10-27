import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { CHEAT_SHEET } from '../app/editor/cheat-sheet';
import { CHEAT_SHEET_ANCHORS } from '../app/editor/element-bar';

// The Fountain cheat sheet (/docs/fountain/) teaches by example, so each example is parsed with
// Drafter's own parser: it must read as the elements the sheet says, and print no mark as text.

/** The text a line prints: its runs, with the marks, notes, and boneyard taken out. */
const printed = (line: { inline: Array<{ text: string }> }) =>
  line.inline.map((run) => run.text).join('');

describe('the cheat sheet’s examples', () => {
  for (const entry of CHEAT_SHEET) {
    test(`${entry.name} reads as ${entry.reads.join(', ') || 'no elements'}`, () => {
      const doc = parse(entry.example);
      expect(doc.blocks.map((block) => block.kind)).toEqual(entry.reads);
      for (const block of doc.blocks) {
        for (const line of block.lines) {
          // A mark the parser left in the text would print, and teach the wrong thing.
          expect(printed(line), entry.name).not.toMatch(/^\s*[!@~>.=#]/);
        }
      }
      if (entry.id === 'title-page') expect(doc.titlePage).not.toBeNull();
      if (entry.id === 'drafter-block') expect(doc.meta).not.toBeNull();
    });
  }

  test('has a section for every element the bar can name', () => {
    const ids = new Set(CHEAT_SHEET.map((entry) => entry.id));
    for (const anchor of Object.values(CHEAT_SHEET_ANCHORS)) expect(ids).toContain(anchor);
  });
});
