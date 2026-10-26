import { isolateHistory } from '@codemirror/commands';
import { setMeta } from '@drafter/fountain';
import { type ComputedRef, computed } from 'vue';
import { useEditor } from './session';
import { isBuiltIn, type TemplateId, templateIdOf } from './template';

// The switcher is apart from `template.ts` because that file is plain data and functions, which
// storage and the tests import without the editor; this one needs the session.

export interface TemplateChoice {
  /** The template the script is in; the screenplay when `meta.template` is missing or unknown. */
  id: Readonly<ComputedRef<TemplateId>>;
  /** Whether `choose` can write: not in a read-only tab, and not while a `/*` is unclosed. */
  canChoose: Readonly<ComputedRef<boolean>>;
  /**
   * One undoable change to the metadata block, through `setMeta`. It is its own undo step, never
   * joined to typing before it. Nothing happens when the script already has that template, or when
   * `canChoose` is false. The session follows the new text (the layout, the lint) as for any edit.
   */
  choose(id: TemplateId): void;
}

export function useTemplate(): TemplateChoice {
  const { view, doc, locked } = useEditor();
  const id = computed(() => templateIdOf(doc.value));
  // `setMeta` writes nothing after an unclosed boneyard: its own `*/` would close the writer's `/*`.
  const canChoose = computed(() => !locked.value && doc.value.regions.every((r) => r.closed));

  function choose(next: TemplateId) {
    if (!canChoose.value || !isBuiltIn(next) || view.state.readOnly) return;
    const current = doc.value;
    // An unknown name in the block is replaced too, even by the screenplay it already falls back to.
    if (
      current.meta?.template === next ||
      (current.meta?.template === undefined && next === id.value)
    )
      return;
    // The parse reads every line break as `\n`; the editor's own may be `\r\n`.
    const changes = setMeta(current, { ...current.meta, template: next }).map((change) => ({
      ...change,
      insert: change.insert.replace(/\r?\n/g, view.state.lineBreak),
    }));
    if (changes.length === 0) return;
    view.dispatch({ changes, userEvent: 'input', annotations: isolateHistory.of('full') });
  }

  return { id, canChoose, choose };
}
