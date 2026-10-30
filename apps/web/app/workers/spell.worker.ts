// Checks spelling off the main thread (Plan D, Call 5): the dictionary is loaded, the text parsed,
// and every word checked here, so typing never waits on the checker.
import { createSpellWorker, type SpellRequest } from './spell-compute';

const worker = createSpellWorker();

self.addEventListener('message', async (event: MessageEvent<SpellRequest>) => {
  const reply = await worker.handle(event.data);
  if (reply) self.postMessage(reply);
});
