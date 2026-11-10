import type { PageMarks } from '@drafter/compare';
import { applyMarks, type Layout, type Marks } from '@drafter/layout';
import type { LockedPage, ProductionSet } from '@drafter/production';
import type { Template } from '@drafter/templates';

/** Show changes' baseline (version-history design §4.2): its id, and its text when the id is new. */
export type LayoutBaseline = { id: number; text?: string };

/**
 * What a locked script's pages and revision marks are made from (production design §6.2, §7.2):
 * the open set's baseline text (decoded on the main thread), the locked page map, the closed sets,
 * and the open set's name.
 */
export type LayoutProductionFacts = {
  baseline: string;
  pages: LockedPage[];
  closed: ProductionSet[];
  open: string;
  /** The scene numbers the lock has issued, so a new scene shows its A-number. */
  numbers: readonly string[];
};

/** A locked script's production, as Show changes' baseline is sent: its id, and its facts when the id is new. */
export type LayoutProduction = { id: number; locked?: LayoutProductionFacts };

/**
 * What the main thread sends the layout worker: the whole text, so the worker's copy never drifts,
 * Show changes' baseline while it is on, and a locked script's production.
 */
export type LayoutRequest = {
  seq: number;
  source: string;
  template: Template;
  baseline?: LayoutBaseline;
  production?: LayoutProduction;
};
/**
 * A layout, then (with a baseline) Show changes' marks and (with a production) the revision marks
 * of the same request; or what went wrong.
 */
export type LayoutReply =
  | { seq: number; layout: Layout }
  | { seq: number; marks: PageMarks }
  | { seq: number; production: Marks }
  | { seq: number; error: string };

export interface LayoutClient {
  /**
   * Sends the newest text 50 ms after the last call (trailing debounce). Returns the request's
   * number. With `baseline`, the worker answers the marks too; its text is sent only when its id
   * isn't the one sent last. With `production`, the layout is of the locked pages and the worker
   * answers the revision marks too; its facts are sent, like the baseline's text, only for a new id,
   * and its layout is given to `onLayout` once, with the marks on its lines (`LayoutLine.mark`), or
   * without them if they haven't come within PRODUCTION_WAIT_MS.
   */
  request(
    source: string,
    template: Template,
    baseline?: { id: number; text: string },
    production?: { id: number; facts: LayoutProductionFacts },
  ): number;
  destroy(): void;
}

/** The pause in typing after which the text goes to the worker. */
export const DEBOUNCE_MS = 50;

/**
 * How long a locked script's layout waits for its revision marks before it is shown without them:
 * a safety net, since the worker always answers them.
 */
export const PRODUCTION_WAIT_MS = 1000;

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
  /** The requests sent with a production, whose layouts wait for their revision marks. */
  const locked = new Set<number>();
  /**
   * A locked script's layout waiting for its revision marks, and Show changes' marks if they came
   * first: it is shown once, already marked, so no page is drawn twice and no watcher runs twice.
   * A newer layout replaces it.
   */
  let pending: { seq: number; layout: Layout; marks?: PageMarks } | null = null;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  /** The baseline id whose text the worker has. */
  let sentBaseline: number | null = null;
  /** The production id whose facts the worker has. */
  let sentProduction: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const show = (layout: Layout, at: number, marks?: PageMarks) => {
    shown = at;
    onLayout(layout, at);
    if (marks) onMarks(marks, at);
  };
  const drop = () => {
    clearTimeout(waiting);
    pending = null;
  };

  worker.addEventListener('message', (event) => {
    if (destroyed) return;
    const reply = (event as MessageEvent<LayoutReply>).data;
    if ('error' in reply) {
      onError(reply.error, reply.seq);
      return;
    }
    if ('marks' in reply) {
      // Marks are of their own layout's text: only the shown layout's are any use, or the waiting one's.
      if (pending?.seq === reply.seq) pending.marks = reply.marks;
      else if (reply.seq === shown) onMarks(reply.marks, reply.seq);
      return;
    }
    if ('production' in reply) {
      if (pending?.seq !== reply.seq) return;
      const { layout, marks } = pending;
      drop();
      show(applyMarks(layout, reply.production), reply.seq, marks);
      return;
    }
    // A slower, older reply must not replace a newer layout, shown or waiting.
    if (reply.seq <= shown || (pending && reply.seq <= pending.seq)) return;
    drop();
    for (const old of locked) if (old < reply.seq) locked.delete(old);
    if (!locked.delete(reply.seq)) {
      show(reply.layout, reply.seq);
      return;
    }
    pending = { seq: reply.seq, layout: reply.layout };
    waiting = setTimeout(() => {
      if (!pending || destroyed) return;
      const { layout, seq: at, marks } = pending;
      pending = null;
      show(layout, at, marks);
    }, PRODUCTION_WAIT_MS);
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
    request(source, template, baseline, production) {
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
        if (production) {
          message.production =
            production.id === sentProduction
              ? { id: production.id }
              : { id: production.id, locked: production.facts };
          sentProduction = production.id;
          locked.add(mine);
        }
        worker.postMessage(message);
      }, DEBOUNCE_MS);
      return mine;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      drop();
      worker.terminate();
    },
  };
}
