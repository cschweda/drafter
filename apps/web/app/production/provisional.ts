import { numbersScenes } from '@drafter/production';
import { effectScope, watch } from 'vue';
import { setProvisionalIssued } from '../editor/provisional';
import { useEditor } from '../editor/session';
import { useProduction } from './use-production';

// The Source pane's dimmed A-numbers (production design §7.1): on while a screenplay is locked,
// with the numbers its lock has issued; off otherwise. Set again when another script is loaded,
// since a new editor state starts with them off.

let kept = false;

export function keepProvisionalNumbers(): void {
  if (kept) return;
  kept = true;
  const editor = useEditor();
  const { state } = useProduction();
  effectScope(true).run(() => {
    watch(
      [state, editor.template, editor.kind, editor.loaded],
      ([production, template, kind]) => {
        const on = production !== null && kind === 'fountain' && numbersScenes(template);
        editor.view.dispatch({ effects: setProvisionalIssued.of(on ? production.numbers : null) });
      },
      { immediate: true },
    );
  });
}
