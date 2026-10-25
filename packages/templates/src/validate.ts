import type { BlockKind } from '@drafter/fountain';
import { CHAR_WIDTH_PT, LINE_HEIGHT_PT, PAPER_POINTS, type Paper } from './types';

export const BLOCK_KINDS: readonly BlockKind[] = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'centered',
  'lyric',
  'section',
  'synopsis',
  'note',
  'boneyard',
  'page_break',
];
const KINDS = new Set<string>(BLOCK_KINDS);

/** Roles a rule may produce without a style: `omit`, `disabled`, and `@kind` (resolved per kind). */
export const RESERVED_ROLES = new Set(['omit', 'disabled']);

type Obj = Record<string, unknown>;

export const isPlainObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function describe(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (Array.isArray(v)) return 'a list';
  if (isPlainObject(v)) return 'an object';
  return JSON.stringify(v);
}

/** Collects every problem in a template, each prefixed with the path to the field. */
class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path} ${message}`);
  }

  object(parent: Obj, key: string, path: string, allowed: string[]): Obj | null {
    const value = parent[key];
    if (value === undefined) {
      this.fail(path, 'is required');
      return null;
    }
    if (!isPlainObject(value)) {
      this.fail(path, `must be an object (got ${describe(value)})`);
      return null;
    }
    for (const field of Object.keys(value)) {
      if (!allowed.includes(field)) this.fail(`${path}.${field}`, 'is an unknown field');
    }
    return value;
  }

  int(parent: Obj, key: string, path: string, min: number, optional = false): number | null {
    const value = parent[key];
    if (value === undefined && optional) return null;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.fail(path, `must be a whole number (got ${describe(value)})`);
      return null;
    }
    if (value < min) {
      this.fail(path, `must be at least ${min} (got ${value})`);
      return null;
    }
    return value;
  }

  string(parent: Obj, key: string, path: string, optional = false): string | null {
    const value = parent[key];
    if (value === undefined && optional) return null;
    if (typeof value !== 'string' || value === '') {
      this.fail(path, `must be a non-empty string (got ${describe(value)})`);
      return null;
    }
    return value;
  }

  boolean(parent: Obj, key: string, path: string, optional = false): void {
    const value = parent[key];
    if (value === undefined && optional) return;
    if (typeof value !== 'boolean')
      this.fail(path, `must be true or false (got ${describe(value)})`);
  }

  oneOf<T>(
    parent: Obj,
    key: string,
    path: string,
    options: readonly T[],
    optional = false,
  ): T | null {
    const value = parent[key];
    if (value === undefined && optional) return null;
    if (!options.includes(value as T)) {
      this.fail(path, `must be one of ${options.join(', ')} (got ${describe(value)})`);
      return null;
    }
    return value as T;
  }

  stringList(parent: Obj, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v === '')) {
      this.fail(path, 'must be a list of non-empty strings');
    }
  }
}

const ROLE_STYLE_FIELDS = [
  'indent',
  'width',
  'align',
  'case',
  'spaceBefore',
  'spaceAfter',
  'keepWithNext',
  'keepTogether',
  'lineSpacing',
  'prefix',
  'suffix',
  'style',
];

/** Every problem in a template whose inch values are already converted. Empty means valid. */
export function validate(t: Obj): string[] {
  const c = new Checker();
  for (const field of Object.keys(t)) {
    const known = [
      'id',
      'name',
      'extends',
      'page',
      'roles',
      'roleMap',
      'keepWithNextLines',
      'dialogueSplit',
      'dual',
      'sceneNumbers',
      'titlePage',
      'lint',
    ];
    if (!known.includes(field)) c.fail(field, 'is an unknown field');
  }
  c.string(t, 'id', 'id');
  c.string(t, 'name', 'name');
  c.string(t, 'extends', 'extends', true);

  // Page: the character grid must fit the paper, and the margins must leave room.
  let column: number | null = null;
  let pageWidth: number | null = null;
  let marginLeft: number | null = null;
  let marginTop: number | null = null;
  const page = c.object(t, 'page', 'page', [
    'paper',
    'width',
    'height',
    'margin',
    'font',
    'numbering',
    'header',
    'footer',
  ]);
  if (page) {
    const paper = c.oneOf<Paper>(page, 'paper', 'page.paper', ['letter', 'a4']);
    pageWidth = c.int(page, 'width', 'page.width', 1);
    const height = c.int(page, 'height', 'page.height', 1);
    if (paper) {
      const maxWidth = Math.floor(PAPER_POINTS[paper].width / CHAR_WIDTH_PT);
      const maxHeight = Math.floor(PAPER_POINTS[paper].height / LINE_HEIGHT_PT);
      if (pageWidth !== null && pageWidth > maxWidth) {
        c.fail(
          'page.width',
          `${pageWidth} is wider than ${paper} paper allows (${maxWidth} characters)`,
        );
      }
      if (height !== null && height > maxHeight) {
        c.fail(
          'page.height',
          `${height} is taller than ${paper} paper allows (${maxHeight} lines)`,
        );
      }
    }
    const margin = c.object(page, 'margin', 'page.margin', ['top', 'bottom', 'left', 'right']);
    if (margin) {
      marginTop = c.int(margin, 'top', 'page.margin.top', 0);
      const bottom = c.int(margin, 'bottom', 'page.margin.bottom', 0);
      marginLeft = c.int(margin, 'left', 'page.margin.left', 0);
      const right = c.int(margin, 'right', 'page.margin.right', 0);
      if (pageWidth !== null && marginLeft !== null && right !== null) {
        column = pageWidth - marginLeft - right;
        if (column < 1) c.fail('page.margin', 'leaves no room for text across the page');
      }
      if (
        height !== null &&
        marginTop !== null &&
        bottom !== null &&
        height - marginTop - bottom < 1
      ) {
        c.fail('page.margin', 'leaves no room for text down the page');
      }
    }
    const font = c.object(page, 'font', 'page.font', ['family', 'monospace', 'pt']);
    if (font) {
      c.string(font, 'family', 'page.font.family');
      c.boolean(font, 'monospace', 'page.font.monospace');
      if (typeof font.pt !== 'number' || !(font.pt > 0)) {
        c.fail('page.font.pt', `must be a positive number (got ${describe(font.pt)})`);
      }
    }
    const numbering = c.object(page, 'numbering', 'page.numbering', [
      'position',
      'line',
      'firstNumbered',
      'format',
    ]);
    if (numbering) {
      const position = c.oneOf(numbering, 'position', 'page.numbering.position', [
        'top-right',
        'none',
      ]);
      const line = c.int(numbering, 'line', 'page.numbering.line', 0);
      if (position === 'top-right' && line !== null && marginTop !== null && line >= marginTop) {
        c.fail('page.numbering.line', `${line} is outside the ${marginTop}-line top margin`);
      }
      c.int(numbering, 'firstNumbered', 'page.numbering.firstNumbered', 1);
      const format = c.string(numbering, 'format', 'page.numbering.format');
      if (format !== null && !format.includes('{n}')) {
        c.fail('page.numbering.format', 'must contain {n}, where the page number goes');
      }
    }
    c.string(page, 'header', 'page.header', true);
    c.string(page, 'footer', 'page.footer', true);
  }

  // Roles: each style must fit the text column.
  const roleNames = new Set<string>();
  const roles = c.object(t, 'roles', 'roles', Object.keys(isPlainObject(t.roles) ? t.roles : {}));
  if (roles) {
    for (const name of Object.keys(roles)) {
      const path = `roles.${name}`;
      if (RESERVED_ROLES.has(name) || name === '@kind') {
        c.fail(path, `is reserved and can't have a style`);
        continue;
      }
      const style = c.object(roles, name, path, ROLE_STYLE_FIELDS);
      if (!style) continue;
      roleNames.add(name);
      const indent = c.int(style, 'indent', `${path}.indent`, 0);
      const width = c.int(style, 'width', `${path}.width`, 1);
      if (indent !== null && width !== null && column !== null && indent + width > column) {
        c.fail(
          path,
          `has indent plus width of ${indent + width}, wider than the ${column}-character text column`,
        );
      }
      c.oneOf(style, 'align', `${path}.align`, ['left', 'center', 'right'], true);
      c.oneOf(style, 'case', `${path}.case`, ['upper', 'as-is'], true);
      c.int(style, 'spaceBefore', `${path}.spaceBefore`, 0);
      c.int(style, 'spaceAfter', `${path}.spaceAfter`, 0, true);
      c.boolean(style, 'keepWithNext', `${path}.keepWithNext`, true);
      c.boolean(style, 'keepTogether', `${path}.keepTogether`, true);
      c.oneOf(style, 'lineSpacing', `${path}.lineSpacing`, [1, 2], true);
      c.string(style, 'prefix', `${path}.prefix`, true);
      c.string(style, 'suffix', `${path}.suffix`, true);
      if (style.style !== undefined) {
        const s = c.object(style, 'style', `${path}.style`, ['bold', 'italic', 'underline']);
        if (s) {
          c.boolean(s, 'bold', `${path}.style.bold`, true);
          c.boolean(s, 'italic', `${path}.style.italic`, true);
          c.boolean(s, 'underline', `${path}.style.underline`, true);
        }
      }
    }
  }

  checkRoleMap(c, t.roleMap, roleNames, roles !== null);

  c.int(t, 'keepWithNextLines', 'keepWithNextLines', 1, true);

  const split = c.object(t, 'dialogueSplit', 'dialogueSplit', [
    'more',
    'contd',
    'moreIndent',
    'minLinesBefore',
    'minLinesAfter',
    'contdAfterAction',
  ]);
  if (split) {
    c.string(split, 'more', 'dialogueSplit.more');
    c.string(split, 'contd', 'dialogueSplit.contd');
    const moreIndent = c.int(split, 'moreIndent', 'dialogueSplit.moreIndent', 0);
    if (moreIndent !== null && column !== null && moreIndent >= column) {
      c.fail(
        'dialogueSplit.moreIndent',
        `${moreIndent} is outside the ${column}-character text column`,
      );
    }
    c.int(split, 'minLinesBefore', 'dialogueSplit.minLinesBefore', 1);
    c.int(split, 'minLinesAfter', 'dialogueSplit.minLinesAfter', 1);
    c.boolean(split, 'contdAfterAction', 'dialogueSplit.contdAfterAction');
  }

  const dual = c.object(t, 'dual', 'dual', ['gap', 'width', 'indent']);
  if (dual) {
    const gap = c.int(dual, 'gap', 'dual.gap', 0);
    const width = c.int(dual, 'width', 'dual.width', 1);
    if (gap !== null && width !== null && column !== null && 2 * width + gap > column) {
      c.fail(
        'dual',
        `needs ${2 * width + gap} characters for two columns and the gap, more than the ${column}-character text column`,
      );
    }
    const indent = c.object(dual, 'indent', 'dual.indent', [
      'character',
      'parenthetical',
      'dialogue',
    ]);
    if (indent) {
      for (const key of ['character', 'parenthetical', 'dialogue']) {
        const value = c.int(indent, key, `dual.indent.${key}`, 0);
        if (value !== null && width !== null && value >= width) {
          c.fail(`dual.indent.${key}`, `${value} is outside the ${width}-character column`);
        }
      }
    }
  }

  const numbers = c.object(t, 'sceneNumbers', 'sceneNumbers', ['enabled', 'left', 'right']);
  if (numbers) {
    c.boolean(numbers, 'enabled', 'sceneNumbers.enabled');
    const left = c.int(numbers, 'left', 'sceneNumbers.left', -Infinity);
    const right = c.int(numbers, 'right', 'sceneNumbers.right', -Infinity);
    if (left !== null && marginLeft !== null && marginLeft + left < 0) {
      c.fail('sceneNumbers.left', `${left} puts scene numbers off the left edge of the page`);
    }
    if (
      right !== null &&
      marginLeft !== null &&
      pageWidth !== null &&
      marginLeft + right >= pageWidth
    ) {
      c.fail('sceneNumbers.right', `${right} puts scene numbers off the right edge of the page`);
    }
  }

  const titlePage = c.object(t, 'titlePage', 'titlePage', ['layout']);
  if (titlePage) c.oneOf(titlePage, 'layout', 'titlePage.layout', ['centered-feature']);

  if (t.lint !== undefined) {
    const lint = c.object(t, 'lint', 'lint', ['enable', 'disable', 'options']);
    if (lint) {
      c.stringList(lint, 'enable', 'lint.enable');
      c.stringList(lint, 'disable', 'lint.disable');
      if (lint.options !== undefined && !isPlainObject(lint.options)) {
        c.fail('lint.options', `must be an object (got ${describe(lint.options)})`);
      }
    }
  }

  return c.problems;
}

/**
 * Checks each rule, then that every kind reaches a role: every role a rule
 * names has a style, and every kind meets a rule without conditions.
 */
function checkRoleMap(
  c: Checker,
  value: unknown,
  roleNames: Set<string>,
  rolesValid: boolean,
): void {
  if (value === undefined) {
    c.fail('roleMap', 'is required');
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    c.fail('roleMap', `must be a non-empty list of rules (got ${describe(value)})`);
    return;
  }
  const rules: Array<{ kinds: Set<string> | '*'; conditional: boolean; role: string } | null> = [];
  value.forEach((rule: unknown, i: number) => {
    const path = `roleMap[${i}]`;
    if (!isPlainObject(rule)) {
      c.fail(path, `must be an object (got ${describe(rule)})`);
      rules.push(null);
      return;
    }
    let ok = true;
    for (const field of Object.keys(rule)) {
      if (!['kind', 'depth', 'names', 'afterRole', 'role'].includes(field)) {
        c.fail(`${path}.${field}`, 'is an unknown field');
        ok = false;
      }
    }
    let kinds: Set<string> | '*' | null = null;
    const kind = rule.kind;
    if (kind === '*') kinds = '*';
    else {
      const list = typeof kind === 'string' ? [kind] : kind;
      if (!Array.isArray(list) || list.length === 0) {
        c.fail(
          `${path}.kind`,
          `must be a block kind, a list of them, or "*" (got ${describe(kind)})`,
        );
      } else {
        const bad = list.filter((k) => typeof k !== 'string' || !KINDS.has(k));
        for (const k of bad) c.fail(`${path}.kind`, `${describe(k)} isn't a block kind`);
        if (bad.length === 0) kinds = new Set(list as string[]);
      }
    }
    if (kinds === null) ok = false;
    const covers = (k: string) => kinds === '*' || kinds?.has(k) === true;
    if (rule.depth !== undefined) {
      if (!covers('section')) {
        c.fail(`${path}.depth`, 'only applies to sections');
        ok = false;
      } else if (c.int(rule, 'depth', `${path}.depth`, 1) === null) ok = false;
    }
    if (rule.names !== undefined) {
      const names = rule.names;
      if (!Array.isArray(names) || names.some((n) => typeof n !== 'string' || n === '')) {
        c.fail(
          `${path}.names`,
          'must be a list of names; templates match exact names, not patterns',
        );
        ok = false;
      } else if (!covers('character')) {
        c.fail(`${path}.names`, 'only applies to character cues');
        ok = false;
      }
    }
    if (rule.afterRole !== undefined && c.string(rule, 'afterRole', `${path}.afterRole`) === null) {
      ok = false;
    }
    const role = c.string(rule, 'role', `${path}.role`);
    if (role === null) ok = false;
    else if (rolesValid && role !== '@kind' && !RESERVED_ROLES.has(role) && !roleNames.has(role)) {
      c.fail(path, `gives the role "${role}", but roles has no style for it`);
    }
    const conditional =
      rule.depth !== undefined || rule.names !== undefined || rule.afterRole !== undefined;
    rules.push(ok && kinds !== null && role !== null ? { kinds, conditional, role } : null);
  });

  if (!rolesValid) return;
  for (const kind of BLOCK_KINDS) {
    if (kind === 'page_break') continue; // structural: never goes through the role map
    let reached = false;
    rules.forEach((rule, i) => {
      if (reached || !rule || (rule.kinds !== '*' && !rule.kinds.has(kind))) return;
      if (rule.role === '@kind' && !roleNames.has(kind)) {
        c.fail(
          `roleMap[${i}]`,
          `gives "${kind}" blocks the role "${kind}", but roles has no "${kind}" style`,
        );
      }
      if (!rule.conditional) reached = true;
    });
    if (!reached) {
      c.problems.push(
        `no rule in roleMap gives "${kind}" blocks a role without conditions; end the list with { "kind": "*", "role": "@kind" }`,
      );
    }
  }
}
