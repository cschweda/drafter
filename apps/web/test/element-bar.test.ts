import { describe, expect, test } from 'vitest';
import { COMMAND_DATA } from '../app/commands/data';
import {
  CHEAT_SHEET_ANCHORS,
  ELEMENT_REASONS,
  FOUNTAIN_BUTTONS,
  FOUNTAIN_MORE,
  hereLabel,
  MARKDOWN_BUTTONS,
  reasonFor,
  tipFor,
} from '../app/editor/element-bar';
import { ELEMENT_NAMES } from '../app/editor/element-names';

// The element bar's buttons (docs/drafter-element-bar-design.md §3, §5): each runs a command the
// palette has, and each says in one sentence what its element is, its mark, and its key.

const all = [...FOUNTAIN_BUTTONS, ...FOUNTAIN_MORE, ...MARKDOWN_BUTTONS];

describe('the element bar', () => {
  test('has the main buttons in the design’s order, then More', () => {
    expect(FOUNTAIN_BUTTONS.map((b) => b.label)).toEqual([
      'Scene',
      'Action',
      'Character',
      'Dialogue',
      'Parenthetical',
      'Transition',
    ]);
    expect(FOUNTAIN_MORE.map((b) => b.label)).toEqual([
      'Centered',
      'Lyric',
      'Dual dialogue',
      'Note',
      'Boneyard',
      'Section',
      'Synopsis',
      'Page break',
      'Bold',
      'Italic',
      'Underline',
    ]);
    expect(MARKDOWN_BUTTONS.map((b) => b.label)).toEqual([
      'Heading',
      'Bold',
      'Italic',
      'List',
      'Numbered',
      'Quote',
      'Link',
      'Code',
    ]);
  });

  test('runs only commands the palette has, and takes each command’s keys from it', () => {
    for (const button of all) {
      const command = COMMAND_DATA.find((c) => c.id === button.command);
      expect(command, button.label).toBeDefined();
      // A tooltip that names a key names the one in the data: the forcing key, for an element.
      if (button.tip.includes('{key}'))
        expect(tipFor(button, false), button.label).toMatch(/Ctrl\+/);
    }
  });

  test('writes the keys for the reader’s keyboard', () => {
    const character = FOUNTAIN_BUTTONS.find((b) => b.label === 'Character');
    if (!character) throw new Error('no Character button');
    expect(tipFor(character, false)).toBe(
      'A name in capitals on its own line, after a blank line, with dialogue under it. Drafter adds @ only when capitals alone won’t do; Ctrl+Alt+3 always adds it.',
    );
    expect(tipFor(character, true)).toContain('⌘⌥3 always adds it');
    for (const button of all) expect(tipFor(button, false), button.label).not.toContain('{key}');
  });

  test('has a reason and a cheat-sheet section for every element', () => {
    for (const kind of Object.keys(ELEMENT_NAMES) as Array<keyof typeof ELEMENT_NAMES>) {
      expect(ELEMENT_REASONS[kind].plain, kind).toBeTruthy();
      expect(CHEAT_SHEET_ANCHORS[kind], kind).toMatch(/^[a-z-]+$/);
    }
  });

  test('says why a line is its element, a forcing mark first', () => {
    expect(reasonFor('character', false)).toBe(
      'a name in capitals after a blank line, with dialogue under it',
    );
    expect(reasonFor('character', true)).toBe('forced by the @ at its start');
    expect(reasonFor('dialogue', true)).toBe('the lines just under a character name');
    expect(reasonFor(null, false)).toBe('a blank line, which separates one element from the next');
  });

  test('names where the cursor is', () => {
    expect(hereLabel('Dialogue')).toBe('You’re in: Dialogue');
    expect(hereLabel(null)).toBe('You’re on a blank line');
  });
});
