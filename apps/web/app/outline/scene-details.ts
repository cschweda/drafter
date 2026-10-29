import type { Scene, SceneColor, SceneDetails } from '@drafter/outline';
import { ref } from 'vue';

// Scene details (Phase 2 design §9): a small form for a scene's header (§5.4), opened from an
// Outline row's menu, a card's, or the palette for the cursor's scene. What the form starts from,
// and what Save writes: only the fields that changed, an emptied one cleared.

/** The scene's id (`useOutline().idOf`) while the dialog is open. */
export const sceneDetailsFor = ref<string | null>(null);

/** Where focus goes when the dialog closes, when the opener knows better than the browser. */
let back: (() => void) | null = null;

/** Opens Scene details for the scene with this id; `focusBack` gets focus when it closes. */
export function openSceneDetails(id: string, focusBack?: () => void): void {
  back = focusBack ?? null;
  sceneDetailsFor.value = id;
}

/** The focus-back the opener gave, once: the dialog calls it as it closes. */
export function takeFocusBack(): (() => void) | null {
  const act = back;
  back = null;
  return act;
}

type TextKey = Exclude<keyof SceneDetails, 'color'>;
const TEXT_KEYS: readonly TextKey[] = [
  'synopsis',
  'storyline',
  'goal',
  'conflict',
  'outcome',
  'shift',
];

/** A text field's value now: the first synopsis, or the field's note (Storyline: the first note's body). */
function textOf(scene: Scene, key: TextKey): string {
  if (key === 'synopsis') return scene.synopses[0]?.text ?? '';
  return scene.fields[key]?.body ?? '';
}

/**
 * The form's starting values. Storyline is the first Storyline note's body, which is the one
 * `setSceneDetails` edits, not every note's labels (`storylines`). A color word Drafter doesn't
 * know is kept as it is, so the form shows it and saving leaves it.
 */
export function detailsDraft(scene: Scene): Required<SceneDetails> {
  return {
    synopsis: textOf(scene, 'synopsis'),
    color: (scene.color?.value ?? null) as SceneColor | null,
    storyline: textOf(scene, 'storyline'),
    goal: textOf(scene, 'goal'),
    conflict: textOf(scene, 'conflict'),
    outcome: textOf(scene, 'outcome'),
    shift: textOf(scene, 'shift'),
  };
}

/** Only what differs from the scene as it is: values trimmed, an emptied field `''` (cleared). */
export function changedDetails(scene: Scene, draft: Required<SceneDetails>): SceneDetails {
  const out: SceneDetails = {};
  for (const key of TEXT_KEYS) {
    const value = draft[key].trim();
    if (value !== textOf(scene, key).trim()) out[key] = value;
  }
  if (draft.color !== (scene.color?.value ?? null)) out.color = draft.color;
  return out;
}

/** The goal's first line (a body's line breaks are written ` / `), or null with no goal. */
export function goalLine(scene: Scene): string | null {
  const body = scene.fields.goal?.body;
  if (!body) return null;
  return body.split(' / ')[0]?.trim() || null;
}
