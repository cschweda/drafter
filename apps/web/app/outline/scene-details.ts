import { normalizeLabel } from '@drafter/notes';
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
  'thread',
  'goal',
  'conflict',
  'outcome',
  'shift',
];

/** A text field's value now: the first synopsis, or the field's note (Thread: every note's labels). */
function textOf(scene: Scene, key: TextKey): string {
  if (key === 'synopsis') return scene.synopses[0]?.text ?? '';
  if (key === 'thread') return scene.threads.join(', ');
  return scene.fields[key]?.body ?? '';
}

/**
 * The form's starting values. Thread is every Thread or Storyline note's labels (`threads`), so
 * what the writer edits is what the scene has, not only the first note's body. A color word Drafter doesn't
 * know is kept as it is, so the form shows it and saving leaves it.
 */
export function detailsDraft(scene: Scene): Required<SceneDetails> {
  return {
    synopsis: textOf(scene, 'synopsis'),
    color: (scene.color?.value ?? null) as SceneColor | null,
    thread: textOf(scene, 'thread'),
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

/**
 * What the Threads field suggests as the writer types (Threads design §7.4): the labels in use in
 * `scenes`, once each as first typed, each after the labels already typed before the last comma,
 * and none already in the field. A browser's suggestion list matches the whole field, so each
 * suggestion is the whole field with one label more.
 */
export function threadSuggestions(scenes: readonly Scene[], typed: string): string[] {
  const parts = typed.split(',');
  const done = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  const taken = new Set(done.map(normalizeLabel));
  const prefix = done.length > 0 ? `${done.join(', ')}, ` : '';
  const out: string[] = [];
  for (const scene of scenes) {
    for (const label of scene.threads) {
      const key = normalizeLabel(label);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(prefix + label);
    }
  }
  return out;
}
