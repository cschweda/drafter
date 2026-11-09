import { hasStrayBoneyard } from '@drafter/outline';
import { freezeDraft } from '~/drafts/store';
import { showTempTab } from '~/drafts/tabs';
import { useDrafts } from '~/drafts/use-drafts';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';
import { useSnapshots } from '~/snapshots/use-snapshots';
import { hashText } from '~/storage/hash';
import { useScript } from '~/storage/script';
import { PRODUCTION_TAB_ID } from '~/utils/panes';
import {
  createProductionActions,
  firstSceneNumber,
  localDate,
  type ProductionActions,
  READ_ONLY,
} from './commands';

// The Production actions in the app: the open script's editor, Drafts for each set's baseline, and
// the snapshots taken before Unlock, Clear marks, and Omit scene. Made on first use and kept for the
// visit.

/** Said while a stray `/*` stops every Production change: what it is, and what to do about it. */
export const STRAY_COMMENT =
  'A /* in this script isn’t closed by its own */. Type */ where that comment ends, or delete the /*, and Production can change the script again.';

/**
 * Why Production can't change the open script now, or null: read as the editor's state changes, so
 * the tab's buttons follow it.
 */
export function productionReadOnly(): string | null {
  const editor = useEditor();
  if (editor.locked.value)
    return 'This script is open for editing in another Drafter tab, so Production can’t change it here.';
  if (editor.frozen.value)
    return 'This is a draft, opened to read: it can’t be changed, and neither can its lock or its marks.';
  if (editor.kind.value === 'fountain' && hasStrayBoneyard(editor.doc.value)) return STRAY_COMMENT;
  return editor.view.state.readOnly ? READ_ONLY : null;
}

let shared: ProductionActions | undefined;

export function useProductionActions(): ProductionActions {
  if (shared) return shared;
  const editor = useEditor();
  const script = useScript();
  shared = createProductionActions({
    view: editor.view,
    kind: () => editor.kind.value,
    template: () => editor.template.value,
    firstScene: () => firstSceneNumber.value,
    today: () => localDate(),
    // Each baseline is a draft of the writer's (production design §6.2), whose id is its text's
    // hash. A sample keeps no drafts: the baseline itself travels in the file (§6.3a).
    draftId: (text) => hashText(text),
    async freeze(text, note) {
      const open = script.project.value;
      if (!open || open.sample) return;
      const out = await freezeDraft(open.id, text, note, undefined, editor.kind.value);
      if (out.result === 'frozen') void useDrafts().load();
    },
    snapshot: (reason, detail) => useSnapshots().before(reason, detail),
    say: (message) => void sayOutline(message),
    readOnlyWhy: productionReadOnly,
    show: () => showTempTab(PRODUCTION_TAB_ID),
  });
  return shared;
}
