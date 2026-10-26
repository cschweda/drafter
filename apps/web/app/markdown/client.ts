import type { MarkdownReply, MarkdownRequest } from './compute';
import { PREVIEW_DELAY_MS } from './preview';
import type { MdNode } from './render';

export interface MarkdownClient {
  /** Sends the newest text after a pause in typing (trailing debounce). Returns the request's number. */
  request(source: string): number;
  destroy(): void;
}

/**
 * The talk with the Markdown worker, like the layout worker's: one request per pause in typing, an
 * older reply never replaces a newer one, and a worker that fails is reported once.
 */
export function createMarkdownClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  onTree: (tree: MdNode, words: number, seq: number) => void,
  onError: (message: string, seq: number) => void,
  delay = PREVIEW_DELAY_MS,
): MarkdownClient {
  let seq = 0;
  let shown = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  worker.addEventListener('message', (event) => {
    if (destroyed) return;
    const reply = (event as MessageEvent<MarkdownReply>).data;
    if ('error' in reply) {
      onError(reply.error, reply.seq);
      return;
    }
    if (reply.seq <= shown) return;
    shown = reply.seq;
    onTree(reply.tree, reply.words, reply.seq);
  });
  const failed = (message: string) => () => {
    if (!destroyed) onError(message, seq);
  };
  worker.addEventListener('error', failed('The Markdown worker failed.'));
  worker.addEventListener(
    'messageerror',
    failed('The Markdown worker sent a reply that could not be read.'),
  );

  return {
    request(source) {
      const mine = ++seq;
      clearTimeout(timer);
      timer = setTimeout(() => {
        worker.postMessage({ seq: mine, source } satisfies MarkdownRequest);
      }, delay);
      return mine;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
