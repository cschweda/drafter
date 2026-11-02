// A stand-in reader for the pool's tests: `{ tool: 'spin' }` never finishes; anything else answers
// with the worker's thread ID, so a test can tell whether the same worker answered twice.
import { parentPort, threadId } from 'node:worker_threads';

parentPort?.on('message', (message: { id: number; job: { tool: string } }) => {
  if (message.job.tool === 'spin') for (;;);
  parentPort?.postMessage({ id: message.id, result: { ok: { threadId } } });
});
parentPort?.postMessage({ ready: true });
