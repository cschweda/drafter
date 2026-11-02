// A stand-in reader for the pool's tests: `{ tool: 'spin' }` never finishes; `exit` stops the
// thread mid-call; `limits` answers with the thread's resource limits; anything else answers with
// the worker's thread ID, so a test can tell whether the same worker answered twice.
import { parentPort, resourceLimits, threadId } from 'node:worker_threads';

parentPort?.on('message', (message: { id: number; job: { tool: string } }) => {
  if (message.job.tool === 'spin') for (;;);
  if (message.job.tool === 'exit') process.exit(1);
  if (message.job.tool === 'limits') {
    parentPort?.postMessage({ id: message.id, result: { ok: { resourceLimits } } });
    return;
  }
  parentPort?.postMessage({ id: message.id, result: { ok: { threadId } } });
});
parentPort?.postMessage({ ready: true });
