import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

/**
 * The line a click on a note showed (`EditorSession.reveal`): marked for a moment, so the eye finds
 * it with the editor unfocused and line numbers off. The mark goes with the next edit or selection
 * change, or after REVEAL_MS.
 */
export const REVEAL_MS = 1600;

export const revealLine = StateEffect.define<number | null>();

export const revealedLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(revealLine)) continue;
      if (effect.value === null) return Decoration.none;
      const line = tr.state.doc.lineAt(effect.value);
      return Decoration.set([Decoration.line({ class: 'cm-revealed' }).range(line.from)]);
    }
    return tr.docChanged || tr.selection ? Decoration.none : marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
