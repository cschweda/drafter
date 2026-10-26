import type { Doc, Span, TextChange } from '@drafter/fountain';
import type { Template } from '@drafter/templates';

export type Severity = 'error' | 'warning' | 'info';

/** A rewrite that settles a problem, as the editor can apply it. */
export interface Fix {
  /** What it does, as a command: "Insert a blank line". */
  title: string;
  /**
   * The replacements, in the offsets of the linted source. They are in order and never
   * overlap, so they go straight into one CodeMirror transaction.
   */
  changes: TextChange[];
}

export interface LintDiagnostic {
  /** The rule that found it, such as `unclosed-region`. */
  ruleId: string;
  severity: Severity;
  /** The text the problem is about. */
  span: Span;
  message: string;
  fix?: Fix;
}

export interface LintOptions {
  /** Strict Fountain (Phase 1 design §5.6): the Strict rules become warnings. */
  strict?: boolean;
  /** Rule ids to skip, besides the template's `lint.disable`. */
  disable?: readonly string[];
}

export interface RuleContext {
  doc: Doc;
  template: Template;
  options: LintOptions;
}

export interface Rule {
  id: string;
  /**
   * The severity of the rule's diagnostics. A rule that reports more than one declares the
   * highest and sets the rest on its diagnostics: `unclosed-region` is `error`, for a
   * boneyard, but reports a note as a `warning`. Each diagnostic's own severity is what counts.
   */
  severity: Severity;
  run(ctx: RuleContext): LintDiagnostic[];
}
