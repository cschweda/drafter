import { builtinRegistry } from './builtins';
import { load, loadSet } from './load';
import type { Template } from './types';

export { builtins } from './builtins';
export { TemplateError } from './load';
export { resolveRole } from './resolve';
export type { Paper, Role, RoleRule, RoleStyle, Template } from './types';
export { CHAR_WIDTH_PT, LINE_HEIGHT_PT, PAPER_POINTS } from './types';

/**
 * Loads one template: resolves `extends` (against the built-ins by default),
 * converts `{ "in": n }` values to characters and lines, and validates. Throws
 * `TemplateError` listing every problem.
 */
export function loadTemplate(
  json: unknown,
  registry: ReadonlyMap<string, Template> = builtinRegistry,
): Template {
  return load(json, registry);
}

/**
 * Loads templates that may extend one another, in dependency order. Throws one
 * `TemplateError` for the whole set, and then loads none of them.
 */
export function loadTemplates(
  jsons: readonly unknown[],
  registry: ReadonlyMap<string, Template> = builtinRegistry,
): Template[] {
  return loadSet(jsons, registry);
}
