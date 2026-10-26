export interface Writer {
  /** Writes `source` 750 ms after the last call, or after 5 s of continuous calls. */
  schedule(source: string): void;
  /** Writes what's pending now, after any write in flight; rejects if that write fails. */
  flush(): Promise<void>;
  /** Drops the pending text and its timers, for a script that is being removed. The writer writes nothing more, even if the write in flight fails; `flush` waits for that write. */
  discard(): void;
  /** There is text that hasn't been written yet, or is being written. */
  readonly pending: boolean;
}

/**
 * A trailing debounce with a maximum wait (technical design §8.2), and one write
 * at a time: a write that comes due while another runs waits for it, and writes
 * the latest text. A failed write keeps its text pending, so the next `flush` or
 * `schedule` writes it again; a timed write's error is the caller's `write` to
 * report, since nothing is waiting on it.
 */
export function createWriter(
  write: (source: string) => Promise<void>,
  options: { delay?: number; maxWait?: number } = {},
): Writer {
  const delay = options.delay ?? 750;
  const maxWait = options.maxWait ?? 5000;

  let queued: string | null = null;
  let dead = false;
  let writing = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let ceiling: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();

  function clearTimers(): void {
    clearTimeout(debounce);
    clearTimeout(ceiling);
    debounce = undefined;
    ceiling = undefined;
  }

  async function writeOnce(): Promise<void> {
    if (queued === null) return;
    const source = queued;
    queued = null;
    writing = true;
    try {
      await write(source);
    } catch (error) {
      // Newer text, if any, supersedes this; otherwise it's still unwritten.
      if (queued === null && !dead) queued = source;
      throw error;
    } finally {
      writing = false;
    }
  }

  function enqueue(): Promise<void> {
    clearTimers();
    const run = chain.then(writeOnce);
    chain = run.catch(() => {});
    return run;
  }

  return {
    schedule(source) {
      if (dead) return;
      queued = source;
      clearTimeout(debounce);
      debounce = setTimeout(() => void enqueue().catch(() => {}), delay);
      ceiling ??= setTimeout(() => void enqueue().catch(() => {}), maxWait);
    },
    flush: enqueue,
    discard() {
      dead = true;
      clearTimers();
      queued = null;
    },
    get pending() {
      return queued !== null || writing;
    },
  };
}
