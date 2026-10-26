import { type ComputedRef, computed, effectScope, shallowRef, watch } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useMarkdown } from '../markdown/use-markdown';
import { type Counts, countScript } from './count';
import type { KnownCounts } from './goal';

export interface CountsSession {
  /**
   * The open script's counts: pages, scenes, words, and minutes for a screenplay; null for a
   * Markdown document, which has words only (`words`).
   */
  counts: Readonly<ComputedRef<Counts | null>>;
  /** What is known right now: null for a count that isn't there yet (a layout on its way, a Markdown document not yet read). */
  known: Readonly<ComputedRef<KnownCounts>>;
  /** The pages are those of the open script, not of the one before it. */
  pagesKnown: Readonly<ComputedRef<boolean>>;
}

let session: CountsSession | undefined;

function create(): CountsSession {
  const editor = useEditor();
  const layout = useLayout();
  const markdown = useMarkdown();

  // The layout on hand belongs to the script that was open (or to the text before it was Markdown)
  // until one asked for after the change comes back: the module host's guard, kept here too.
  // Synchronous watchers, so the floor is set before the layout's own watcher asks again.
  let floor = 0;
  const raise = () => {
    floor = layout.requestedSeq() + 1;
    version.value++;
  };
  const version = shallowRef(0);
  effectScope(true).run(() => {
    editor.onChange((changes) => {
      if (changes === null) raise();
    });
    watch(editor.kind, raise, { flush: 'sync' });
  });

  const pagesKnown = computed(() => {
    version.value;
    return (
      editor.kind.value !== 'markdown' &&
      layout.shownSeq.value >= floor &&
      layout.layout.value !== null
    );
  });

  const counts = computed<Counts | null>(() => {
    if (editor.kind.value === 'markdown') return null;
    return countScript(editor.doc.value, pagesKnown.value ? layout.layout.value : null);
  });

  const known = computed<KnownCounts>(() => {
    if (editor.kind.value === 'markdown') {
      // A long document's words arrive from the worker; until its tree has, they are the last one's.
      return { pages: null, words: markdown.tree.value ? markdown.words.value : null };
    }
    const now = counts.value as Counts;
    return { pages: pagesKnown.value ? now.pages : null, words: now.words };
  });

  return { counts, known, pagesKnown };
}

/** The counts of the open script: created on first use in the browser, kept for the visit. */
export function useCounts(): CountsSession {
  session ??= create();
  return session;
}
