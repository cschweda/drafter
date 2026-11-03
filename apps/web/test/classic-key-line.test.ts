import type { ClassicElement, ClassicKind } from '@drafter/cm-fountain';
import { SCREENPLAY_STRUCTURE, structureOf } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { keyLine } from '../app/editor/classic-key-line';

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
