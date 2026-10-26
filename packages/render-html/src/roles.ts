import type { Role, RoleRule, Template } from '@drafter/templates';

/** The roles a template's blocks take in a speech. */
export interface SpeechRoles {
  /** Roles of `character` blocks, which open a speech. */
  cue: ReadonlySet<Role>;
  /** Roles of `parenthetical`, `dialogue`, and `lyric` blocks, which carry on from a cue. */
  speech: ReadonlySet<Role>;
}

const CUE_KINDS = ['character'];
const SPEECH_KINDS = ['parenthetical', 'dialogue', 'lyric'];

/** Not roles: a block with `omit` prints nothing, and one with `disabled` prints as action. */
const NOT_ROLES = new Set(['omit', 'disabled']);

const covers = (rule: RoleRule, kind: string) =>
  (Array.isArray(rule.kind) ? rule.kind : [rule.kind]).some((k) => k === '*' || k === kind);

/** Every role a rule gives to one of these kinds of block, whatever else the rule asks for. */
function rolesOf(template: Template, kinds: readonly string[]): Set<Role> {
  const roles = new Set<Role>();
  for (const rule of template.roleMap) {
    if (NOT_ROLES.has(rule.role)) continue;
    for (const kind of kinds) {
      if (covers(rule, kind)) roles.add(rule.role === '@kind' ? kind : rule.role);
    }
  }
  return roles;
}

/**
 * The roles that make up a speech, read from the template's role map: the
 * roles a rule gives to `character` blocks are cues, and the roles it gives to
 * `parenthetical`, `dialogue`, and `lyric` blocks are what a cue's speech is
 * made of. A rule counts whatever conditions it has (`names`, `afterRole`), so
 * a template that gives a sound cue a role of its own is covered.
 */
export function speechRoles(template: Template): SpeechRoles {
  return { cue: rolesOf(template, CUE_KINDS), speech: rolesOf(template, SPEECH_KINDS) };
}
