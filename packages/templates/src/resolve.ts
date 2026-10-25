import type { Block } from '@drafter/fountain';
import type { Role, RoleRule, Template } from './types';

const kindMatches = (rule: RoleRule, kind: string) =>
  rule.kind === '*' ||
  rule.kind === kind ||
  (Array.isArray(rule.kind) && rule.kind.includes(kind as never));

/**
 * The role a block takes in a template (technical design §4.3): the first rule
 * whose kind and conditions match. Page breaks are structural and resolve to
 * `page_break`. `prevRole` is the previous block's role, for `afterRole` rules.
 */
export function resolveRole(template: Template, block: Block, prevRole: Role | null): Role {
  if (block.kind === 'page_break') return 'page_break';
  for (const rule of template.roleMap) {
    if (!kindMatches(rule, block.kind)) continue;
    if (rule.depth !== undefined && !(block.kind === 'section' && block.sem.depth === rule.depth)) {
      continue;
    }
    if (rule.names !== undefined) {
      if (block.kind !== 'character') continue;
      const name = block.sem.name.toUpperCase();
      if (!rule.names.some((n) => n.toUpperCase() === name)) continue;
    }
    if (rule.afterRole !== undefined && prevRole !== rule.afterRole) continue;
    return rule.role === '@kind' ? block.kind : rule.role;
  }
  // Validation guarantees a rule without conditions for every kind.
  throw new Error(`Template "${template.id}" has no role for a ${block.kind} block`);
}
