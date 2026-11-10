import type { SidesChoices } from '@drafter/production';
import { ref } from 'vue';
import { useEditor } from '../editor/session';
import { renderExport } from '../storage/export-client';

// Export sides (production design §10): the dialog's state and its choices, worked out apart from
// the dialog so they can be tested without one.

/** Whether the Export sides dialog is open: the command opens it. */
export const sidesOpen = ref(false);

export type { SidesChoices } from '@drafter/production';

/** What the dialog asks the export for: the characters named in the header, and the scenes ticked. */
export interface SidesChoice {
  names: string[];
  /** Scene ordinals, in script order. */
  scenes: number[];
}

/** The open script's characters and scenes, worked out in the export worker, never on the typing path. */
export async function sidesInfo(): Promise<SidesChoices> {
  const editor = useEditor();
  const { data } = await renderExport({
    kind: 'sides-info',
    source: editor.view.state.doc.toString(),
    template: editor.template.value,
  });
  return JSON.parse(String(data)) as SidesChoices;
}

/** The scenes of the characters with these `keys`, in script order, each once: what choosing them ticks. */
export function scenesOfCharacters(info: SidesChoices, keys: readonly string[]): number[] {
  const wanted = new Set(keys);
  const found = new Set<number>();
  for (const character of info.characters) {
    if (!wanted.has(character.key)) continue;
    for (const ordinal of character.scenes) found.add(ordinal);
  }
  return [...found].sort((a, b) => a - b);
}

/** What the dialog sends: the chosen characters' names (in the cast's order) and the ticked scenes in order. */
export function sidesChoice(
  info: SidesChoices,
  keys: readonly string[],
  ticked: ReadonlySet<number>,
): SidesChoice {
  const chosen = new Set(keys);
  return {
    names: info.characters.filter((c) => chosen.has(c.key)).map((c) => c.name),
    scenes: info.scenes.map((s) => s.ordinal).filter((ordinal) => ticked.has(ordinal)),
  };
}
