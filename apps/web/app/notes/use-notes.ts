import type { Doc, TextChange } from '@drafter/fountain';
import {
  findEntry,
  insertNote,
  type NoteEntry,
  noteEntries,
  type SetupThread,
  setupsAndPayoffs,
  writeNote,
} from '@drafter/notes';
import { type ComputedRef, computed, effectScope, reactive, ref, toRaw } from 'vue';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useOutline } from '../outline/use-outline';
import { NO_FILTER, type NoteFilter, type NoteRowModel, notesShown } from './filter';

// The Notes tab's model (Phase 2 design §8): the script's notes and boneyards, its setups and
// payoffs, and the edits the tab makes. Every edit finds its note again in the parse as it is now
// (`findEntry`, Call 16), so an action on a row drawn before the script changed does nothing and
// says so; each goes through the Outline's `apply`, one undo, and speaks through `sayOutline`.

export interface NotesSession {
  entries: ComputedRef<NoteEntry[]>;
  threads: ComputedRef<SetupThread[]>;
  /** The rows `notesFilter` shows (`notesShown`), for the tab and its slim bar. */
  shown: ComputedRef<NoteRowModel[]>;
  /**
   * Re-finds `was` in the current parse (findEntry) and applies `edit`; says "That note has
   * changed since; the list is up to date now." when it is gone. `said` is spoken when the edit is
   * made; `refused` when `edit` gives no changes (it changes nothing that way).
   */
  act(
    was: NoteEntry,
    edit: (doc: Doc, entry: NoteEntry) => TextChange[],
    said: string,
    refused?: string,
  ): boolean;
  /** `act` for several notes in one undo (Resolve all shown): nothing when any of them is gone. */
  actAll(
    was: readonly NoteEntry[],
    edit: (doc: Doc, entries: NoteEntry[]) => TextChange[],
    said: string,
  ): boolean;
  /** `[[text #category]]` at the cursor (`insertNote`), one undo. */
  add(text: string, category: string | null): boolean;
}

export const STALE = 'That note has changed since; the list is up to date now.';
export const STALE_ALL =
  'Some of those notes have changed since, so nothing was changed. The list is up to date now.';
export const REFUSED = 'Nothing was changed: that would change how the script prints.';

/** The filter the Notes tab and its sheet share for the visit. */
export const notesFilter = reactive<NoteFilter>({ ...NO_FILTER });

/** New note: whether the dialog is open, and where focus goes back to when it closes. */
export const newNoteOpen = ref(false);
let newNoteBack: (() => void) | null = null;

export function openNewNote(focusBack?: () => void): void {
  newNoteBack = focusBack ?? null;
  newNoteOpen.value = true;
}

/** The focus-back the opener gave, once. */
export function takeNewNoteBack(): (() => void) | null {
  const act = newNoteBack;
  newNoteBack = null;
  return act;
}

let session: NotesSession | undefined;

function create(): NotesSession {
  const editor = useEditor();
  const outline = useOutline();
  /** The script's length when each entry was listed, for `findEntry`'s reach. */
  const drawnAt = new WeakMap<NoteEntry, number>();
  return effectScope(true).run(() => {
    const entries = computed(() => {
      if (editor.kind.value === 'markdown') return [];
      const doc = editor.doc.value;
      const list = noteEntries(doc);
      for (const entry of list) drawnAt.set(entry, doc.source.length);
      return list;
    });
    const threads = computed(() => setupsAndPayoffs(entries.value));
    const lineOf = (offset: number) => {
      const text = editor.view.state.doc;
      return text.lineAt(Math.min(Math.max(offset, 0), text.length)).number;
    };
    const shown = computed(() =>
      notesShown(entries.value, outline.index.value, notesFilter, lineOf),
    );

    /** `was` in the parse as it is now, looked for as far as the script has grown or shrunk since. */
    const now = (was: NoteEntry) => {
      const length = editor.doc.value.source.length;
      // `was` may come back through a ref as a reactive proxy, which the map doesn't know.
      const drawn = drawnAt.get(toRaw(was)) ?? length;
      return findEntry(entries.value, was, length - drawn);
    };

    const applied = (changes: TextChange[], said: string, refused: string) => {
      if (changes.length === 0) {
        void sayOutline(refused);
        return false;
      }
      if (!outline.apply(changes)) {
        void sayOutline('Nothing was changed: this tab can’t edit the script now.');
        return false;
      }
      void sayOutline(said);
      return true;
    };

    const act: NotesSession['act'] = (was, edit, said, refused = REFUSED) => {
      const why = outline.readOnly.value;
      if (why) {
        void sayOutline(why);
        return false;
      }
      const entry = now(was);
      if (!entry) {
        void sayOutline(STALE);
        return false;
      }
      return applied(edit(editor.doc.value, entry), said, refused);
    };

    const actAll: NotesSession['actAll'] = (was, edit, said) => {
      const why = outline.readOnly.value;
      if (why) {
        void sayOutline(why);
        return false;
      }
      const found = was.map(now);
      if (found.some((entry) => entry === null)) {
        void sayOutline(STALE_ALL);
        return false;
      }
      return applied(edit(editor.doc.value, found as NoteEntry[]), said, REFUSED);
    };

    const add: NotesSession['add'] = (text, category) => {
      const why = outline.readOnly.value;
      if (why) {
        void sayOutline(why);
        return false;
      }
      const body = category ? `${text.trim()} #${category}` : text.trim();
      if (body === '') return false;
      const doc = editor.doc.value;
      const { changes, cursor } = insertNote(
        doc,
        editor.view.state.selection.main.head,
        writeNote(null, body),
      );
      if (changes.length === 0) {
        void sayOutline(
          'Nothing was added: a note at the cursor would change how the script reads.',
        );
        return false;
      }
      if (!outline.apply(changes, { selection: { anchor: cursor } })) {
        void sayOutline('Nothing was added: this tab can’t edit the script now.');
        return false;
      }
      void sayOutline('Added a note at the cursor.');
      return true;
    };

    return { entries, threads, shown, act, actAll, add } satisfies NotesSession;
  }) as NotesSession;
}

/** The Notes tab's model, made on first use in the browser and kept for the visit. */
export function useNotes(): NotesSession {
  session ??= create();
  return session;
}
