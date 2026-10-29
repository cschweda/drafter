import type { Misspelling, SpellLanguage } from '@drafter/spell';
import type { SpellReply, SpellRequest } from '../workers/spell-compute';

/** The pause in typing after which the text goes to the spellcheck worker (Plan D, Call 5). */
export const SPELL_DEBOUNCE_MS = 300;

/** Off (the setting), the dictionary loading, ready, or failed to load (or the worker died). */
export type SpellState = 'off' | 'loading' | 'ready' | 'failed';

type CheckInput = Omit<Extract<SpellRequest, { type: 'check' }>, 'type' | 'seq'>;

export interface SpellClient {
  /** Loads `language`'s dictionary in the worker; the state is 'loading' until it answers. */
  language(language: SpellLanguage): void;
  /** Sends the text `delay` (SPELL_DEBOUNCE_MS) after the last call, or at once with no delay; returns the request's number. */
  check(input: CheckInput): number;
  /** At most five suggestions for `word`, asked at once; none when the worker can't answer. */
  suggest(word: string): Promise<string[]>;
  destroy(): void;
}

/**
 * The talk with the spellcheck worker, like the layout and Markdown workers': one check per pause
 * in typing, only the newest check's reply is shown, and a worker that fails (or can't be posted
 * to) is 'failed', never a throw.
 */
export function createSpellClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  /** Only the newest request's reply. */
  onMarks: (marks: Misspelling[], seq: number) => void,
  onState: (state: SpellState) => void,
  delay = SPELL_DEBOUNCE_MS,
): SpellClient {
  let seq = 0;
  /** The newest check's number: a reply to any other is for text that has been typed over. */
  let newest = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let state: SpellState | undefined;
  const asked = new Map<number, (suggestions: string[]) => void>();

  const tell = (next: SpellState) => {
    // Every failure is told, even one after another: a retry's failure must stop the caller again.
    if (destroyed || (next === state && next !== 'failed')) return;
    state = next;
    onState(next);
  };
  /** Every suggestion still waiting gets none. */
  const answerAll = () => {
    for (const resolve of asked.values()) resolve([]);
    asked.clear();
  };
  const fail = () => {
    answerAll();
    tell('failed');
  };
  const post = (message: SpellRequest): boolean => {
    if (destroyed) return false;
    try {
      worker.postMessage(message);
      return true;
    } catch {
      fail();
      return false;
    }
  };

  worker.addEventListener('message', (event) => {
    if (destroyed) return;
    const reply = (event as MessageEvent<SpellReply>).data;
    switch (reply.type) {
      case 'ready':
        tell('ready');
        break;
      case 'failed':
        fail();
        break;
      case 'checked':
        // A check that comes back means the dictionary is there.
        tell('ready');
        if (reply.seq === newest) onMarks(reply.marks, reply.seq);
        break;
      case 'suggestions':
        asked.get(reply.seq)?.(reply.suggestions);
        asked.delete(reply.seq);
        break;
    }
  });
  worker.addEventListener('error', () => {
    if (!destroyed) fail();
  });
  worker.addEventListener('messageerror', () => {
    if (!destroyed) fail();
  });

  return {
    language(language) {
      tell('loading');
      post({ type: 'language', language });
    },
    check(input) {
      const mine = ++seq;
      newest = mine;
      clearTimeout(timer);
      const send = () => post({ type: 'check', seq: mine, ...input });
      // With no delay (the caller took the pause itself) it goes now.
      if (delay > 0) timer = setTimeout(send, delay);
      else send();
      return mine;
    },
    suggest(word) {
      if (destroyed || state === 'failed') return Promise.resolve([]);
      const mine = ++seq;
      return new Promise((resolve) => {
        asked.set(mine, resolve);
        if (!post({ type: 'suggest', seq: mine, word })) {
          asked.delete(mine);
          resolve([]);
        }
      });
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      answerAll();
      worker.terminate();
    },
  };
}
