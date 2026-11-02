// The reader: the only place tool code runs (§7.2). In the program it is a worker thread the
// server's ReaderPool starts from this same file; each message is one call, answered in turn.
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Refused } from '@drafter/archive/node';
import { LoadCache } from './cache';
import type { Include } from './envelope';
import { Refusal } from './paths';
import type { Job, JobResult, WorkerData } from './pool';
import { type Loaded, TOOLS } from './tools/index';

/** Any failure that isn't a refusal: never its own text, which may hold a path or a script's words. */
export const WENT_WRONG = 'Drafter couldn’t read that. Try again, or ask for less at once.';
export const BAD_ARGUMENTS = 'Those arguments don’t fit the tool.';

/** Each reader's parsed files, kept with its data, in memory only. */
const caches = new WeakMap<WorkerData, LoadCache<Loaded>>();

function cacheFor(data: WorkerData): LoadCache<Loaded> {
  let cache = caches.get(data);
  if (!cache) {
    cache = new LoadCache<Loaded>();
    caches.set(data, cache);
  }
  return cache;
}

/** Runs one call: its tool's `run`, with a refusal (a Refusal, or a file refused) as its words. */
export async function handle(job: Job, data: WorkerData): Promise<JobResult> {
  const tool = TOOLS.find((each) => each.name === job.tool);
  if (!tool) return { refused: `There’s no tool called ${String(job.tool)}.` };
  // The server checked the arguments already; checked again here, where they are used.
  const parsed = tool.input.safeParse(job.args);
  if (!parsed.success) return { refused: BAD_ARGUMENTS };
  const ctx = {
    data,
    cache: cacheFor(data),
    include(args: { include?: Include }): Include {
      const wanted = new Set(args.include ?? []);
      if (data.options.notes) wanted.add('notes');
      if (data.options.boneyard) wanted.add('boneyard');
      return (['notes', 'boneyard'] as const).filter((kind) => wanted.has(kind));
    },
  };
  try {
    return { ok: await tool.run(parsed.data, ctx) };
  } catch (error) {
    if (error instanceof Refusal)
      return error.matches
        ? { refused: error.message, extra: { matches: error.matches } }
        : { refused: error.message };
    if (error instanceof Refused) return { refused: `Can’t read that file: ${error.message}.` };
    return { refused: WENT_WRONG };
  }
}

let running = false;

/** Answers calls from the pool: `{ id, job }` in, `{ id, result }` out, after `{ ready: true }`. */
export function runWorker(): void {
  const port = parentPort;
  if (running || !port) return;
  running = true;
  const data = (workerData as { drafterReader: WorkerData }).drafterReader;
  port.on('message', async (message: { id: number; job: Job }) => {
    const result = await handle(message.job, data);
    port.postMessage({ id: message.id, result });
  });
  port.postMessage({ ready: true });
}

// Started by a ReaderPool (from this file, or from the program's one file through bin.ts).
if (!isMainThread && (workerData as { drafterReader?: unknown } | null)?.drafterReader) runWorker();
