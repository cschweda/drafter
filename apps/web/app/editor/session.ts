import { EditorState, type Extension, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { type CursorElement, cursorElement, parsedDoc } from '@drafter/cm-fountain';
import { type Doc, parse, type Span } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { nextTick, type ShallowRef, shallowRef } from 'vue';
import screenplay from '#samples/screenplay.fountain?raw';
import { usePanes } from '~/composables/usePanes';
import { type PaneId, revealTab, WIDE_QUERY } from '~/utils/panes';
import { editorExtensions } from './extensions';
import { templateIdOf } from './template';

export interface EditorSession {
  /** The one editor, created once on the client. */
  readonly view: EditorView;
  /** `parsedDoc` after every change. */
  readonly doc: Readonly<ShallowRef<Doc>>;
  readonly cursor: Readonly<ShallowRef<CursorElement | null>>;
  /** The built-in that `templateIdOf(doc)` names (technical design §8.6); Plan 4 adds the switcher that writes it. */
  readonly template: Readonly<ShallowRef<Template>>;
  /** Selects `select` (default: the offset), scrolls it into view, shows the Source tab, and focuses the editor. */
  goto(offset: number, options?: { select?: Span }): void;
}

let session: EditorSession | undefined;

/**
 * Until the recovery copy exists (Plan 3, Task 4), the browser asks before the page closes while
 * the text differs from what the editor opened with. The handler is registered only then, so a
 * page with nothing to lose stays eligible for the back/forward cache.
 */
function guardUnsavedText(opened: Text): Extension {
  const ask = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers show their dialog only when this is set.
    event.returnValue = '';
  };
  let asking = false;
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const differs = !update.state.doc.eq(opened);
    if (differs === asking) return;
    asking = differs;
    if (differs) window.addEventListener('beforeunload', ask);
    else window.removeEventListener('beforeunload', ask);
  });
}

function create(): EditorSession {
  const doc = shallowRef<Doc>(parse(screenplay));
  const cursor = shallowRef<CursorElement | null>(null);
  const template = shallowRef<Template>(builtins[templateIdOf(doc.value)] as Template);
  const panes = usePanes();

  const state = EditorState.create({
    doc: screenplay,
    extensions: [
      guardUnsavedText(EditorState.create({ doc: screenplay }).doc),
      editorExtensions({
        template: () => template.value,
        onCursorElement: (element) => {
          cursor.value = element;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        doc.value = update.state.field(parsedDoc);
        const next = builtins[templateIdOf(doc.value)] as Template;
        if (next !== template.value) template.value = next;
      }),
    ],
  });
  const view = new EditorView({ state });

  doc.value = view.state.field(parsedDoc);
  // onCursorElement doesn't report the element the cursor starts in.
  cursor.value = cursorElement(view.state);

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

  return { view, doc, cursor, template, goto };
}

/** The editor, created on first use in the browser and kept for the visit. */
export function useEditor(): EditorSession {
  session ??= create();
  return session;
}
