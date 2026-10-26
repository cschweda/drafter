import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { type CursorElement, cursorElement, parsedDoc } from '@drafter/cm-fountain';
import { type Doc, parse, type Span } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { nextTick, type ShallowRef, shallowRef } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { useSettings } from '~/settings/settings';
import { type PaneId, revealTab, WIDE_QUERY } from '~/utils/panes';
import type { DocumentKind } from '../markdown/kind';
import { applyEditorSettings } from './apply-settings';
import {
  type EditorHooks,
  editorExtensions,
  language,
  languageExtension,
  readOnly,
  readOnlyExtension,
  relint,
} from './extensions';
import { SAMPLE_SCREENPLAY } from './samples';
import { templateIdOf } from './template';

export interface EditorSession {
  /** The one editor, created once on the client. */
  readonly view: EditorView;
  /** `parsedDoc` after every change. */
  readonly doc: Readonly<ShallowRef<Doc>>;
  readonly cursor: Readonly<ShallowRef<CursorElement | null>>;
  /** The built-in that `templateIdOf(doc)` names (technical design §8.6); the toolbar's chip writes it (`useTemplate`). */
  readonly template: Readonly<ShallowRef<Template>>;
  /** What the document is: Fountain, or plain Markdown (no pages, elements, or checks). */
  readonly kind: Readonly<ShallowRef<DocumentKind>>;
  /**
   * Gives the one editor a fresh state with `text` (an opened script) of `kind`: its own undo
   * history, its cursor at the start, and the same extensions. Nothing is kept of the text it
   * held, so the caller keeps that first.
   */
  load(text: string, kind?: DocumentKind): void;
  /**
   * Changes the kind of the open document and keeps its text, history, and cursor: the language
   * is reconfigured, nothing is typed. Undo does not reverse it.
   */
  setKind(kind: DocumentKind): void;
  /** Whether editing is off: another tab has the script, or a switch to another script is under way. */
  readonly locked: Readonly<ShallowRef<boolean>>;
  /** Turns editing off (or on): the script is open for editing in another tab. `load` keeps it. */
  setReadOnly(on: boolean): void;
  /**
   * Calls `listener` after every change to the text or the selection, and after `load`, with the
   * state the editor now has. Update listeners in the state itself are lost when `load` replaces
   * it; these are not. Returns a function that removes it.
   */
  onState(listener: (state: EditorState) => void): () => void;
  /**
   * Calls `listener` after every update that changes the text or carries an effect (a new set of
   * lint diagnostics is one), and after `load`. `onState` hears of edits and moves only.
   */
  onUpdate(listener: (state: EditorState) => void): () => void;
  /** Selects `select` (default: the offset), scrolls it into view, shows the Source tab, and focuses the editor. */
  goto(offset: number, options?: { select?: Span }): void;
}

let session: EditorSession | undefined;

function create(): EditorSession {
  const doc = shallowRef<Doc>(parse(SAMPLE_SCREENPLAY));
  const cursor = shallowRef<CursorElement | null>(null);
  const template = shallowRef<Template>(builtins[templateIdOf(doc.value)] as Template);
  const panes = usePanes();
  const locked = shallowRef(false);
  const kind = shallowRef<DocumentKind>('fountain');
  const listeners = new Set<(state: EditorState) => void>();
  const updateListeners = new Set<(state: EditorState) => void>();

  /** Brings what the session shows up to date with `state`. */
  function follow(state: EditorState) {
    doc.value = state.field(parsedDoc);
    const next = builtins[templateIdOf(doc.value)] as Template;
    if (next !== template.value) {
      template.value = next;
      // The rules the template turns off are linted again now, not after the next edit. Not in
      // this update: a listener may not dispatch.
      queueMicrotask(relint);
    }
  }

  const { settings } = useSettings();

  const hooks: EditorHooks = {
    template: () => template.value,
    lintOptions: () => ({ strict: settings.value.strict }),
    onCursorElement: (element) => {
      cursor.value = element;
    },
  };

  // Everything but the text, so `load` can make a new state from the same pieces.
  const extensionsFor = (of: DocumentKind) => [
    editorExtensions(hooks, of),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) follow(update.state);
      if (update.docChanged || update.selectionSet) for (const l of listeners) l(update.state);
      if (update.docChanged || update.transactions.some((tr) => tr.effects.length > 0)) {
        for (const l of updateListeners) l(update.state);
      }
    }),
  ];
  const view = new EditorView({
    state: EditorState.create({ doc: SAMPLE_SCREENPLAY, extensions: extensionsFor('fountain') }),
  });

  doc.value = view.state.field(parsedDoc);
  // onCursorElement doesn't report the element the cursor starts in.
  cursor.value = cursorElement(view.state);

  function load(text: string, loaded: DocumentKind = 'fountain') {
    kind.value = loaded;
    // `setState` tells no update listener, so the session catches up by hand.
    view.setState(EditorState.create({ doc: text, extensions: extensionsFor(loaded) }));
    // The compartments start from their first values again, so read-only is put back, and so
    // are the settings that live in them (spellcheck, line numbers) and Strict Fountain's lint.
    if (locked.value) view.dispatch({ effects: readOnly.reconfigure(readOnlyExtension(true)) });
    applyEditorSettings(view, settings.value);
    follow(view.state);
    // There are no elements in a Markdown document.
    cursor.value = loaded === 'fountain' ? cursorElement(view.state) : null;
    // The new text starts at the top, whatever the old one's scroller was showing.
    view.dispatch({ effects: EditorView.scrollIntoView(0) });
    for (const l of listeners) l(view.state);
    for (const l of updateListeners) l(view.state);
  }

  function setKind(next: DocumentKind) {
    if (next === kind.value) return;
    kind.value = next;
    view.dispatch({ effects: language.reconfigure(languageExtension(hooks, next)) });
    cursor.value = next === 'fountain' ? cursorElement(view.state) : null;
    // Fountain's lint starts again for the text it now lints (the reconfigure starts it, too, but
    // after its delay). Not in this update: a listener may not dispatch.
    if (next === 'fountain') queueMicrotask(relint);
  }

  function setReadOnly(on: boolean) {
    if (on === locked.value) return;
    locked.value = on;
    view.dispatch({ effects: readOnly.reconfigure(readOnlyExtension(on)) });
  }

  function onState(listener: (state: EditorState) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function onUpdate(listener: (state: EditorState) => void) {
    updateListeners.add(listener);
    return () => updateListeners.delete(listener);
  }

  function goto(offset: number, options: { select?: Span } = {}) {
    const length = view.state.doc.length;
    const clamp = (n: number) => Math.min(length, Math.max(0, n));
    const { select } = options;
    const anchor = clamp(select ? select.from : offset);
    const head = clamp(select ? select.to : offset);
    view.dispatch({ selection: { anchor, head } });

    if (window.matchMedia(WIDE_QUERY).matches) {
      const held = document.activeElement?.closest<HTMLElement>('[data-pane]')?.dataset.pane;
      const from: PaneId | undefined = held === 'left' || held === 'right' ? held : undefined;
      panes.tabs.value = revealTab(panes.tabs.value, 'source', from);
    } else {
      panes.phoneTab.value = 'source';
    }
    // The Source pane may have only just been chosen: scroll and focus once it's drawn.
    void nextTick().then(() => {
      view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
      view.focus();
    });
  }

  return {
    view,
    doc,
    cursor,
    template,
    locked,
    kind,
    load,
    setKind,
    setReadOnly,
    onState,
    onUpdate,
    goto,
  };
}

/** The editor, created on first use in the browser and kept for the visit. */
export function useEditor(): EditorSession {
  session ??= create();
  return session;
}
