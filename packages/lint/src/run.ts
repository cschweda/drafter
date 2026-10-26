import type { Doc } from '@drafter/fountain';
import type { Template } from '@drafter/templates';
import { manualContd } from './rules/contd';
import { characterWithoutDialogue } from './rules/cue';
import { headingNoTime } from './rules/heading';
import {
  headingBlankAfter,
  invalidMeta,
  multilineParenthetical,
  unclosedRegion,
} from './rules/parse';
import { transitionNotLast } from './rules/transition';
import type { LintDiagnostic, LintOptions, Rule, RuleContext } from './types';

/** Every rule, in the order they run. */
export const rules: readonly Rule[] = [
  unclosedRegion,
  invalidMeta,
  headingBlankAfter,
  multilineParenthetical,
  characterWithoutDialogue,
  manualContd,
  headingNoTime,
  transitionNotLast,
];

/**
 * The Strict Fountain rules (Phase 1 design §5.6): the places where Drafter reads a file more
 * generously than the spec does. They are `info` by default, `strict` raises them to
 * `warning`, and "Fix all" applies their fixes.
 */
export const STRICT_RULES: readonly string[] = [headingBlankAfter.id, multilineParenthetical.id];

function byPosition(a: LintDiagnostic, b: LintDiagnostic): number {
  if (a.span.from !== b.span.from) return a.span.from - b.span.from;
  if (a.ruleId === b.ruleId) return 0;
  return a.ruleId < b.ruleId ? -1 : 1;
}

/**
 * Every enabled rule's diagnostics, sorted by `span.from`, then `ruleId`.
 *
 * It lints the whole script on every call. Every rule is linear in the script's size, and the
 * editor lints a moment after typing stops, so technical design §9's `local` flag, which would
 * limit a rule to the edited scene, isn't needed yet.
 */
export function lint(doc: Doc, template: Template, options: LintOptions = {}): LintDiagnostic[] {
  // The template's `lint.enable` is for rules that are off by default, and there are none yet.
  const off = new Set([...(template.lint?.disable ?? []), ...(options.disable ?? [])]);
  const ctx: RuleContext = { doc, template, options };
  const found: LintDiagnostic[] = [];
  for (const rule of rules) {
    if (off.has(rule.id)) continue;
    const raise = options.strict === true && STRICT_RULES.includes(rule.id);
    for (const d of rule.run(ctx)) found.push(raise ? { ...d, severity: 'warning' } : d);
  }
  return found.sort(byPosition);
}
