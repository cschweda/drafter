import { sceneIds } from '@drafter/cm-fountain';
import type { TextChange } from '@drafter/fountain';
import {
  hasStrayBoneyard,
  type OutlineItem,
  type Scene,
  type SceneColor,
  type SceneDetails,
  type SceneIndex,
  sceneIndex,
  setColor,
  setSceneDetails,
  setSynopsis,
} from '@drafter/outline';
import { type ComputedRef, computed, effectScope } from 'vue';
import { type ApplyOptions, applyTextChanges } from '../editor/apply-changes';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useScript } from '../storage/script';
import { sayOutline } from './notice';

// The Outline's model (Phase 2 design §6.1): the scene index of the editor's parse, recomputed
// after every parse (and when the pages arrive), each item's session id, and the edits a view
// makes. Shared by the Outline tab, its slim bar, and the commands.

const EMPTY: SceneIndex = {
  preamble: null,
  items: [],
  scenes: [],
  sections: [],
  tree: [],
  opening: null,
};

export interface OutlineSession {
  index: ComputedRef<SceneIndex>;
  /** The item's id for the visit (`sceneIds`), so focus and selection follow it through edits. */
  idOf(item: OutlineItem): string;
  itemById(id: string): OutlineItem | undefined;
  /** Why nothing can be changed from the Outline now, or null when it can. */
  readOnly: ComputedRef<string | null>;
  /** Why this tab can't edit the script at all now (another tab has it, or its file is being checked), or null. */
  locked: ComputedRef<string | null>;
  /** Applies a view's changes as one transaction (one undo). False when nothing could change. */
  apply(changes: readonly TextChange[], options?: ApplyOptions): boolean;
  setSynopsis(scene: Scene, text: string): boolean;
  setColor(scene: Scene, color: SceneColor | null): boolean;
  /** Scene details: writes the header's changed fields in one undo, and says so. */
  setDetails(scene: Scene, details: SceneDetails): boolean;
}

let session: OutlineSession | undefined;

function create(): OutlineSession {
  const editor = useEditor();
  const { layout } = useLayout();
  const script = useScript();
  return effectScope(true).run(() => {
    const index = computed(() =>
      editor.kind.value === 'markdown'
        ? EMPTY
        : sceneIndex(editor.doc.value, editor.template.value, layout.value),
    );
    // The ids change with the text, which `doc` follows.
    const ids = computed(() => {
      editor.doc.value;
      return editor.view.state.field(sceneIds, false) ?? new Map<number, string>();
    });
    const idOf = (item: OutlineItem) => ids.value.get(item.span.from) ?? `block-${item.block}`;
    const itemById = (id: string) => index.value.items.find((item) => idOf(item) === id);
    const locked = computed(() => {
      if (editor.locked.value) return 'This script is open for editing in another tab.';
      if (script.fileLocked.value) return 'Drafter is checking this script’s file first.';
      return null;
    });
    const readOnly = computed(() => {
      if (locked.value) return locked.value;
      if (hasStrayBoneyard(editor.doc.value)) {
        return 'A /* in this script isn’t closed by its own */, so the outline changes nothing until it is.';
      }
      return null;
    });
    const apply = (changes: readonly TextChange[], options?: ApplyOptions) =>
      readOnly.value === null && applyTextChanges(editor.view, changes, options);
    return {
      index,
      idOf,
      itemById,
      readOnly,
      locked,
      apply,
      setSynopsis: (scene, text) => apply(setSynopsis(editor.doc.value, scene, text)),
      setColor: (scene, color) => {
        const done = apply(setColor(editor.doc.value, scene, color));
        if (done) {
          void sayOutline(
            color ? `Colored ${scene.heading} ${color}.` : `Took the color off ${scene.heading}.`,
          );
        }
        return done;
      },
      setDetails: (scene, details) => {
        if (Object.keys(details).length === 0) return false;
        if (readOnly.value) {
          void sayOutline(readOnly.value);
          return false;
        }
        const changes = setSceneDetails(editor.doc.value, scene, details);
        // A change refused because the script would print differently (a synopsis cleared from
        // a line of notes that would join the lines around it), or a tab that can't edit.
        if (changes.length === 0) {
          void sayOutline(
            'Nothing was changed: saving these details would change how the script prints.',
          );
          return false;
        }
        if (!apply(changes)) {
          void sayOutline('Nothing was changed: this tab can’t edit the script now.');
          return false;
        }
        void sayOutline(`Saved the details of ${scene.heading || 'the untitled scene'}.`);
        return true;
      },
    } satisfies OutlineSession;
  }) as OutlineSession;
}

/** The Outline's model, made on first use in the browser and kept for the visit. */
export function useOutline(): OutlineSession {
  session ??= create();
  return session;
}
