// Each call runs in a worker thread stopped at 10 seconds (§7.2), so a file that makes a reader
// slow can't hang the AI app. The worker is reused between calls, one call at a time, and
// replaced after a timeout or a crash. ('inline' runs calls in this thread, for tests.)
import { Worker } from 'node:worker_threads';
import type { Options } from './options';
import type { Root } from './roots';
import type { ToolName } from './tools/index';
import { handle } from './worker';

/** The worker's script and Node's flags for it, or 'inline'. */
export type WorkerSpec = { url: URL; execArgv: readonly string[] } | 'inline';

/** What the reader needs to answer: the folders, the options, the cursor key, and the system. */
export interface WorkerData {
  roots: Root[];
  options: Options;
  key: Uint8Array;
  platform: NodeJS.Platform;
}

export interface Job {
  tool: ToolName;
  args: unknown;
}

export type JobResult = { ok: object } | { refused: string; extra?: object };

export const CALL_LIMIT_MS = 10_000;
/** How long a new reader may take to start, apart from the call's own limit. */
const START_LIMIT_MS = 10_000;

export const TOO_LONG =
  'That took longer than 10 seconds, so Drafter stopped it. Ask for less at once: one scene, one act, or one folder.';
/** A worker that wouldn't start or stopped by itself: never its error's text, which may hold a path. */
export const STOPPED = 'Drafter couldn’t finish reading that. Try again, or ask for less at once.';

/** The message a worker sends when it is ready, and its answers. */
type Message = { ready: true } | { id: number; result: JobResult };

export class ReaderPool {
  readonly #spec: WorkerSpec;
  readonly #data: WorkerData;
  readonly #limitMs: number;
  #worker: Worker | undefined;
  #ready: Promise<Worker> | undefined;
  /** The call waiting on the worker, if any: there is only ever one. */
  #waiting: { id: number; done: (result: JobResult) => void } | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  #nextId = 0;

  constructor(spec: WorkerSpec, data: WorkerData, limitMs: number = CALL_LIMIT_MS) {
    this.#spec = spec;
    this.#data = data;
    this.#limitMs = limitMs;
  }

  /** Runs a call after any before it; a timeout stops the worker and refuses with TOO_LONG. */
  run(job: Job): Promise<JobResult> {
    const result = this.#queue.then(() => this.#runOne(job));
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async close(): Promise<void> {
    const worker = this.#worker;
    this.#worker = undefined;
    this.#ready = undefined;
    await worker?.terminate();
  }

  async #runOne(job: Job): Promise<JobResult> {
    if (this.#spec === 'inline') return handle(job, this.#data);
    try {
      return await this.#call(job);
    } finally {
      // Between calls, a waiting worker doesn't keep the program running once the AI app has
      // gone; during one (its start included), it does.
      this.#worker?.unref();
    }
  }

  async #call(job: Job): Promise<JobResult> {
    let worker: Worker;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Starting isn't part of the call's time, but a reader that never starts stops the call too.
      worker = await Promise.race([
        this.#start(),
        new Promise<never>((_, reject) => {
          startTimer = setTimeout(
            () => reject(new Error('the reader didn’t start')),
            START_LIMIT_MS,
          );
        }),
      ]);
    } catch {
      if (this.#worker) this.#stop(this.#worker);
      return { refused: STOPPED };
    } finally {
      clearTimeout(startTimer);
    }
    worker.ref();
    return new Promise<JobResult>((resolve) => {
      const id = ++this.#nextId;
      const timer = setTimeout(() => {
        this.#waiting = undefined;
        this.#stop(worker);
        resolve({ refused: TOO_LONG });
      }, this.#limitMs);
      this.#waiting = {
        id,
        done: (result) => {
          clearTimeout(timer);
          this.#waiting = undefined;
          resolve(result);
        },
      };
      worker.postMessage({ id, job });
    });
  }

  /** The worker, started if there is none, once it says it is ready. */
  #start(): Promise<Worker> {
    if (this.#ready) return this.#ready;
    const spec = this.#spec as Exclude<WorkerSpec, 'inline'>;
    const worker = new Worker(spec.url, {
      execArgv: [...spec.execArgv],
      workerData: { drafterReader: this.#data },
    });
    this.#worker = worker;
    const mine = () => this.#worker === worker;
    this.#ready = new Promise<Worker>((resolve, reject) => {
      worker.on('message', (message: Message) => {
        if (!mine()) return;
        if ('ready' in message) resolve(worker);
        else if (this.#waiting?.id === message.id) this.#waiting.done(message.result);
      });
      const gone = () => {
        if (!mine()) return;
        this.#worker = undefined;
        this.#ready = undefined;
        reject(new Error('the reader stopped'));
        this.#waiting?.done({ refused: STOPPED });
      };
      worker.on('error', gone);
      worker.on('exit', gone);
    });
    // Nobody may be waiting on it when it fails.
    this.#ready.catch(() => undefined);
    return this.#ready;
  }

  #stop(worker: Worker): void {
    if (this.#worker === worker) {
      this.#worker = undefined;
      this.#ready = undefined;
    }
    void worker.terminate();
  }
}
