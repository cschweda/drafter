import { readFileSync } from 'node:fs';
import { type Doc, parse } from '@drafter/fountain';
import { builtins, loadTemplate, type Role, resolveRole, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

/** Each block's kind and resolved role, threading the previous role through. */
function roles(doc: Doc, template: Template): Array<[string, Role]> {
  let prev: Role | null = null;
  return doc.blocks.map((block) => {
    const role = resolveRole(template, block, prev);
    prev = role;
    return [block.kind, role];
  });
}

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;

describe('resolveRole', () => {
  it('us-screenplay: omits structure and notes, and styles everything else by kind', () => {
    const doc = parse(
      '# Act One\n\n= Setup.\n\nINT. KITCHEN - NIGHT\n\n[[A note.]]\n\n/* Cut. */\n\n' +
        'Margaret waits.\n\nMARGARET\n(quietly)\nYou said.\n\n> THE END <\n\n~La la.\n\nCUT TO:\n\n===\n',
    );
    expect(roles(doc, screenplay)).toEqual([
      ['section', 'omit'],
      ['synopsis', 'omit'],
      ['scene_heading', 'scene_heading'],
      ['note', 'omit'],
      ['boneyard', 'omit'],
      ['action', 'action'],
      ['character', 'character'],
      ['parenthetical', 'parenthetical'],
      ['dialogue', 'dialogue'],
      ['centered', 'centered'],
      ['lyric', 'lyric'],
      ['transition', 'transition'],
      ['page_break', 'page_break'],
    ]);
  });

  it('stage play: prints acts and scenes, disables sluglines and transitions', () => {
    const doc = parse(
      '# Act One\n\n## Scene 1\n\n### A beat\n\nA kitchen.\n\nINT. KITCHEN - NIGHT\n\nCUT TO:\n',
    );
    expect(roles(doc, play)).toEqual([
      ['section', 'act_heading'],
      ['section', 'scene_heading_play'],
      ['section', 'omit'],
      ['action', 'stage_direction'],
      ['scene_heading', 'disabled'],
      ['transition', 'disabled'],
    ]);
  });

  it('matches cue names exactly, ignoring case, and follows afterRole', () => {
    const radio = loadTemplate({
      id: 'radio-test',
      name: 'Radio test',
      extends: 'us-screenplay',
      roles: {
        sfx_cue: { indent: 0, width: 60, spaceBefore: 1, case: 'upper' },
        sfx_text: { indent: 10, width: 50, spaceBefore: 0 },
      },
      roleMap: [
        { kind: 'character', names: ['SFX', 'FX'], role: 'sfx_cue' },
        { kind: 'dialogue', afterRole: 'sfx_cue', role: 'sfx_text' },
      ],
    });
    const doc = parse('@Sfx\nThunder.\n\nSFXX\nNot a sound cue.\n\nFX\nRain.\n');
    expect(roles(doc, radio)).toEqual([
      ['character', 'sfx_cue'],
      ['dialogue', 'sfx_text'],
      ['character', 'character'],
      ['dialogue', 'dialogue'],
      ['character', 'sfx_cue'],
      ['dialogue', 'sfx_text'],
    ]);
  });

  it('takes the first matching rule', () => {
    const first = loadTemplate({
      id: 'first',
      name: 'First',
      extends: 'us-screenplay',
      roleMap: [
        { kind: 'action', role: 'centered' },
        { kind: 'action', role: 'transition' },
      ],
    });
    expect(roles(parse('Margaret waits.\n'), first)).toEqual([['action', 'centered']]);
  });
});

describe('built-in templates on the samples', () => {
  const sample = (name: string) =>
    parse(readFileSync(new URL(`../../../samples/${name}.fountain`, import.meta.url), 'utf8'));
  const count = (pairs: Array<[string, Role]>, role: Role) =>
    pairs.filter(([, r]) => r === role).length;

  it('the screenplay sample needs no disabled elements', () => {
    const pairs = roles(sample('screenplay'), screenplay);
    expect(count(pairs, 'disabled')).toBe(0);
    expect(count(pairs, 'scene_heading')).toBe(2);
    expect(count(pairs, 'transition')).toBe(1);
  });

  it('the stage-play sample has one act, two scenes, and no disabled elements', () => {
    const pairs = roles(sample('stage-play'), play);
    expect(count(pairs, 'act_heading')).toBe(1);
    expect(count(pairs, 'scene_heading_play')).toBe(2);
    expect(count(pairs, 'disabled')).toBe(0);
    expect(count(pairs, 'stage_direction')).toBeGreaterThan(0);
  });

  it('are frozen, so no caller can change them for everyone', () => {
    expect(() => {
      (screenplay.roles.action as { width: number }).width = 1;
    }).toThrow(TypeError);
  });
});
