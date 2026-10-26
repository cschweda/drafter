import { forEachDiagnostic } from '@codemirror/lint';
import type { EditorState } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import type { TextChange } from '@drafter/fountain';
import { lint, STRICT_RULES } from '@drafter/lint';
import { type ComputedRef, computed, type ShallowRef, shallowRef } from 'vue';
import { useSettings } from '../settings/settings';
import { useEditor } from './session';

export interface Problem {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Mapped to the current text. */
  from: number;
  to: number;
  /** 1-based source line. */
  line: number;
  fix?: { title: string; apply(): void };
}

/**
 * The changes of several fixes, all computed against one text, as one sorted list. A fix whose
 * changes overlap those of a fix before it is left out whole, so what is applied is always
 * complete fixes. Changes that only touch (one ends where another begins) don't overlap.
 */
export function mergeFixes(fixes: readonly { changes: readonly TextChange[] }[]): TextChange[] {
  const kept: TextChange[] = [];
  for (const fix of fixes) {
    const clashes = fix.changes.some((a) => kept.some((b) => a.from < b.to && b.from < a.to));
    if (!clashes) kept.push(...fix.changes);
  }
  return kept.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** "No problems", "1 problem", or "N problems": errors and warnings, as the status bar reads them. */
export function problemsLabel(count: number): string {
  if (count === 0) return 'No problems';
  return count === 1 ? '1 problem' : `${count} problems`;
}

const problems = shallowRef<readonly Problem[]>([]);
let started = false;

const same = (a: readonly Problem[], b: readonly Problem[]) =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = b[i] as Problem;
    return (
      p.ruleId === q.ruleId &&
      p.severity === q.severity &&
      p.message === q.message &&
      p.from === q.from &&
      p.to === q.to &&
      p.line === q.line &&
      p.fix?.title === q.fix?.title
    );
  });

/** Reads the lint state of the one editor into the list, after every update. */
function start() {
  started = true;
  const { view, onUpdate } = useEditor();

  function read(state: EditorState) {
    const found: Problem[] = [];
    forEachDiagnostic(state, (diagnostic, from, to) => {
      const action = diagnostic.actions?.[0];
      found.push({
        ruleId: diagnostic.source ?? '',
        severity: diagnostic.severity === 'hint' ? 'info' : diagnostic.severity,
        message: diagnostic.message,
        from,
        to,
        line: state.doc.lineAt(from).number,
        // The diagnostic's own action, which carries cm-fountain's guard against stale text.
        ...(action && { fix: { title: action.name, apply: () => action.apply(view, from, to) } }),
      });
    });
    found.sort((a, b) => a.from - b.from || a.to - b.to);
    if (!same(problems.value, found)) problems.value = found;
  }

  read(view.state);
  onUpdate(read);
}

/** The problems in the editor, as its gutter shows them (technical design §9). */
export function useProblems(): {
  problems: Readonly<ShallowRef<readonly Problem[]>>;
  /** Errors and warnings; info isn't counted (it's advice, not a fault). */
  count: Readonly<ComputedRef<number>>;
  /** Whether Strict Fountain is on and a Strict problem has a fix to apply. */
  canFixAll: Readonly<ComputedRef<boolean>>;
  /** Strict Fountain only: applies every Strict rule's fix in one undoable change. */
  fixAll(): void;
} {
  if (!started) start();
  const { settings } = useSettings();
  const { view, template } = useEditor();

  const count = computed(() => problems.value.filter((p) => p.severity !== 'info').length);
  const canFixAll = computed(
    () =>
      settings.value.strict && problems.value.some((p) => STRICT_RULES.includes(p.ruleId) && p.fix),
  );

  function fixAll() {
    if (!settings.value.strict || view.state.readOnly) return;
    // Linted now, from the text the editor has now, so no fix can be stale.
    const found = lint(view.state.field(parsedDoc), template.value, { strict: true });
    const fixes = found.flatMap((d) => (STRICT_RULES.includes(d.ruleId) && d.fix ? [d.fix] : []));
    // The parse reads every line break as `\n`; the editor's own may be `\r\n`.
    const changes = mergeFixes(fixes).map((change) => ({
      ...change,
      insert: change.insert.replace(/\r?\n/g, view.state.lineBreak),
    }));
    if (changes.length > 0) view.dispatch({ changes, userEvent: 'input' });
  }

  return { problems, count, canFixAll, fixAll };
}
