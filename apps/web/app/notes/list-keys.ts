// The keys on a focused row of the Notes list (Phase 2 design §8, Call 13): one tab stop; Up and
// Down move, Home and End go to the first and last; Enter goes to the note in the Source, E edits
// it in place, R resolves or reopens it, C sets its category, Delete (Backspace, a Mac's delete
// key) deletes it, and the context-menu key opens its menu (the pane maps Shift+F10 to it).

export type NoteAction = 'go' | 'edit' | 'resolve' | 'category' | 'delete' | 'menu';

const ACTIONS: Record<string, NoteAction> = {
  Enter: 'go',
  e: 'edit',
  E: 'edit',
  r: 'resolve',
  R: 'resolve',
  c: 'category',
  C: 'category',
  Delete: 'delete',
  Backspace: 'delete',
  ContextMenu: 'menu',
};

/** What `key` does on row `focused` of `count`: a row to focus, an action, or nothing (null). */
export function notesKey(
  count: number,
  focused: number,
  key: string,
): { focus?: number; action?: NoteAction } | null {
  if (count <= 0) return null;
  const at = Math.min(Math.max(focused, 0), count - 1);
  const to: Record<string, number> = {
    ArrowDown: at + 1,
    ArrowUp: at - 1,
    Home: 0,
    End: count - 1,
  };
  const next = to[key];
  if (next !== undefined) return next >= 0 && next < count ? { focus: next } : null;
  const action = ACTIONS[key];
  return action ? { action } : null;
}
