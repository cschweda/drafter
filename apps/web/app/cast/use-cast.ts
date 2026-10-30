import { type Cast, castOf } from '@drafter/cast';
import { linesPerPage, type SceneIndex } from '@drafter/outline';
import { effectScope, type ShallowRef, shallowRef, watch } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useOutline } from '../outline/use-outline';
import { useWordAnswers } from './words';

// The cast session (seeing-the-script design §3.7, Calls 6 and 48): the cast of the editor's
// script, worked out on the main thread only while at least one view holds it (`need`), in an idle
// moment CAST_PAUSE_MS after the parse, the layout, or the dictionary's answers last changed. The
// last cast is kept until then, so a view never empties while the writer types; and while the
// layout lags an edit (the index has no pages for a moment), the last pages-based cast is kept,
// as the Structure strip keeps its last view (`nextView`). Shared by the Stats tab and Scaffold.

/** The pause after the last change before the cast is worked out again. */
export const CAST_PAUSE_MS = 300;

export interface CastSession {
  /** The newest cast; null until a view has first needed it, and after another script is opened. */
  cast: Readonly<ShallowRef<Cast | null>>;
  /** A view holds the cast while it is shown; the returned function lets go (once). */
  need(): () => void;
}

/** Whether `index` has its pages, so the figures that need them can be had. */
const hasPages = (index: SceneIndex, perPage: number | null) =>
  perPage !== null && index.scenes.length > 0 && index.scenes.every((s) => s.pages !== null);

type Idle = (callback: () => void) => () => void;

/** `requestIdleCallback` (within a second), or a timer where the browser has none. */
const whenIdle: Idle = (callback) => {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback, { timeout: 1000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, 0);
  return () => clearTimeout(handle);
};

let session: CastSession | undefined;

function create(): CastSession {
  const editor = useEditor();
  const { layout, failed, updating } = useLayout();
  const outline = useOutline();
  const words = useWordAnswers();
  const cast = shallowRef<Cast | null>(null);
  /** The last cast was worked out with pages. */
  let paged = false;
  /** How many views hold the cast. */
  let holders = 0;
  /** Something has changed since the last cast. */
  let stale = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    cancelIdle?.();
    cancelIdle = undefined;
  };

  function compute() {
    cancelIdle = undefined;
    if (holders === 0) return;
    stale = false;
    const index = outline.index.value;
    const perPage = linesPerPage(layout.value);
    const nextPaged = hasPages(index, perPage);
    // The layout is catching up with an edit: the last pages-based cast stands until it does. (A
    // script with no scenes, or a Markdown document, has no pages to wait for; nor has a scene
    // left without pages while the layout is working on nothing, so the cast goes on without.)
    const lagging = !nextPaged && updating.value && !failed.value && index.scenes.length > 0;
    if (cast.value && paged && lagging && editor.kind.value !== 'markdown') return;
    const next = castOf(index, editor.doc.value, editor.template.value, perPage, words.isWord);
    cast.value = next;
    paged = nextPaged;
    words.ask(next.characters.map((c) => c.name));
  }

  /** Works the cast out in an idle moment, after the pause unless `now`. */
  function schedule(now: boolean) {
    cancel();
    const idle = () => {
      timer = undefined;
      cancelIdle = whenIdle(compute);
    };
    if (now) idle();
    else timer = setTimeout(idle, CAST_PAUSE_MS);
  }

  effectScope(true).run(() => {
    watch(
      [editor.doc, editor.template, editor.kind, layout, failed, updating, words.version],
      () => {
        stale = true;
        // With no cast to show (another script was opened), there is no pause to wait out.
        if (holders > 0) schedule(cast.value === null);
      },
    );
  });
  // Another script: nothing of the last one's cast is kept.
  editor.onChange((changes) => {
    if (changes !== null) return;
    cast.value = null;
    paged = false;
    stale = true;
  });

  return {
    cast,
    need() {
      holders++;
      // A view opening shows the cast as soon as it can: no pause to wait out.
      if (holders === 1 && (stale || cast.value === null)) schedule(true);
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holders--;
        if (holders === 0) cancel();
      };
    },
  };
}

/** The cast session: made on first use in the browser, kept for the visit. */
export function useCast(): CastSession {
  session ??= create();
  return session;
}
