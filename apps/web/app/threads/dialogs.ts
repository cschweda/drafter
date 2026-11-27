import { ref } from 'vue';

// The two thread dialogs (Threads design §7.4): Threads… for one scene or passage, and the edit of
// one thread (rename, name, color, remove). Opened as Scene details is: by the item's id, with an
// optional `focusBack` the dialog calls as it closes, once.

/** The scene's outline id, or the passage's node id, while Threads… is open. */
export const threadsFor = ref<string | null>(null);

export type ThreadEditMode = 'rename' | 'name' | 'color' | 'remove';

/** The thread (by its label) and what is being done to it, while its edit dialog is open. */
export const threadEdit = ref<{ label: string; mode: ThreadEditMode } | null>(null);

let threadsBack: (() => void) | null = null;
let editBack: (() => void) | null = null;

/** Opens Threads… for the scene or passage with this id; `focusBack` gets focus when it closes. */
export function openThreads(id: string, focusBack?: () => void): void {
  threadsBack = focusBack ?? null;
  threadsFor.value = id;
}

/** Opens one thread's edit; `focusBack` gets focus when it closes. */
export function openThreadEdit(label: string, mode: ThreadEditMode, focusBack?: () => void): void {
  editBack = focusBack ?? null;
  threadEdit.value = { label, mode };
}

/** The focus-back Threads… was given, once. */
export function takeThreadsFocusBack(): (() => void) | null {
  const act = threadsBack;
  threadsBack = null;
  return act;
}

/** The focus-back the thread's edit was given, once. */
export function takeEditFocusBack(): (() => void) | null {
  const act = editBack;
  editBack = null;
  return act;
}
