import type { ClassicElement, ClassicKind } from '@drafter/cm-fountain';
import { SCREENPLAY_STRUCTURE, structureOf } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { elementRowShown, keyLine, nextLabel } from '../app/editor/classic-key-line';

// The status bar's key line (Classic Mode design §9.3): what Enter and Tab do here, in words.

const play = structureOf(builtins['stage-play-standard'] as Template);

const at = (
  kind: ClassicElement['kind'],
  enter: ClassicKind | 'chooser' | null,
  tab: ClassicKind | null,
  pending = false,
): ClassicElement => ({ kind, pending, soft: false, enter, tab });

describe('the key line', () => {
  test.each([
    [at('scene_heading', 'action', 'action'), 'Enter: Action · Tab: Action'],
    [at('action', 'action', 'character'), 'Enter: Action · Tab: Character'],
    [at('character', 'dialogue', 'dialogue'), 'Enter: Dialogue · Tab: Dialogue'],
    [at('parenthetical', 'dialogue', 'dialogue'), 'Enter: Dialogue · Tab: Dialogue'],
    [at('dialogue', 'character', 'parenthetical'), 'Enter: Character · Tab: Parenthetical'],
    [at('dialogue', 'dialogue', 'parenthetical'), 'Enter: Dialogue · Tab: Parenthetical'],
    [at('transition', 'action', 'action'), 'Enter: Action · Tab: Action'],
    [at('centered', 'action', 'action'), 'Enter: Action · Tab: Action'],
    [at('lyric', 'lyric', 'dialogue'), 'Enter: Lyric · Tab: Dialogue'],
    [at('section', 'action', 'action'), 'Enter: Action · Tab: Action'],
    [at('synopsis', 'action', 'action'), 'Enter: Action · Tab: Action'],
    [at('action', 'chooser', 'character', true), 'Enter: Choose an element · Tab: Character'],
    [at('scene_heading', 'chooser', 'action', true), 'Enter: Choose an element · Tab: Action'],
    [
      at('dialogue', 'chooser', 'parenthetical', true),
      'Enter: Choose an element · Tab: Parenthetical',
    ],
  ])('in a screenplay, %o', (element, words) => {
    expect(keyLine(element, SCREENPLAY_STRUCTURE)).toBe(words);
  });

  test.each([
    [at('act', 'scene_heading', 'scene_heading'), 'Enter: Scene · Tab: Scene'],
    [at('scene_heading', 'action', 'action'), 'Enter: Stage direction · Tab: Stage direction'],
    [at('action', 'action', 'character'), 'Enter: Stage direction · Tab: Character'],
    [at('character', 'chooser', 'act', true), 'Enter: Choose an element · Tab: Act'],
  ])('in a stage play, %o', (element, words) => {
    expect(keyLine(element, play)).toBe(words);
  });

  test('is empty with no element, and where no key acts', () => {
    expect(keyLine(null, SCREENPLAY_STRUCTURE)).toBe('');
    expect(keyLine(at('title_page', null, null), SCREENPLAY_STRUCTURE)).toBe('');
    expect(keyLine(at('note', null, null), SCREENPLAY_STRUCTURE)).toBe('');
  });
});

describe('the Next button (§10)', () => {
  test('names where Tab goes', () => {
    expect(nextLabel(at('action', 'action', 'character'), SCREENPLAY_STRUCTURE)).toBe(
      'Next: Character',
    );
    expect(nextLabel(at('character', 'dialogue', 'dialogue'), SCREENPLAY_STRUCTURE)).toBe(
      'Next: Dialogue',
    );
    expect(nextLabel(at('action', 'chooser', 'character', true), play)).toBe('Next: Character');
    expect(nextLabel(at('character', 'chooser', 'act', true), play)).toBe('Next: Act');
    expect(nextLabel(at('act', 'scene_heading', 'scene_heading'), play)).toBe('Next: Scene');
  });

  test('is a plain Next where Tab goes nowhere', () => {
    expect(nextLabel(null, SCREENPLAY_STRUCTURE)).toBe('Next');
    expect(nextLabel(at('note', null, null), SCREENPLAY_STRUCTURE)).toBe('Next');
  });
});

describe('the element row shows', () => {
  const row = (over: Partial<Parameters<typeof elementRowShown>[0]> = {}) =>
    elementRowShown({
      setting: true,
      focus: false,
      readOnly: false,
      classicKeyboard: false,
      ...over,
    });

  test('as before, outside Classic Mode with a keyboard up', () => {
    expect(row()).toBe(true);
    expect(row({ setting: false })).toBe(false);
    expect(row({ focus: true })).toBe(false);
    expect(row({ readOnly: true })).toBe(false);
  });

  test('in Classic Mode with a phone’s keyboard up, whatever the setting, and in focus mode', () => {
    expect(row({ classicKeyboard: true, setting: false })).toBe(true);
    expect(row({ classicKeyboard: true, focus: true })).toBe(true);
    expect(row({ classicKeyboard: true, setting: false, focus: true })).toBe(true);
    // A script that can't be changed gives Tab back, and has no row.
    expect(row({ classicKeyboard: true, readOnly: true })).toBe(false);
  });
});
