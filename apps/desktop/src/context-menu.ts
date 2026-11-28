// The editor's right-click menu: spelling (the suggestions for a misspelled word, and Add to
// Dictionary), then Look up "word" (definitions design §7.5), then Use in Story Atlas and Never use in Story Atlas on a speech (story-atlas design
// §3.1, Call 6), then Cut, Copy, Paste, and Select All. Electron shows no context menu of its own, so
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

/** Use in Story Atlas and Never use in Story Atlas, for the speech under the click. */
export interface SpeechActions {
  use(): void;
  never(): void;
}

/** Look up, for the word under the click (definitions design §7.5). */
export interface LookUpAction {
  word: string;
  run(): void;
}

/** The longest word the menu names in full; a longer one is cut short with an ellipsis. */
const LOOK_UP_LABEL_MAX = 30;

/** The menu item's words: Look up “saunter”. */
export function lookUpLabel(word: string): string {
  const shown = word.length > LOOK_UP_LABEL_MAX ? `${word.slice(0, LOOK_UP_LABEL_MAX - 1)}…` : word;
  return `Look up “${shown}”`;
}

/** How many suggestions are listed. */
const MAX_SUGGESTIONS = 5;

/** The menu for a right-click with these params; empty when there is nothing to offer. */
export function contextMenuTemplate(
  params: ContextParams,
  actions: ContextActions,
  speech: SpeechActions | null = null,
  lookUp: LookUpAction | null = null,
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
  if (lookUp) {
    items.push(
      { label: lookUpLabel(lookUp.word), click: () => lookUp.run() },
      { type: 'separator' },
    );
  }
  if (params.isEditable && speech) {
    items.push(
      { label: 'Use in Story Atlas', click: () => speech.use() },
      { label: 'Never use in Story Atlas', click: () => speech.never() },
      { type: 'separator' },
    );
  }
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

/**
 * Asks the page which word is under a right-click (`drafter:editor:word-at`), as `speechAsker`
 * asks for a speech: the word (letters, at most 64 characters) or null, and none after `wait` ms.
 */
export function wordAsker(
  send: (id: number, x: number, y: number) => void,
  wait = SPEECH_WAIT_MS,
): { ask(x: number, y: number): Promise<string | null>; reply(id: unknown, word: unknown): void } {
  const waiting = new Map<number, (word: string | null) => void>();
  let next = 1;
  return {
    ask(x, y) {
      const id = next++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve(null);
        }, wait);
        waiting.set(id, (word) => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(word);
        });
        send(id, x, y);
      });
    },
    reply(id, word) {
      const done = typeof id === 'number' ? waiting.get(id) : undefined;
      if (!done) return;
      done(typeof word === 'string' && isLookUpWord(word) ? word : null);
    },
  };
}

/** A word the menu may offer to look up: a letter first, then letters, spaces, apostrophes, hyphens; at most 64. */
export function isLookUpWord(word: string): boolean {
  return word.length > 0 && word.length <= 64 && /^\p{L}[\p{L}\p{M}' ’-]*$/u.test(word);
}

/** How long the page has to say which speech is under a right-click, in milliseconds. */
export const SPEECH_WAIT_MS = 200;

/**
 * Asks the page which speech is under a right-click (`drafter:editor:speech-at`): `send` posts the
 * question with its id, and `reply` hears the page's answer, the editor offset of the click in a
 * speech, or null. No answer within `wait` ms is none, so the menu never waits on a busy page.
 */
export function speechAsker(
  send: (id: number, x: number, y: number) => void,
  wait = SPEECH_WAIT_MS,
): { ask(x: number, y: number): Promise<number | null>; reply(id: unknown, at: unknown): void } {
  const waiting = new Map<number, (at: number | null) => void>();
  let next = 1;
  return {
    ask(x, y) {
      const id = next++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve(null);
        }, wait);
        waiting.set(id, (at) => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(at);
        });
        send(id, x, y);
      });
    },
    reply(id, at) {
      const done = typeof id === 'number' ? waiting.get(id) : undefined;
      if (!done) return;
      done(typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 ? at : null);
    },
  };
}
