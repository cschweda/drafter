import { type Action, type Diagnostic, forceLinting, linter, lintGutter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Doc } from '@drafter/fountain';
import { type Fix, type LintDiagnostic, type LintOptions, lint } from '@drafter/lint';
import type { Template } from '@drafter/templates';
import { parsedDoc } from './state';

// Lint in the editor (technical design §9): the rules run on the parse in the state a moment
// after typing stops, and the diagnostics go to CodeMirror's gutter and tooltips.

/**
 * The action for a fix: it dispatches the fix's changes as one transaction. The changes are in
 * the offsets of the text that was linted. CodeMirror moves a diagnostic's range along with edits
 * made after the lint, but not the offsets of a fix, so when `linted` is given the action applies
 * only while the editor still has that parse. If it doesn't, it asks for a new lint and changes
 * nothing, so a stale fix never lands on the wrong text.
 */
function actionFor(fix: Fix, linted?: Doc): Action {
  return {
    name: fix.title,
    apply(view: EditorView) {
      if (linted && view.state.field(parsedDoc) !== linted) {
        forceLinting(view);
        return;
      }
      view.dispatch({ changes: fix.changes, userEvent: 'input' });
    },
  };
}

function convert(diagnostics: readonly LintDiagnostic[], linted?: Doc): Diagnostic[] {
  return diagnostics.map(({ ruleId, severity, span, message, fix }) => ({
    from: span.from,
    to: span.to,
    severity,
    message,
    source: ruleId,
    ...(fix && { actions: [actionFor(fix, linted)] }),
  }));
}

/**
 * CodeMirror's diagnostics for lint's: the range, severity, and message as they are, the rule as
 * the source, and a fix as one action, named by its title, that applies its changes. The action
 * trusts that the text is the text that was linted; `fountainLint` guards it.
 */
export function toCodeMirror(diagnostics: readonly LintDiagnostic[]): Diagnostic[] {
  return convert(diagnostics);
}

/**
 * `@codemirror/lint`'s linter, with a delay of 300 ms, and its gutter, running `lint` on
 * `parsedDoc`. `template` and `options` are read at each lint, so the app can change either
 * (the Strict Fountain setting, a new template) and call `forceLinting`.
 *
 * A fix applies only if the text is as it was when it was linted. Lint is the one place a fix is
 * made; CodeMirror keeps a diagnostic's range in step with edits made in the delay, so the
 * diagnostic stays where it should, but a fix's offsets cannot be moved. A fix chosen after an
 * edit does nothing but ask for a new lint, and the writer chooses it again from the new result.
 */
export function fountainLint(config: {
  template: () => Template;
  options?: () => LintOptions;
}): Extension {
  return [
    parsedDoc,
    linter(
      (view) => {
        const doc = view.state.field(parsedDoc);
        return convert(lint(doc, config.template(), config.options?.()), doc);
      },
      { delay: 300 },
    ),
    lintGutter(),
  ];
}
