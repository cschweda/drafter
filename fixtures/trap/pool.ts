// Runs one trap at a time in a worker thread (worker/run.ts), and stops it from outside: at the
// trap's time limit, or when the worker's heap grows past the bound, the worker is terminated and
// the trap fails. So a loop, a quadratic regression, or a parse that grows without end fails its
// test instead of stalling the runner. The worker's heap is sampled from here while the trap runs,
// synchronous parsing included (`Worker.getHeapStatistics` is answered between the worker's own
// steps). A stopped worker is replaced for the next trap.
import { Worker } from 'node:worker_threads';
import type { Answer, Job } from './worker/run';

export interface Ran {
  answer?: Answer;
  /** Stopped at the time limit. */
  timedOut?: boolean;
  /** Stopped when its heap passed the bound. */
  overMemory?: boolean;
  /** What the worker threw, or why it died. */
  error?: string;
  /** The most its heap grew while it ran, sampled, garbage included. */
  peak: number;
}

const HOOKS = new URL('./worker/register.mjs', import.meta.url).href;
const MAIN = new URL('./worker/run.ts', import.meta.url);
/** How long past its limit a trap is given before it is stopped: the messages' own time. */
const GRACE_MS = 500;

type Message = { ready: true } | { ok: Answer } | { error: string };

export class TrapRunner {
  #worker: Worker | undefined;
  #ready: Promise<void> | undefined;
  #listener: ((message: Message) => void) | undefined;
  #onExit: ((why: string) => void) | undefined;

  #start(): Promise<void> {
    const worker = new Worker(MAIN, {
      execArgv: ['--experimental-transform-types', '--no-warnings', '--import', HOOKS],
      // A backstop past every bound below: the worker dies of it, not the test runner.
      resourceLimits: { maxOldGenerationSizeMb: 4096 },
    });
    this.#worker = worker;
    // Only the current worker is heard: one stopped for an earlier trap may still be exiting.
    const mine = () => this.#worker === worker;
    worker.on('message', (message: Message) => {
      if (mine()) this.#listener?.(message);
    });
    worker.on('error', (error) => {
      if (mine()) this.#onExit?.(error.stack ?? String(error));
    });
    worker.on('exit', (code) => {
      if (!mine()) return;
      this.#worker = undefined;
      this.#onExit?.(`the worker exited (${code})`);
    });
    this.#ready = new Promise((resolve, reject) => {
      this.#listener = (message) => {
        if ('ready' in message) resolve();
      };
      this.#onExit = (why) => reject(new Error(why));
    });
    return this.#ready;
  }

  /** Runs `job`, stopping it at `limitMs` (and the grace), or when its heap grows past `peakBound` bytes. */
  async run(job: Job, limitMs: number, peakBound: number): Promise<Ran> {
    if (!this.#worker) await this.#start();
    else await this.#ready;
    const worker = this.#worker as Worker;
    const heap = async () => {
      const s = await worker.getHeapStatistics();
      return s.used_heap_size + s.external_memory;
    };
    const base = await heap();
    let peak = 0;
    return new Promise<Ran>((resolve) => {
      let done = false;
      let sampling = false;
      const finish = (ran: Omit<Ran, 'peak'>, stop = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(sampler);
        this.#listener = undefined;
        this.#onExit = undefined;
        if (stop) {
          this.#worker = undefined;
          void worker.terminate();
        }
        resolve({ ...ran, peak });
      };
      const timer = setTimeout(() => finish({ timedOut: true }, true), limitMs + GRACE_MS);
      const sampler = setInterval(() => {
        if (sampling) return;
        sampling = true;
        heap()
          .then((now) => {
            peak = Math.max(peak, now - base);
            if (peak > peakBound) finish({ overMemory: true }, true);
          })
          .catch(() => {})
          .finally(() => {
            sampling = false;
          });
      }, 5);
      this.#listener = (message) => {
        if ('ok' in message) finish({ answer: message.ok });
        else if ('error' in message) finish({ error: message.error });
      };
      this.#onExit = (why) => finish({ error: why });
      worker.postMessage(job);
    });
  }

  async close(): Promise<void> {
    const worker = this.#worker;
    this.#worker = undefined;
    await worker?.terminate();
  }
}
