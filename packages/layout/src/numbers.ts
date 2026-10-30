import type { Block, Doc } from '@drafter/fountain';
import { type Role, resolveRole, type Template } from '@drafter/templates';
import type { SceneNumbering } from './types';

/** Each block's role in `template`, in order: what `paginate` lays each one out as. */
export function rolesOf(blocks: readonly Block[], template: Template): Role[] {
  const roles: Role[] = [];
  for (const block of blocks) roles.push(resolveRole(template, block, roles.at(-1) ?? null));
  return roles;
}

/**
 * The numbers for `blocks` whose roles are `roles`: a scene heading that prints as one (not left
 * out, and not disabled by the template) counts, and keeps a written number (`#12A#`) under
 * `'all'`, so two scenes can share one.
 */
export function numbersOf(
  blocks: readonly Block[],
  roles: readonly Role[],
  numbering: SceneNumbering,
): Map<number, string> {
  const numbers = new Map<number, string>();
  if (numbering === 'none') return numbers;
  let scene = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Block;
    const role = roles[i];
    if (block.kind !== 'scene_heading') continue;
    if (role === 'omit' || role === 'page_break' || role === 'disabled') continue;
    scene++;
    const number = numbering === 'all' ? (block.sem.number ?? String(scene)) : block.sem.number;
    if (number !== null) numbers.set(i, number);
  }
  return numbers;
}

/** Each printed scene heading's number, by block index, for the option: what paginate prints, exactly. */
export function sceneNumbersFor(
  doc: Doc,
  template: Template,
  numbering: SceneNumbering,
): Map<number, string> {
  return numbersOf(doc.blocks, rolesOf(doc.blocks, template), numbering);
}
