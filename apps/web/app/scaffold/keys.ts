// Scaffold's one key (seeing-the-script design §5.1, §9): Alt+Left goes Back while focus is in the
// tab, as a browser's Back does (Option+Left on a Mac). No other modifier, and not in a text field
// (the lists' filter), where Alt+Left moves the caret a word back on a Mac.

const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA']);

type BackKeyEvent = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> & {
  target: { tagName?: string } | EventTarget | null;
};

/** Whether `event` is Alt+Left, and nothing else, outside a text field. */
export function isBackKey(event: BackKeyEvent): boolean {
  if (event.key !== 'ArrowLeft' || !event.altKey) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const tag = (event.target as { tagName?: string } | null)?.tagName;
  return !(tag && TEXT_FIELDS.has(tag));
}
