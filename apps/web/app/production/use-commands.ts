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
} from './commands';

// The Production actions in the app: the open script's editor, Drafts for each set's baseline, and
// the snapshots taken before Unlock and Clear marks. Made on first use and kept for the visit.

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
    // Each baseline is a draft of the writer's (production design §6.2). A sample keeps no drafts, so
    // its id is the text's hash alone: the baseline itself travels in the file (§6.3a).
    async freeze(text, note) {
      const open = script.project.value;
      if (open && !open.sample) {
        const out = await freezeDraft(open.id, text, note, undefined, editor.kind.value);
        if (out.result === 'frozen') {
          void useDrafts().load();
          return out.row.id;
        }
      }
      return hashText(text);
    },
    snapshot: (reason) => useSnapshots().before(reason),
    say: (message) => void sayOutline(message),
    show: () => showTempTab(PRODUCTION_TAB_ID),
  });
  return shared;
}
