// The editor's right-click menu: spelling (the suggestions for a misspelled word, and Add to
// Dictionary), then Cut, Copy, Paste, and Select All. Electron shows no context menu of its own, so
// without this a right-click did nothing and a misspelling could only be fixed by typing. The
// template is built here, without Electron, from what Chromium says about the click
// (`context-menu`'s params); main.ts shows it in the editor's window only.
import type { MenuItemConstructorOptions } from 'electron';

/** The part of Electron's ContextMenuParams the menu reads. */
export interface ContextParams {
  misspelledWord: string;
  dictionarySuggestions: string[];
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}

export interface ContextActions {
  /** `webContents.replaceMisspelling(word)`: the misspelled word becomes `word`. */
  replace(word: string): void;
  /** `session.addWordToSpellCheckerDictionary(word)`. */
  addWord(word: string): void;
}

/** How many suggestions are listed. */
const MAX_SUGGESTIONS = 5;

/** The menu for a right-click with these params; empty when there is nothing to offer. */
export function contextMenuTemplate(
  params: ContextParams,
  actions: ContextActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const word = params.misspelledWord;
  if (word) {
    const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    for (const suggestion of suggestions) {
      items.push({ label: suggestion, click: () => actions.replace(suggestion) });
    }
    if (suggestions.length === 0) items.push({ label: 'No Suggestions', enabled: false });
    items.push({ label: 'Add to Dictionary', click: () => actions.addWord(word) });
    items.push({ type: 'separator' });
  }
  const flags = params.editFlags;
  if (params.isEditable) {
    items.push(
      { role: 'cut', enabled: flags.canCut },
      { role: 'copy', enabled: flags.canCopy },
      { role: 'paste', enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: flags.canSelectAll },
    );
  } else if (flags.canCopy) {
    items.push(
      { role: 'copy', enabled: true },
      { type: 'separator' },
      { role: 'selectAll', enabled: flags.canSelectAll },
    );
  }
  return items;
}
