import type { SceneSlot } from '@drafter/history';
import { snapshotText } from '../storage/snapshots';
import type { HistoryReply, HistoryRequest } from './protocol';

// The talk with the history worker (version-history design §3.4, Call 9). One worker, made on the
// first request of a view (Deleted scenes, History of this scene) and ended when the last view
// releases, as Compare's layout worker is. Each request hears only its own replies.

type Scan = Extract<HistoryRequest, { kind: 'deleted' | 'versions' | 'place' }>;
/** A scan as a view asks for it: the client numbers it. */
export type HistoryAsk = Scan extends infer R ? (R extends Scan ? Omit<R, 'seq'> : never) : never;

export interface HistoryClient {
  /**
   * Sends a scan and returns its number; `on` hears its replies until the last (or an error).
   * There is one listener per kind across every view of the worker: a newer request of a kind,
   * from any view, stops the older (the worker's lane) and the older's `on` hears nothing more.
   */
  request(ask: HistoryAsk, on: (reply: HistoryReply) => void): number;
  /** This view is done: its scans still running are cancelled, and the last view ends the worker. */
  release(): void;
}

type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>;

interface Listening {
  view: object;
  kind: Scan['kind'];
  on: (reply: HistoryReply) => void;
}

const STOPPED = 'The history worker stopped.';

/** Views of one worker, made by `make` when needed (tests pass a fake). */
export function createHistoryClients(make: () => WorkerLike) {
  let worker: WorkerLike | null = null;
  let seq = 0;
  const views = new Set<object>();
  const listening = new Map<number, Listening>();

  const fail = (message: string) => {
    const all = [...listening];
    listening.clear();
    end();
    for (const [n, { on }] of all) on({ seq: n, kind: 'error', message });
  };

  function end() {
    worker?.terminate();
    worker = null;
  }

  function start(): WorkerLike | null {
    if (worker) return worker;
    try {
      const made = make();
      made.addEventListener('message', (event) => {
        if (made !== worker) return;
        const reply = (event as MessageEvent<HistoryReply>).data;
        const to = listening.get(reply.seq);
        if (!to) return;
        if (
          reply.kind === 'error' ||
          reply.kind === 'place' ||
          (reply.kind !== 'progress' && reply.done)
        )
          listening.delete(reply.seq);
        to.on(reply);
      });
      const stopped = () => {
        if (made === worker) fail(STOPPED);
      };
      made.addEventListener('error', stopped);
      made.addEventListener('messageerror', stopped);
      worker = made;
      return made;
    } catch (error) {
      // A browser that blocks module workers: every request gets an error, after it is returned.
      const message = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => fail(message));
      return null;
    }
  }

  return {
    use(): HistoryClient {
      const view = {};
      views.add(view);
      return {
        request(ask, on) {
          views.add(view);
          const mine = ++seq;
          // The worker stops the older scan of this kind, which so has no last reply.
          for (const [n, l] of listening) if (l.kind === ask.kind) listening.delete(n);
          listening.set(mine, { view, kind: ask.kind, on });
          const to = start();
          if (!to) return mine;
          try {
            to.postMessage({ ...ask, seq: mine } as HistoryRequest);
          } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
          }
          return mine;
        },
        release() {
          for (const [n, l] of listening) {
            if (l.view !== view) continue;
            listening.delete(n);
            try {
              worker?.postMessage({ seq: n, kind: 'cancel' } satisfies HistoryRequest);
            } catch {
              // A worker that can't be posted to is ended below or by its error.
            }
          }
          views.delete(view);
          if (views.size === 0) end();
        },
      };
    },
  };
}

let shared: ReturnType<typeof createHistoryClients> | null = null;

/** A view's client of the history worker; `release` it when the view closes. */
export function useHistoryClient(): HistoryClient {
  shared ??= createHistoryClients(
    () => new Worker(new URL('../workers/history.worker.ts', import.meta.url), { type: 'module' }),
  );
  return shared.use();
}

/** The text of one snapshot's scene, for Show text, Put back, and Use this version (main thread, one gunzip). */
export async function sceneText(
  snapshotId: string,
  slot: Pick<SceneSlot, 'from' | 'to'>,
): Promise<string | null> {
  const text = await snapshotText(snapshotId);
  if (text === null || slot.to > text.length || slot.from > slot.to) return null;
  return text.slice(slot.from, slot.to);
}
