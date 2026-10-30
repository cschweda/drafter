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
import { PREVIEW_DELAY_MS, type PreviewProblem, previewDelay, previewProblem } from './preview';
import type { MdNode } from './render';
import { countWords, wordsIn } from './words';

export interface MarkdownSession {
  /** The parse of the document, a moment behind a long one; null when the document is not Markdown, or before the first parse of a long one. */
  tree: Readonly<ShallowRef<MdNode | null>>;
  /** The words in `tree`; for a document too deep to parse, the words of its plain text. */
  words: Readonly<ComputedRef<number>>;
  /** A long document's newest text has not come back from the worker yet. */
  updating: Readonly<Ref<boolean>>;
  /** Why the newest text can't be previewed, when no parse could read it (`tree` is null then); null otherwise. */
  problem: Readonly<Ref<PreviewProblem | null>>;
}

/** How many times the Markdown worker may fail in a visit before long documents parse on the main thread. */
const WORKER_FAILURES = 3;

let session: MarkdownSession | undefined;

function create(): MarkdownSession {
  const { view, doc, kind, loaded } = useEditor();
  const tree = shallowRef<MdNode | null>(null);
  const counted = ref(0);
  const updating = ref(false);
  const problem = ref<PreviewProblem | null>(null);
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
  // One text the worker can't parse is drawn on the main thread, and the worker is kept; a worker
  // that fails is made again for the next edit, up to WORKER_FAILURES times in a visit.
  let client: MarkdownClient | undefined;
  let failures = 0;
  function workerClient(): MarkdownClient | null {
    if (client) return client;
    if (failures >= WORKER_FAILURES) return null;
    try {
      const made = createMarkdownClient(
        new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), { type: 'module' }),
        (next, words, seq) => {
          if (seq !== wanted) return;
          tree.value = next;
          counted.value = words;
          updating.value = false;
          problem.value = null;
        },
        (message, seq, failed) => {
          console.error(`Markdown preview failed: ${message}`);
          if (failed) {
            failures++;
            made.destroy();
            if (client === made) client = undefined;
          }
          if (seq !== wanted) return;
          // A text nested too deeply for the worker's stack is too deep for the page's too: parsing
          // it again would only hold the page up. The Preview says why at once.
          if (!failed && previewProblem(message) === 'deep') {
            wanted = null;
            tree.value = null;
            counted.value = wordsIn(view.state.doc.toString());
            problem.value = 'deep';
            updating.value = false;
            return;
          }
          // The newest text is drawn on the main thread instead, this once.
          showNow();
        },
      );
      client = made;
    } catch {
      failures = WORKER_FAILURES;
      client = undefined;
    }
    return client ?? null;
  }

  function showNow() {
    wanted = null;
    const mine = generation;
    const draw = (parse: (source: string) => MdNode) => {
      // A text the parser can't read (nested thousands deep, say) is said so in the pane, never thrown.
      const text = view.state.doc.toString();
      try {
        const next = parse(text);
        tree.value = next;
        counted.value = countWords(next);
        problem.value = null;
      } catch (error) {
        tree.value = null;
        problem.value = previewProblem(error);
        // A document too deep to parse still has words: its plain text's.
        counted.value = problem.value === 'deep' ? wordsIn(text) : 0;
      }
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
      problem.value = null;
    }
    if (kind.value !== 'markdown') {
      wanted = null;
      updating.value = false;
      tree.value = null;
      counted.value = 0;
      problem.value = null;
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

  return { tree, words: computed(() => counted.value), updating, problem };
}

/** The Markdown document's parse, for the Preview and the word count: created on first use, kept for the visit. */
export function useMarkdown(): MarkdownSession {
  session ??= create();
  return session;
}
