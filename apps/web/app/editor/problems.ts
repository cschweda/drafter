import { isolateHistory } from '@codemirror/commands';
import { forEachDiagnostic } from '@codemirror/lint';
import type { EditorState } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import type { TextChange } from '@drafter/fountain';
import { lint, STRICT_RULES } from '@drafter/lint';
import { type ComputedRef, computed, type ShallowRef, shallowRef } from 'vue';
import { moduleProblems } from '../modules/problems';
import { reportModuleFailure } from '../modules/registry';
import { useSettings } from '../settings/settings';
import { useSnapshots } from '../snapshots/use-snapshots';
import { applyTextChanges } from './apply-changes';
import { relint } from './extensions';
import { useEditor } from './session';
import { appChange } from './typewriter';

export interface Problem {
  /**
   * Names the problem across edits, for keying a list: its rule, and how many of that rule's
   * problems come before it. A position would change with every edit above it.
   */
  key: string;
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

/** A problem a script module found: listed with the others, labelled with the module's name, and not counted. */
export interface ModuleRow {
  key: string;
  moduleName: string;
  severity: 'warning' | 'info';
  message: string;
  from: number;
  to: number;
  line: number;
  fix?: { title: string; apply(): void };
}

/** `rule:n` for each rule id, n counting that rule's earlier problems in the list. */
export function occurrenceKeys(ruleIds: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return ruleIds.map((id) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return `${id}:${n}`;
  });
}

/**
 * `fn` as a function that runs it once on the next frame, with the arguments of the last call,
 * however many calls come first. `schedule` is the frame (animation frame, by default).
 */
export function oncePerFrame<A extends unknown[]>(
  fn: (...args: A) => void,
  schedule: (run: () => void) => unknown = (run) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16),
): (...args: A) => void {
  let latest: A | undefined;
  return (...args) => {
    const waiting = latest !== undefined;
    latest = args;
    if (waiting) return;
    schedule(() => {
      const last = latest as A;
      latest = undefined;
      fn(...last);
    });
  };
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
      p.key === q.key &&
      p.fix?.title === q.fix?.title
    );
  });

/** Reads the lint state of the one editor into the list, after every update. */
function start() {
  started = true;
  const { view, onUpdate, locked } = useEditor();

  function read(state: EditorState) {
    const found: Omit<Problem, 'key'>[] = [];
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
        ...(action && {
          fix: {
            title: action.name,
            apply: () => {
              if (locked.value) return;
              action.apply(view, from, to);
              // Lint now, so the fixed problem doesn't wait out the delay in the list.
              relint();
            },
          },
        }),
      });
    });
    found.sort((a, b) => a.from - b.from || a.to - b.to);
    const keys = occurrenceKeys(found.map((p) => p.ruleId));
    const keyed = found.map((p, i) => ({ ...p, key: keys[i] as string }));
    if (!same(problems.value, keyed)) problems.value = keyed;
  }

  read(view.state);
  // Typing makes an update per keystroke; the list is read once a frame, from the state then.
  const readSoon = oncePerFrame(() => read(view.state));
  onUpdate(readSoon);
}

let moduleRows: ComputedRef<readonly ModuleRow[]> | undefined;

/** The problems in the editor, as its gutter shows them (technical design §9). */
export function useProblems(): {
  problems: Readonly<ShallowRef<readonly Problem[]>>;
  /** What script modules found. Not in `problems`, and not in `count`. */
  moduleProblems: Readonly<ComputedRef<readonly ModuleRow[]>>;
  /** Errors and warnings; info isn't counted (it's advice, not a fault). */
  count: Readonly<ComputedRef<number>>;
  /** Whether editing is off (another tab has the script, or a switch is under way): no fix applies. */
  locked: Readonly<ShallowRef<boolean>>;
  /** Whether Strict Fountain is on, the editor can be changed, and a Strict problem has a fix. */
  canFixAll: Readonly<ComputedRef<boolean>>;
  /** Strict Fountain only: applies every Strict rule's fix in one undoable change. */
  fixAll(): void;
} {
  if (!started) start();
  const { settings } = useSettings();
  const { view, template, locked } = useEditor();

  // Mapped through every edit by the module host, so the list is new whenever the text changed.
  moduleRows ??= computed(() => {
    const seen = new Map<string, number>();
    return moduleProblems.value.map((p): ModuleRow => {
      const n = seen.get(p.moduleId) ?? 0;
      seen.set(p.moduleId, n + 1);
      const { fix } = p;
      return {
        // Apart from a rule's keys (`rule:n`).
        key: `module:${p.moduleId}:${n}`,
        moduleName: p.moduleName,
        severity: p.severity,
        message: p.message,
        from: p.from,
        to: p.to,
        line: view.state.doc.lineAt(Math.min(p.from, view.state.doc.length)).number,
        ...(fix && {
          fix: {
            title: fix.title,
            apply: () => {
              if (locked.value) return;
              try {
                applyTextChanges(view, fix.changes);
              } catch (error) {
                reportModuleFailure(p.moduleName, error);
              }
            },
          },
        }),
      };
    });
  });

  const count = computed(() => problems.value.filter((p) => p.severity !== 'info').length);
  const canFixAll = computed(
    () =>
      settings.value.strict &&
      !locked.value &&
      problems.value.some((p) => STRICT_RULES.includes(p.ruleId) && p.fix),
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
    if (changes.length === 0) return;
    useSnapshots().before('before-fix-all');
    // One undo step of its own, never joined to typing before or after it.
    view.dispatch({
      changes,
      userEvent: 'input',
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    relint();
  }

  return { problems, moduleProblems: moduleRows, count, locked, canFixAll, fixAll };
}
