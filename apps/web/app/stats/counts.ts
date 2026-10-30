import { type ComputedRef, computed, effectScope, type ShallowRef, shallowRef, watch } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { useMarkdown } from '../markdown/use-markdown';
import { type Counts, countScript } from './count';
import type { KnownCounts } from './goal';

export interface CountsSession {
  /**
   * The open script's counts: pages, scenes, words, and timing for a screenplay; null for a
   * Markdown document, which has words only (`words`).
   */
  counts: Readonly<ComputedRef<Counts | null>>;
  /** What is known right now: null for a count that isn't there yet (a layout on its way, a Markdown document not yet read). */
  known: Readonly<ComputedRef<KnownCounts>>;
  /**
   * `known` as of the last pause in typing: what the status bar and the daily goal read, so a key
   * costs no count of the whole script. It catches up `STEADY_MS` after the last edit (or layout,
   * or Markdown word count), and at once when another script is loaded or the kind changes, so it
   * never holds the last script's counts. The object is the same until a count changes.
   */
  steady: Readonly<ShallowRef<KnownCounts>>;
  /** The pages are those of the open script, not of the one before it. */
  pagesKnown: Readonly<ComputedRef<boolean>>;
}

/** The pause in typing after which `steady` catches up: CodeMirror's lint waits as long. */
export const STEADY_MS = 300;

const sameCounts = (a: KnownCounts, b: KnownCounts) => a.pages === b.pages && a.words === b.words;

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
    return countScript(
      editor.doc.value,
      pagesKnown.value ? layout.layout.value : null,
      editor.template.value,
    );
  });

  // The same object while the counts are the same, so what watches them hears of a change only.
  const known = computed<KnownCounts>((last) => {
    let next: KnownCounts;
    if (editor.kind.value === 'markdown') {
      // A long document's words arrive from the worker; until its tree has, they are the last one's.
      next = { pages: null, words: markdown.tree.value ? markdown.words.value : null };
    } else {
      const now = counts.value as Counts;
      next = { pages: pagesKnown.value ? now.pages : null, words: now.words };
    }
    return last && sameCounts(last, next) ? last : next;
  });

  const steady = shallowRef<KnownCounts>(known.value);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Brings `steady` up to date now: the one place a pause counts the whole script. */
  function settle() {
    clearTimeout(timer);
    timer = undefined;
    const next = known.value;
    if (!sameCounts(next, steady.value)) steady.value = next;
  }
  function later() {
    clearTimeout(timer);
    timer = setTimeout(settle, STEADY_MS);
  }

  effectScope(true).run(() => {
    // An edit waits for the pause; a load is another script, whose counts are wanted at once.
    editor.onChange((changes) => {
      if (changes !== null) return later();
      raise();
      settle();
    });
    watch(
      editor.kind,
      () => {
        raise();
        settle();
      },
      { flush: 'sync' },
    );
    // A layout, or a long Markdown document's words, coming back. Only references are compared:
    // nothing is counted until the pause.
    watch([layout.layout, layout.shownSeq, markdown.tree, () => markdown.words.value], later, {
      flush: 'sync',
    });
  });

  return { counts, known, steady, pagesKnown };
}

/** The counts of the open script: created on first use in the browser, kept for the visit. */
export function useCounts(): CountsSession {
  session ??= create();
  return session;
}
