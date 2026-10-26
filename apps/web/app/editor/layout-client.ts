import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';

/** What the main thread sends the layout worker: the whole text, so the worker's copy never drifts. */
export type LayoutRequest = { seq: number; source: string; template: Template };
export type LayoutReply = { seq: number; layout: Layout } | { seq: number; error: string };

export interface LayoutClient {
  /** Sends the newest text 50 ms after the last call (trailing debounce). Returns the request's number. */
  request(source: string, template: Template): number;
  destroy(): void;
}

/** The pause in typing after which the text goes to the worker. */
export const DEBOUNCE_MS = 50;

export function createLayoutClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  onLayout: (layout: Layout, seq: number) => void,
  /** Called with the worker's message when a layout failed, or with a description if the worker itself fails. */
  onError: (message: string, seq: number) => void = () => {},
): LayoutClient {
  let seq = 0;
  let shown = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  worker.addEventListener('message', (event) => {
    if (destroyed) return;
    const reply = (event as MessageEvent<LayoutReply>).data;
    if ('error' in reply) {
      onError(reply.error, reply.seq);
      return;
    }
    // A slower, older reply must not replace a newer layout.
    if (reply.seq <= shown) return;
    shown = reply.seq;
    onLayout(reply.layout, reply.seq);
  });
  const failed = (message: string) => () => {
    if (!destroyed) onError(message, seq);
  };
  worker.addEventListener('error', failed('The layout worker failed.'));
  worker.addEventListener(
    'messageerror',
    failed('The layout worker sent a reply that could not be read.'),
  );

  return {
    request(source, template) {
      const mine = ++seq;
      clearTimeout(timer);
      timer = setTimeout(() => {
        worker.postMessage({ seq: mine, source, template } satisfies LayoutRequest);
      }, DEBOUNCE_MS);
      return mine;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
