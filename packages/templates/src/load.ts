import type { Template } from './types';
import { isPlainObject, validate } from './validate';

/** Thrown when a template is invalid; `problems` lists every problem found. */
export class TemplateError extends Error {
  readonly problems: string[];

  constructor(problems: string[], id?: string) {
    const subject = id ? `Template "${id}"` : 'The template';
    super(`${subject} is invalid:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    this.name = 'TemplateError';
    this.problems = problems;
  }
}

type Obj = Record<string, unknown>;

/**
 * Loads one template: resolves `extends` against `registry`, converts inch
 * values, and validates the result. Throws `TemplateError` listing every
 * problem; never returns a partly valid template. Doesn't modify its inputs.
 */
export function load(json: unknown, registry: ReadonlyMap<string, Template>): Template {
  if (!isPlainObject(json)) throw new TemplateError(['A template must be a JSON object']);
  const id = typeof json.id === 'string' ? json.id : undefined;
  let merged: Obj = structuredClone(json);
  if (json.extends !== undefined) {
    if (typeof json.extends !== 'string') {
      throw new TemplateError(['extends must be the id of another template'], id);
    }
    if (json.extends === json.id) throw new TemplateError([`"${id}" extends itself`], id);
    const parent = registry.get(json.extends);
    if (!parent) {
      throw new TemplateError([`extends "${json.extends}", which isn't loaded`], id);
    }
    merged = mergeTemplate(structuredClone(parent) as unknown as Obj, merged);
  }
  const problems: string[] = [];
  convertInches(merged, problems);
  // One at a time: a hostile template can have too many problems to spread into a call.
  for (const problem of validate(merged)) problems.push(problem);
  if (problems.length > 0) throw new TemplateError(problems, id);
  return { ...merged, keepWithNextLines: merged.keepWithNextLines ?? 2 } as Template;
}

/**
 * Loads a set of templates that may extend one another or `registry`, in
 * dependency order, and returns them in input order. Throws one
 * `TemplateError` for every problem in the set, including `extends` cycles,
 * and then loads none of them.
 */
export function loadSet(
  jsons: readonly unknown[],
  registry: ReadonlyMap<string, Template>,
): Template[] {
  const problems = new Set<string>();
  const byId = new Map<string, Obj>();
  jsons.forEach((json, i) => {
    if (!isPlainObject(json) || typeof json.id !== 'string') {
      problems.add(`template ${i + 1}: a template must be a JSON object with an id`);
    } else if (byId.has(json.id)) {
      problems.add(`two templates share the id "${json.id}"`);
    } else {
      byId.set(json.id, json);
    }
  });

  const loaded = new Map<string, Template>();
  const failed = new Set<string>();
  const inCycle = new Set<string>();
  const visiting: string[] = [];
  const fail = (id: string) => {
    failed.add(id);
    return null;
  };
  const resolve = (id: string): Template | null => {
    const done = loaded.get(id);
    if (done) return done;
    if (failed.has(id)) return null;
    const json = byId.get(id) as Obj;
    const parentId = json.extends;
    visiting.push(id);
    try {
      if (typeof parentId === 'string' && parentId !== id && byId.has(parentId)) {
        if (visiting.includes(parentId)) {
          const cycle = visiting.slice(visiting.indexOf(parentId));
          problems.add(`extends cycle: ${[...cycle, parentId].join(' → ')}`);
          for (const member of cycle) {
            inCycle.add(member);
            failed.add(member);
          }
          return null;
        }
        if (!resolve(parentId)) {
          if (!inCycle.has(id)) problems.add(`${id}: extends "${parentId}", which failed to load`);
          return fail(id);
        }
      }
      const template = load(json, new Map([...registry, ...loaded]));
      loaded.set(id, template);
      return template;
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      for (const p of error.problems) problems.add(`${id}: ${p}`);
      return fail(id);
    } finally {
      visiting.pop();
    }
  };
  for (const id of byId.keys()) resolve(id);

  if (problems.size > 0) throw new TemplateError([...problems]);
  return [...byId.keys()].map((id) => loaded.get(id) as Template);
}

/** Objects merge key by key, the child's role rules come first, other arrays replace. */
function mergeTemplate(parent: Obj, child: Obj): Obj {
  const merged = mergeObjects(parent, child);
  if (Array.isArray(child.roleMap) && Array.isArray(parent.roleMap)) {
    merged.roleMap = [...child.roleMap, ...parent.roleMap];
  }
  return merged;
}

function mergeObjects(parent: Obj, child: Obj): Obj {
  const out: Obj = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    const base = out[key];
    out[key] =
      isPlainObject(base) && isPlainObject(value) && !isInches(value)
        ? mergeObjects(base, value)
        : value;
  }
  return out;
}

// --- Inches: 10 characters per inch across, 6 lines per inch down (12 pt Courier) ---

type Axis = 'across' | 'down';
const PER_INCH: Record<Axis, number> = { across: 10, down: 6 };

const isInches = (v: unknown): v is { in: number } =>
  isPlainObject(v) &&
  Object.keys(v).length === 1 &&
  typeof v.in === 'number' &&
  Number.isFinite(v.in);

function convertInches(t: Obj, problems: string[]): void {
  const at = (obj: unknown, key: string, axis: Axis, path: string) => {
    if (!isPlainObject(obj) || !isInches(obj[key])) return;
    const inches = obj[key].in;
    const value = inches * PER_INCH[axis];
    if (!Number.isInteger(value)) {
      const unit = axis === 'across' ? 'characters' : 'lines';
      problems.push(`${path}: ${inches} in is ${value} ${unit}, which isn't a whole number`);
    }
    // Rounded so the problem above is the only one reported for this field.
    obj[key] = Math.round(value);
  };
  const page = t.page;
  if (isPlainObject(page)) {
    at(page, 'width', 'across', 'page.width');
    at(page, 'height', 'down', 'page.height');
    const margin = page.margin;
    at(margin, 'left', 'across', 'page.margin.left');
    at(margin, 'right', 'across', 'page.margin.right');
    at(margin, 'top', 'down', 'page.margin.top');
    at(margin, 'bottom', 'down', 'page.margin.bottom');
    at(page.numbering, 'line', 'down', 'page.numbering.line');
  }
  if (isPlainObject(t.roles)) {
    for (const [name, style] of Object.entries(t.roles)) {
      at(style, 'indent', 'across', `roles.${name}.indent`);
      at(style, 'width', 'across', `roles.${name}.width`);
      at(style, 'spaceBefore', 'down', `roles.${name}.spaceBefore`);
      at(style, 'spaceAfter', 'down', `roles.${name}.spaceAfter`);
    }
  }
  at(t.dialogueSplit, 'moreIndent', 'across', 'dialogueSplit.moreIndent');
  const dual = t.dual;
  if (isPlainObject(dual)) {
    at(dual, 'gap', 'across', 'dual.gap');
    at(dual, 'width', 'across', 'dual.width');
    for (const key of ['character', 'parenthetical', 'dialogue']) {
      at(dual.indent, key, 'across', `dual.indent.${key}`);
    }
  }
  at(t.sceneNumbers, 'left', 'across', 'sceneNumbers.left');
  at(t.sceneNumbers, 'right', 'across', 'sceneNumbers.right');
}
