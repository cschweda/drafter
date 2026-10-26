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
  const { view, doc, kind, loaded } = useEditor();
  const tree = shallowRef<MdNode | null>(null);
  const counted = ref(0);
  const updating = ref(false);
  /** Another script was loaded since the tree was made: its preview is not this one's. */
  let treeFor = loaded.value;
  /** Counts refreshes, so a parser that arrives late can tell the text has moved on. */
  let generation = 0;
  /** The CommonMark parser (`mdast-util-from-markdown`), downloaded when a document first needs it. */
  let parser: typeof import('./parse') | undefined;
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
    const mine = generation;
    const draw = (parse: (source: string) => MdNode) => {
      const next = parse(view.state.doc.toString());
      tree.value = next;
      counted.value = countWords(next);
      updating.value = false;
    };
    if (parser) {
      draw(parser.parseMarkdown);
      return;
    }
    // The parser arrives with the first Markdown document; the pane says so meanwhile.
    updating.value = true;
    import('./parse').then(
      (module) => {
        parser = module;
        if (mine === generation) draw(module.parseMarkdown);
      },
      (error) => {
        console.error(
          `Markdown parser failed to load: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (mine === generation) updating.value = false;
      },
    );
  }

  function refresh() {
    clearTimeout(timer);
    generation++;
    if (loaded.value !== treeFor) {
      // A script was loaded: the last one's preview and words go now, not when the new ones arrive.
      treeFor = loaded.value;
      tree.value = null;
      counted.value = 0;
    }
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
    watch([doc, kind, loaded], refresh, { immediate: true });
  });

  return { tree, words: computed(() => counted.value), updating };
}

/** The Markdown document's parse, for the Preview and the word count: created on first use, kept for the visit. */
export function useMarkdown(): MarkdownSession {
  session ??= create();
  return session;
}
