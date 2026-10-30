import type { PageMarks } from '@drafter/compare';
import type { Layout } from '@drafter/layout';
import type { Template } from '@drafter/templates';

/** Show changes' baseline (version-history design §4.2): its id, and its text when the id is new. */
export type LayoutBaseline = { id: number; text?: string };

/**
 * What the main thread sends the layout worker: the whole text, so the worker's copy never drifts,
 * and Show changes' baseline while it is on.
 */
export type LayoutRequest = {
  seq: number;
  source: string;
  template: Template;
  baseline?: LayoutBaseline;
};
/** A layout, then (with a baseline) the marks of the same request; or what went wrong. */
export type LayoutReply =
  | { seq: number; layout: Layout }
  | { seq: number; marks: PageMarks }
  | { seq: number; error: string };

export interface LayoutClient {
  /**
   * Sends the newest text 50 ms after the last call (trailing debounce). Returns the request's
   * number. With `baseline`, the worker answers the marks too; its text is sent only when its id
   * isn't the one sent last.
   */
  request(source: string, template: Template, baseline?: { id: number; text: string }): number;
  destroy(): void;
}

/** The pause in typing after which the text goes to the worker. */
export const DEBOUNCE_MS = 50;

export function createLayoutClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  onLayout: (layout: Layout, seq: number) => void,
  /** Called with the worker's message when a layout failed, or with a description if the worker itself fails. */
  onError: (message: string, seq: number) => void = () => {},
  /** Called with a layout's marks, only for the layout shown last (`onLayout`'s newest). */
  onMarks: (marks: PageMarks, seq: number) => void = () => {},
): LayoutClient {
  let seq = 0;
  let shown = 0;
  /** The baseline id whose text the worker has. */
  let sentBaseline: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  worker.addEventListener('message', (event) => {
    if (destroyed) return;
    const reply = (event as MessageEvent<LayoutReply>).data;
    if ('error' in reply) {
      onError(reply.error, reply.seq);
      return;
    }
    if ('marks' in reply) {
      // Marks are of their own layout's text: only the shown layout's are any use.
      if (reply.seq === shown) onMarks(reply.marks, reply.seq);
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
    request(source, template, baseline) {
      const mine = ++seq;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const message: LayoutRequest = { seq: mine, source, template };
        if (baseline) {
          message.baseline =
            baseline.id === sentBaseline
              ? { id: baseline.id }
              : { id: baseline.id, text: baseline.text };
          sentBaseline = baseline.id;
        }
        worker.postMessage(message);
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
