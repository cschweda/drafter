import { type Ref, ref, shallowRef } from 'vue';
import type { Result } from 'w1913';
import { desktop } from '../desktop';
import { closeTempTab, showTempTab, tempTabShown } from '../drafts/tabs';
import type {
  DefinitionsReply,
  DefinitionsRequest,
  Suggestion,
} from '../workers/definitions-compute';
import { lookupWord } from '../workers/definitions-compute';
import { DEFINITIONS_PATH, DEFINITIONS_SOURCE } from './source';
import { hasDefinitions, removeDefinitions, saveDefinitions } from './store';

// Definitions' session (definitions design §7): whether the dictionary is downloaded, the
// download itself (drafter.dev fetches its own copy; the desktop's main process fetches GitHub's),
// the Definitions tab, which exists only while open (placed as Cuts is), and the lookups, which a
// worker answers. The worker holds the dictionary (about 90 MB once parsed) and is ended after
// `IDLE_MS` without a question, which gives the memory back; the next question makes another.

export const DEFINITIONS_TAB = { id: 'definitions', label: 'Definitions' } as const;

/** How long the worker is kept with nothing asked (definitions design §7.3). */
export const IDLE_MS = 5 * 60_000;

/** Where the dictionary stands: not known yet, not downloaded, downloading, or ready. */
export type DefinitionsState = 'unknown' | 'absent' | 'downloading' | 'ready';

export interface DefinitionsSession {
  state: Readonly<Ref<DefinitionsState>>;
  /** While downloading: 0 to 1. */
  progress: Readonly<Ref<number>>;
  /** The last download's or lookup's failure, in words for the writer; '' when none. */
  problem: Ref<string>;
  isOpen: Readonly<Ref<boolean>>;
  /** What the panel's search field holds. */
  query: Ref<string>;
  /** The last lookup: its word, and the entry or null for a word not in the dictionary. */
  shown: Readonly<Ref<{ word: string; result: Result | null } | null>>;
  /** A lookup under way. */
  busy: Readonly<Ref<boolean>>;
  /** Reads the state from storage (once is enough; the session keeps it after). */
  refresh(): Promise<void>;
  download(): Promise<void>;
  cancel(): void;
  remove(): Promise<void>;
  /** Opens the tab, looking `word` up if one is given (focusing the panel unless told not to). */
  open(word?: string, focusPanel?: boolean): void;
  close(refocus?: boolean): void;
  /** Whether a pane shows the tab now. */
  showing(): boolean;
  /** Looks `word` up and shows it. */
  lookUp(word: string): Promise<void>;
  /** Headwords starting with `prefix` (at most `limit`); none before a download. */
  suggest(prefix: string, limit?: number): Promise<Suggestion[]>;
}

/** A question for the worker, before it is numbered. */
type Question = DefinitionsRequest extends infer R
  ? R extends DefinitionsRequest
    ? Omit<R, 'seq'>
    : never
  : never;

let shared: DefinitionsSession | undefined;

function create(): DefinitionsSession {
  const state = ref<DefinitionsState>('unknown');
  const progress = ref(0);
  const problem = ref('');
  const isOpen = ref(false);
  const query = ref('');
  const shown = shallowRef<{ word: string; result: Result | null } | null>(null);
  const busy = ref(false);

  // The worker, made on the first question and ended when idle.
  let worker: Worker | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const waiting = new Map<number, (reply: DefinitionsReply) => void>();
  const endWorker = () => {
    clearTimeout(idle);
    worker?.terminate();
    worker = null;
    for (const [n, done] of waiting) done({ type: 'failed', seq: n, message: 'Stopped.' });
    waiting.clear();
  };
  const ask = (request: Question): Promise<DefinitionsReply> => {
    if (!worker) {
      worker = new Worker(new URL('../workers/definitions.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.addEventListener('message', (event: MessageEvent<DefinitionsReply>) => {
        const done = waiting.get(event.data.seq);
        waiting.delete(event.data.seq);
        done?.(event.data);
      });
      worker.addEventListener('error', () => endWorker());
    }
    clearTimeout(idle);
    idle = setTimeout(endWorker, IDLE_MS);
    const n = ++seq;
    return new Promise((resolve) => {
      waiting.set(n, resolve);
      worker?.postMessage({ ...request, seq: n } as DefinitionsRequest);
    });
  };

  let controller: AbortController | null = null;

  async function refresh() {
    try {
      state.value = (await hasDefinitions()) ? 'ready' : 'absent';
    } catch {
      state.value = 'absent';
    }
  }

  /** drafter.dev's copy, from its own origin, read with progress. */
  async function fetchOwn(signal: AbortSignal): Promise<Uint8Array> {
    const response = await fetch(DEFINITIONS_PATH, { signal, cache: 'no-store' });
    if (!response.ok || !response.body)
      throw new Error('Couldn’t download the dictionary. Try again.');
    const bytes = new Uint8Array(DEFINITIONS_SOURCE.size);
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > bytes.byteLength)
        throw new Error('The dictionary isn’t the expected file.');
      bytes.set(value, received);
      received += value.byteLength;
      progress.value = received / bytes.byteLength;
    }
    return bytes.subarray(0, received);
  }

  async function download() {
    if (state.value === 'downloading') return;
    problem.value = '';
    progress.value = 0;
    state.value = 'downloading';
    const bridge = desktop()?.definitions;
    controller = new AbortController();
    try {
      const bytes = bridge
        ? await bridge.download((received, total) => {
            progress.value = total > 0 ? received / total : 0;
          })
        : await fetchOwn(controller.signal);
      await saveDefinitions(bytes);
      endWorker();
      state.value = 'ready';
      // The word that was waiting for the download, looked up now.
      if (isOpen.value && query.value) void lookUp(query.value);
    } catch (error) {
      state.value = 'absent';
      const cancelled =
        controller?.signal.aborted || (error instanceof Error && error.message === 'Cancelled.');
      problem.value = cancelled
        ? ''
        : error instanceof Error && error.message
          ? error.message
          : 'Couldn’t download the dictionary. Try again.';
    } finally {
      controller = null;
    }
  }

  async function lookUp(text: string) {
    const word = lookupWord(text);
    if (!word) return;
    query.value = word;
    problem.value = '';
    busy.value = true;
    try {
      const reply = await ask({ type: 'lookup', word });
      if (reply.type === 'missing') {
        state.value = 'absent';
        shown.value = null;
      } else if (reply.type === 'failed') {
        problem.value =
          'Couldn’t read the dictionary. Remove it in Settings and download it again.';
      } else if (reply.type === 'result') {
        state.value = 'ready';
        shown.value = { word, result: reply.result };
      }
    } finally {
      busy.value = false;
    }
  }

  return {
    state,
    progress,
    problem,
    isOpen,
    query,
    shown,
    busy,
    refresh,
    download,
    cancel() {
      controller?.abort();
      desktop()?.definitions?.cancel();
    },
    async remove() {
      endWorker();
      await removeDefinitions();
      shown.value = null;
      state.value = 'absent';
    },
    open(word, focusPanel = true) {
      isOpen.value = true;
      if (state.value === 'unknown') void refresh();
      showTempTab(DEFINITIONS_TAB.id, focusPanel);
      if (word) void lookUp(word);
    },
    close(refocus = false) {
      if (!isOpen.value) return;
      closeTempTab(DEFINITIONS_TAB.id, refocus);
      isOpen.value = false;
    },
    showing: () => isOpen.value && tempTabShown(DEFINITIONS_TAB.id),
    lookUp,
    async suggest(prefix, limit = 8) {
      if (state.value !== 'ready' || !prefix.trim()) return [];
      const reply = await ask({ type: 'suggest', prefix, limit });
      return reply.type === 'suggestions' ? reply.suggestions : [];
    },
  };
}

/** Definitions: made on first use in the browser and kept for the visit. */
export function useDefinitions(): DefinitionsSession {
  shared ??= create();
  return shared;
}
