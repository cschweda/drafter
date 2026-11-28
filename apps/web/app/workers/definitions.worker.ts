// Looks words up off the main thread (definitions design §7.3): the dictionary (about 90 MB once
// parsed) lives here, and the worker is ended after a while unused, which gives the memory back.
import { readDefinitions } from '../definitions/store';
import { createDefinitionsWorker, type DefinitionsRequest } from './definitions-compute';

const worker = createDefinitionsWorker(readDefinitions);

self.addEventListener('message', async (event: MessageEvent<DefinitionsRequest>) => {
  self.postMessage(await worker.handle(event.data));
});
