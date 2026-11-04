import type { EditorView } from '@codemirror/view';
import { type SpellMark, spellMarkAt, spellMarksOf } from '@drafter/cm-fountain';
import { nextTick } from 'vue';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { useSettings } from '~/settings/settings';
import { addToMine, ignoreWordHere, stepMisspelling, tryAddToScript } from '~/spell/actions';
import { makeCheckSpelling } from '~/spell/check';
import { openSpellMenu } from '~/spell/menu';
import { NO_MARK_HERE, NO_MARKS, SPELLCHECK_OFF, saySpell } from '~/spell/notice';
import { SPELLING_HEADING_ID } from '~/spell/rows';
import { useSpell } from '~/spell/use-spell';
import type { TabId } from '~/utils/panes';
import type { Behavior } from './behavior';

/** What the spellcheck's commands borrow from `registerBuiltinCommands`. */
export interface SpellContext {
  /** Runs `act` on the editor, with the Source showing and the editor focused first. */
  onEditor(act: (view: EditorView) => void): () => void;
  /** Shows a tab (Problems, for Check spelling). */
  showTab(tab: TabId, focusPanel?: boolean): void;
}

/**
 * The spellcheck's commands (Plan D; out of `builtin.ts`, 2026-11-04): Check spelling, the
 * suggestions, the two dictionaries, Ignore here, and Next and Previous misspelling.
 */
export function spellBehaviors({ onEditor, showTab }: SpellContext): Record<string, Behavior> {
  const editor = useEditor();
  const { view } = editor;
  const { settings } = useSettings();

  // ---- The spellcheck's commands (Plan D) ---------------------------------------------------

  const spellOn = () => settings.value.spellcheck;
  const spellWhy = () => (spellOn() ? undefined : SPELLCHECK_OFF);
  /**
   * On the misspelled word at the cursor, with the Source showing and the editor focused first;
   * said, when there is none.
   */
  const onMisspelling = (act: (mark: SpellMark) => unknown): Behavior => ({
    enabled: spellOn,
    why: spellWhy,
    run: onEditor((v) => {
      const mark = spellMarkAt(v.state, v.state.selection.main.head);
      if (mark) act(mark);
      else void saySpell(NO_MARK_HERE);
    }),
  });
  /**
   * Check spelling (Call 13): once the check under way has come back, Problems shows with focus
   * on its Spelling heading, and the count is said. With spellcheck off it says so and changes
   * nothing.
   */
  const checkSpelling = makeCheckSpelling({
    on: spellOn,
    settled: () => useSpell().settled(),
    state: () => useSpell().state.value,
    count: () => spellMarksOf(view.state).length,
    show: async () => {
      showTab('problems');
      // After showTab's own focus (the panel), once the pane has drawn the group.
      await nextTick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      document.getElementById(SPELLING_HEADING_ID)?.focus();
    },
    say: (message) => void saySpell(message),
  });
  /** Next or Previous misspelling: selects the word, and says it with its first suggestion. */
  const stepSpelling = (direction: 1 | -1): Behavior => ({
    enabled: spellOn,
    why: spellWhy,
    run: onEditor((v) => {
      void stepMisspelling(v, direction).then((moved) => {
        if (!moved) void saySpell(NO_MARKS);
      });
    }),
  });

  return {
    'next-misspelling': stepSpelling(1),
    'previous-misspelling': stepSpelling(-1),
    // On with spellcheck off too, so that it can say so.
    'check-spelling': { run: checkSpelling },
    'spelling-suggestions': {
      enabled: spellOn,
      why: spellWhy,
      run: onEditor((v) => {
        if (!openSpellMenu(v)) void saySpell(NO_MARK_HERE);
      }),
    },
    // A suggestion and the script's dictionary edit the file; My dictionary and Ignore here don't,
    // so a read-only tab can use them (Call 19).
    'add-to-script-dictionary': onMisspelling((mark) =>
      tryAddToScript(view, mark.word, editor.kind.value, useOutline().locked.value),
    ),
    'add-to-my-dictionary': onMisspelling((mark) => void addToMine(view, mark.word)),
    'ignore-misspelling': onMisspelling((mark) => {
      ignoreWordHere(view, mark);
      void saySpell(`Ignored “${mark.word}” here.`);
    }),
  };
}
