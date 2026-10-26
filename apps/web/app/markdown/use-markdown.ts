import {
  type ComputedRef,
  computed,
  effectScope,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { useEditor } from '../editor/session';
import { createMarkdownClient, type MarkdownClient } from './client';
import { parseMarkdown } from './parse';
import { PREVIEW_DELAY_MS, previewDelay } from './preview';
import type { MdNode } from './render';
import { countWords } from './words';

export interface MarkdownSession {
  /** The parse of the document, a moment behind a long one; null when the document is not Markdown, or before the first parse of a long one. */
  tree: Readonly<ShallowRef<MdNode | null>>;
  /** The words in `tree`. */
  words: Readonly<ComputedRef<number>>;
  /** A long document's newest text has not come back from the worker yet. */
  updating: Readonly<Ref<boolean>>;
}

let session: MarkdownSession | undefined;

function create(): MarkdownSession {
  const { view, doc, kind } = useEditor();
  const tree = shallowRef<MdNode | null>(null);
  const counted = ref(0);
  const updating = ref(false);
  /** The request whose reply is wanted: a reply to any other is for text that has been typed over. */
  let wanted: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A long document is parsed in a worker, made when the first one needs it. A browser without
  // module workers, or one that blocks them, parses on the main thread instead, after the same pause.
  let client: MarkdownClient | null | undefined;
  let broken = false;
  function workerClient(): MarkdownClient | null {
    if (client !== undefined || broken) return broken ? null : (client ?? null);
    try {
      client = createMarkdownClient(
        new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), { type: 'module' }),
        (next, words, seq) => {
          if (seq !== wanted) return;
          tree.value = next;
          counted.value = words;
          updating.value = false;
        },
        (message) => {
          console.error(`Markdown preview failed: ${message}`);
          broken = true;
          client?.destroy();
          client = null;
          refresh();
        },
      );
    } catch {
      broken = true;
      client = null;
    }
    return client ?? null;
  }

  function showNow() {
    wanted = null;
    updating.value = false;
    const next = parseMarkdown(view.state.doc.toString());
    tree.value = next;
    counted.value = countWords(next);
  }

  function refresh() {
    clearTimeout(timer);
    if (kind.value !== 'markdown') {
      wanted = null;
      updating.value = false;
      tree.value = null;
      counted.value = 0;
      return;
    }
    // A short document follows each key. A long one waits for a pause, in the worker, so a key is
    // never held up by parsing a whole book.
    if (previewDelay(view.state.doc.length) === 0) {
      showNow();
      return;
    }
    const worker = workerClient();
    if (worker) {
      updating.value = true;
      wanted = worker.request(view.state.doc.toString());
    } else {
      wanted = null;
      timer = setTimeout(showNow, PREVIEW_DELAY_MS);
    }
  }

  // The session lives for the visit, so its watcher belongs to no component. `doc` changes with
  // every edit and every load, whatever the kind.
  effectScope(true).run(() => {
    watch([doc, kind], refresh, { immediate: true });
  });

  return { tree, words: computed(() => counted.value), updating };
}

/** The Markdown document's parse, for the Preview and the word count: created on first use, kept for the visit. */
export function useMarkdown(): MarkdownSession {
  session ??= create();
  return session;
}
