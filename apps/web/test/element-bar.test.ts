import { SCREENPLAY_STRUCTURE, structureOf } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { COMMAND_DATA } from '../app/commands/data';
import {
  barFor,
  CHEAT_SHEET_ANCHORS,
  currentOf,
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
      'Setup',
      'Payoff',
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

  test('has Setup and Payoff in More, after Note', () => {
    const labels = FOUNTAIN_MORE.map((b) => b.label);
    expect(labels.slice(labels.indexOf('Note'), labels.indexOf('Note') + 3)).toEqual([
      'Note',
      'Setup',
      'Payoff',
    ]);
    expect(FOUNTAIN_MORE.find((b) => b.label === 'Setup')).toMatchObject({
      mark: '[[Setup: ]]',
      command: 'mark-setup',
    });
    expect(FOUNTAIN_MORE.find((b) => b.label === 'Payoff')).toMatchObject({
      mark: '[[Payoff: ]]',
      command: 'mark-payoff',
    });
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
      'A name in capitals on its own line, after a blank line, with dialogue under it. Drafter adds @ only when capitals alone won’t do. Shortcut: Ctrl+Alt+3.',
    );
    expect(tipFor(character, true)).toContain('Shortcut: ⌘⌥3.');
    for (const button of all) expect(tipFor(button, false), button.label).not.toContain('{key}');
  });

  test('has a reason and a cheat-sheet section for every element', () => {
    for (const kind of Object.keys(ELEMENT_NAMES) as Array<keyof typeof ELEMENT_NAMES>) {
      expect(ELEMENT_REASONS[kind].plain, kind).toBeTruthy();
      expect(CHEAT_SHEET_ANCHORS[kind], kind).toMatch(/^[a-z-]+$/);
    }
  });

  test('puts Mod-Alt-1 to 7 on the element commands, and no key on the forcing ones', () => {
    const keyOf = (id: string) => COMMAND_DATA.find((c) => c.id === id)?.keys;
    expect(keyOf('element-scene-heading')).toBe('Mod-Alt-1');
    expect(keyOf('element-character')).toBe('Mod-Alt-3');
    expect(keyOf('element-lyric')).toBe('Mod-Alt-7');
    expect(keyOf('make-character')).toBeUndefined();
  });

  test('says why a line is its element, a forcing mark first', () => {
    expect(reasonFor('character', false)).toBe(
      'a name in capitals after a blank line, with dialogue under it',
    );
    expect(reasonFor('character', true)).toBe('forced by the @ at its start');
    expect(reasonFor('dialogue', true)).toBe('the lines just under a character name');
    expect(reasonFor(null, false)).toBe('a blank line, which separates one element from the next');
    // A name with no speech yet, and the empty line under a name.
    expect(reasonFor('character', false, 'name')).toBe(
      'a name in capitals after a blank line: its dialogue goes on the line under it',
    );
    expect(reasonFor(null, false, 'speech')).toBe(
      'the line under a character name: what you type here is their dialogue',
    );
  });

  test('names where the cursor is', () => {
    expect(hereLabel('Dialogue')).toBe('You’re in: Dialogue');
    expect(hereLabel(null)).toBe('You’re on a blank line');
  });
});

describe('the bar on a stage play', () => {
  const play = structureOf(builtins['stage-play-standard'] as Template);

  test('offers acts, scenes, and stage directions, and no transition or INT.', () => {
    const { buttons, more } = barFor(play);
    expect(buttons.map((b) => [b.label, b.mark])).toEqual([
      ['Act', '#'],
      ['Scene', '##'],
      ['Stage direction', '!'],
      ['Character', '@'],
      ['Dialogue', ''],
      ['Parenthetical', '( )'],
    ]);
    expect(buttons.find((b) => b.label === 'Scene')?.command).toBe('element-scene-heading');
    expect(buttons.find((b) => b.label === 'Stage direction')?.command).toBe('element-action');
    expect([...buttons, ...more].some((b) => b.command === 'element-transition')).toBe(false);
    expect(barFor(SCREENPLAY_STRUCTURE).buttons).toBe(FOUNTAIN_BUTTONS);
  });

  test('names a line by its role in the template', () => {
    expect(currentOf('section', 'act_heading')).toMatchObject({
      name: 'Act',
      command: 'element-act',
      anchor: 'act',
    });
    expect(currentOf('section', 'scene_heading_play')).toMatchObject({
      name: 'Scene',
      command: 'element-scene-heading',
      anchor: 'scene',
    });
    expect(currentOf('action', 'stage_direction')).toMatchObject({
      name: 'Stage direction',
      command: 'element-action',
      anchor: 'stage-direction',
    });
    expect(currentOf('section', 'omit')).toMatchObject({
      name: 'Section',
      command: 'element-section',
    });
    expect(currentOf('dialogue', 'dialogue')).toMatchObject({ name: 'Dialogue' });
    expect(currentOf(null, null)).toMatchObject({ name: null, command: null });
    expect(reasonFor('section', false, undefined, 'scene_heading_play')).toBe(
      'a line starting with ## in a stage play',
    );
  });
});
